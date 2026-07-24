import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {readFile} from "node:fs/promises"
import {resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {LocalMusicPlanner} from "./LocalMusicPlanner"
import type {AgentPlan, DawProjectSnapshot, MusicRole} from "./AgentProtocol"
import {compileMidiAsset} from "./music/MidiAsset"

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

const createSampleManager = () => ({
    getOrCreate: (uuid: UUID.Bytes) => ({
        get data() {return Option.None},
        get peaks() {return Option.None},
        get uuid() {return uuid},
        get state() {return {type: "idle"} as const},
        invalidate() {},
        subscribe: () => Terminable.Empty
    }),
    record: () => {},
    invalidate: () => {},
    remove: () => {},
    register: () => Terminable.Empty
})

const roleMap = (snapshot: DawProjectSnapshot) =>
    new Map(snapshot.tracks
        .filter((track): track is typeof track & {role: MusicRole} => track.generated && track.role !== null)
        .map(track => [track.role, track]))

const singleNoteMidi = (pitch: number): ArrayBuffer => new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B,
    0x00, 0x00, 0x00, 0x0D,
    0x00, 0x90, pitch, 0x64,
    0x83, 0x60, 0x80, pitch, 0x00,
    0x00, 0xFF, 0x2F, 0x00
]).buffer

const testAssetLoader = async (assetId: string): Promise<ArrayBuffer> => {
    const [, style, role, rawSeed] = assetId.split(":")
    const roleBase = role === "drums" ? 36 : role === "bass" ? 40 : 64
    const styleOffset = style === "rnb" ? 5 : 0
    const variation = Number(rawSeed) % 5
    return singleNoteMidi(roleBase + styleOffset + variation)
}

const actualAssets = new Map([
    ["drums", "drums/MIDI/000333@EDM_GROOVES/405@STRAIGHT_4#4/140-S053@DROP/Variation_03.mid"],
    ["bass", "bass/MIDI/000651@EBX_Synth_Bass/205@Straight_4#4/120-S052@Riffs/Variation_05.mid"],
    ["keys", "keys/EZkeys Library/MIDI/000915@DanceMidiSamples/03@DNS_Epic_Piano_Vol_2/"
        + "01@Epic_Piano_2/04_Dminor.mid"]
])

