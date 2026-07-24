import {describe, expect, it} from "vitest"
import {DawProjectSnapshot, MusicRole, ProjectTrackSnapshot, SupportedStyle} from "./AgentProtocol"
import {LocalMusicPlanner} from "./LocalMusicPlanner"

const track = (
    id: string,
    role: MusicRole,
    style: SupportedStyle,
    midiFingerprint: string
): ProjectTrackSnapshot => ({
    id,
    name: `DAWdex ${role}`,
    trackCount: 1,
    regionCount: 1,
    generated: true,
    role,
    style,
    midiFingerprint,
    regions: [{
        id: `${id}-region`,
        position: 0,
        duration: 7680,
        noteCount: 8,
        midiFingerprint
    }]
})

const snapshot = (
    bpm: number,
    style: SupportedStyle,
    prefix: string
): DawProjectSnapshot => ({
    hasProject: true,
    bpm,
    tracks: [
        track(`${prefix}-drums`, "drums", style, `${prefix}-drums-midi`),
        track(`${prefix}-bass`, "bass", style, `${prefix}-bass-midi`),
        track(`${prefix}-keys`, "keys", style, `${prefix}-keys-midi`)
    ]
})

describe("LocalMusicPlanner", () => {
    it("creates a complete seeded Dubstep band from an empty project", () => {
        const plan = LocalMusicPlanner.create(
            "帮我制作一个 Dubstep，四小节，要有压迫感。",
            {hasProject: false, bpm: 120, tracks: []}
        )
        expect(plan.brief).toMatchObject({
            intent: "create",
            style: "dubstep",
            bpm: 140,
            bars: 4,
            targetRoles: ["drums", "bass", "keys"]
        })
        expect(plan.actions[0]).toEqual({type: "set-tempo", bpm: 140})
        expect(plan.actions.slice(1)).toEqual([
            expect.objectContaining({type: "upsert-role-track", mode: "create", role: "drums", style: "dubstep"}),
            expect.objectContaining({type: "upsert-role-track", mode: "create", role: "bass", style: "dubstep"}),
            expect.objectContaining({type: "upsert-role-track", mode: "create", role: "keys", style: "dubstep"})
        ])
        const seeds = plan.actions
            .filter(action => action.type === "upsert-role-track")
            .map(action => action.seed)
        expect(new Set(seeds).size).toBe(3)
    })

    it("restyles Dubstep by replacing the three located role tracks", () => {
        const plan = LocalMusicPlanner.create("帮我改成 R&B 风格。", snapshot(140, "dubstep", "dub"))
        expect(plan.brief).toMatchObject({
            intent: "restyle",
            style: "rnb",
            bpm: 82,
            preserveTrackIds: [],
            targetRoles: ["drums", "bass", "keys"]
        })
        expect(plan.actions[0]).toEqual({type: "set-tempo", bpm: 82})
        expect(plan.actions.slice(1)).toEqual([
            expect.objectContaining({mode: "replace", targetTrackId: "dub-drums", role: "drums", style: "rnb"}),
            expect.objectContaining({mode: "replace", targetTrackId: "dub-bass", role: "bass", style: "rnb"}),
            expect.objectContaining({mode: "replace", targetTrackId: "dub-keys", role: "keys", style: "rnb"})
        ])
    })

    it("preserves Keys and replaces only Drums after the R&B restyle", () => {
        const plan = LocalMusicPlanner.create(
            "保留和弦，只把鼓变得更松一点。",
            snapshot(82, "rnb", "rnb")
        )
        expect(plan.brief).toMatchObject({
            intent: "modify",
            style: "rnb",
            preserveTrackIds: ["rnb-keys"],
            targetRoles: ["drums"]
        })
        expect(plan.actions).toEqual([
            expect.objectContaining({
                type: "upsert-role-track",
                mode: "replace",
                targetTrackId: "rnb-drums",
                role: "drums",
                style: "rnb",
                density: 0.48
            })
        ])
    })

    it("keeps add semantics as a new layer instead of replacing the role", () => {
        const plan = LocalMusicPlanner.create("再添加一层贝斯", snapshot(82, "rnb", "rnb"))
        expect(plan.brief.intent).toBe("add")
        expect(plan.actions).toEqual([
            expect.objectContaining({
                type: "upsert-role-track",
                mode: "create",
                targetTrackId: null,
                role: "bass"
            })
        ])
    })

    it("regresses Dubstep → R&B → keep Keys and change only Drums", () => {
        const createDubstep = LocalMusicPlanner.create(
            "制作一个 Dubstep",
            {hasProject: false, bpm: 120, tracks: []}
        )
        expect(createDubstep.actions.filter(action => action.type === "upsert-role-track"))
            .toHaveLength(3)

        const restyleRnb = LocalMusicPlanner.create(
            "改成 R&B",
            snapshot(140, "dubstep", "live")
        )
        const replacements = restyleRnb.actions
            .filter(action => action.type === "upsert-role-track")
        expect(replacements.map(action => action.targetTrackId)).toEqual([
            "live-drums", "live-bass", "live-keys"
        ])

        const changeDrums = LocalMusicPlanner.create(
            "保留 Keys，只改 Drum",
            snapshot(82, "rnb", "live")
        )
        expect(changeDrums.brief.preserveTrackIds).toEqual(["live-keys"])
        expect(changeDrums.actions).toEqual([
            expect.objectContaining({
                role: "drums",
                targetTrackId: "live-drums",
                mode: "replace"
            })
        ])
    })
})