const actualAssetLoader = async (assetId: string): Promise<ArrayBuffer> => {
    const path = actualAssets.get(assetId)
    if (path === undefined) {throw new Error(`Unknown test asset ${assetId}`)}
    const root = fileURLToPath(new URL("../../../../../../midi/easy/", import.meta.url))
    const bytes = await readFile(resolve(root, path))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe("DawProjectAdapter", () => {
    it("restyles in place, preserves Keys during a Drum-only edit, and restores each change with one Undo",
        async () => {
            const {Project} = await import("@opendaw/studio-core")
            const {DawProjectAdapter} = await import("./DawProjectAdapter")
            const project = Project.fromSkeleton({
                audioContext: undefined,
                audioWorklets: undefined,
                sampleManager: createSampleManager(),
                soundfontManager: undefined,
                sampleService: undefined,
                soundfontService: undefined
            } as never, ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false}))
            const service = {
                hasProfile: true,
                project,
                newProject: async () => {}
            } as never
            const adapter = new DawProjectAdapter(service, testAssetLoader)

            try {
                const createResult = await adapter.apply(LocalMusicPlanner.create(
                    "帮我制作一个 Dubstep，四小节，要有压迫感。",
                    adapter.snapshot()
                ))
                expect(createResult.success).toBe(true)
                const dubstep = roleMap(adapter.snapshot())
                expect(Array.from(dubstep.keys()).sort()).toEqual(["bass", "drums", "keys"])
                expect(Array.from(dubstep.values()).every(track => track.style === "dubstep")).toBe(true)

                const restyleResult = await adapter.apply(LocalMusicPlanner.create(
                    "帮我改成 R&B 风格。",
                    adapter.snapshot()
                ))
                expect(restyleResult.success).toBe(true)
                const rnbSnapshot = adapter.snapshot()
                const rnb = roleMap(rnbSnapshot)
                expect(rnbSnapshot.tracks).toHaveLength(3)
                for (const role of ["drums", "bass", "keys"] as const) {
                    expect(rnb.get(role)?.id).toBe(dubstep.get(role)?.id)
                    expect(rnb.get(role)?.style).toBe("rnb")
                    expect(rnb.get(role)?.midiFingerprint).not.toBe(dubstep.get(role)?.midiFingerprint)
                }

                const modifyResult = await adapter.apply(LocalMusicPlanner.create(
                    "保留 Keys，只把鼓变得更松一点。",
                    adapter.snapshot()
                ))
                expect(modifyResult.success).toBe(true)
                const modified = roleMap(adapter.snapshot())
                expect(modified.get("keys")).toEqual(rnb.get("keys"))
                expect(modified.get("bass")).toEqual(rnb.get("bass"))
                expect(modified.get("drums")?.id).toBe(rnb.get("drums")?.id)
                expect(modified.get("drums")?.midiFingerprint).not.toBe(rnb.get("drums")?.midiFingerprint)

                expect(adapter.undo().success).toBe(true)
                expect(roleMap(adapter.snapshot())).toEqual(rnb)

                expect(adapter.undo().success).toBe(true)
                const restoredDubstep = roleMap(adapter.snapshot())
                for (const role of ["drums", "bass", "keys"] as const) {
                    expect(restoredDubstep.get(role)?.id).toBe(dubstep.get(role)?.id)
                    expect(restoredDubstep.get(role)?.style).toBe("dubstep")
                    expect(restoredDubstep.get(role)?.midiFingerprint).toBe(dubstep.get(role)?.midiFingerprint)
                }
            } finally {
                project.terminate()
            }
        })

    it("writes and verifies the real eight-bar MIDI assets selected for the House-like request", async () => {
        const {Project} = await import("@opendaw/studio-core")
        const {DawProjectAdapter} = await import("./DawProjectAdapter")
        const project = Project.fromSkeleton({
            audioContext: undefined,
            audioWorklets: undefined,
            sampleManager: createSampleManager(),
            soundfontManager: undefined,
            sampleService: undefined,
            soundfontService: undefined
        } as never, ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false}))
        const service = {
            hasProfile: true,
            project,
            newProject: async () => {}
        } as never
        const adapter = new DawProjectAdapter(service, actualAssetLoader)
        const drumNotes = compileMidiAsset(await actualAssetLoader("drums"), "drums", 8)
        expect(drumNotes
            .filter(note => !Number.isInteger(note.position) || !Number.isInteger(note.duration))
            .slice(0, 5)).toEqual([])
        const plan: AgentPlan = {
            id: "real-assets",
            prompt: "用可用素材制作 House 取向的四拍律动",
            title: "House-like test",
            summary: "Reproduce real MIDI verification.",
            rationale: [],
            brief: {
                intent: "create",
                style: "dubstep",
                styleAlternatives: ["house"],
                moods: ["energetic"],
                decisionSummary: "Use an electronic four-on-the-floor direction.",
                instrumentation: ["electronic drums", "synth bass", "piano"],
                bpm: 140,
                key: "D minor",
                bars: 8,
                energy: 0.8,
                swing: 0,
                preserveTrackIds: [],
                targetRoles: ["drums", "bass", "keys"]
            },
            actions: [
                {type: "set-tempo", bpm: 140},
                ...(["drums", "bass", "keys"] as const).map((role, index) => ({
                    type: "upsert-role-track" as const,
                    mode: "create" as const,
                    targetTrackId: null,
                    role,
                    style: "dubstep" as const,
                    startBar: 1,
                    bars: 8,
                    rootMidi: role === "drums" ? 36 : role === "bass" ? 38 : 62,
                    seed: index + 1,
                    density: 0.8,
                    energy: 0.8,
                    midiAssetId: role,
                    midiAssetPath: actualAssets.get(role)!
                }))
            ],
            source: "codex"
        }
        try {
            const result = await adapter.apply(plan)
            expect(result).toEqual(expect.objectContaining({success: true}))
            expect(adapter.snapshot().tracks).toHaveLength(3)
        } finally {
            project.terminate()
        }
    })
})
