import {describe, expect, it} from "vitest"
import {isDefined, Option, Terminable, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {LocalMusicPlanner} from "./LocalMusicPlanner"
import type {AgentPlan, DawControlAction, DawProjectSnapshot, MusicRole} from "./AgentProtocol"
import {compileMidiAsset} from "./music/MidiAsset"
import {createRoleTrackSound} from "./music/RoleInstrumentProfiles"

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

const controlAction = (overrides: Partial<DawControlAction>): DawControlAction => ({
    type: "control",
    command: "track",
    operation: "enable",
    targetTrackId: null,
    targetRegionId: null,
    targetDeviceId: null,
    targetBusId: null,
    kind: "",
    name: "",
    assetId: "",
    index: 0,
    enabled: false,
    value: 0,
    secondaryValue: 0,
    seed: 0,
    parameters: [],
    points: [],
    ...overrides
})

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
    if (!actualAssets.has(assetId)) {throw new Error(`Unknown test asset ${assetId}`)}
    return singleNoteMidi(assetId === "drums" ? 36 : assetId === "bass" ? 40 : 64)
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
                expect(dubstep.get("drums")?.sound.effects.map(effect => effect.kind))
                    .toEqual(["compressor"])
                expect(dubstep.get("bass")?.sound.effects.map(effect => effect.kind))
                    .toEqual(["compressor", "maximizer"])
                expect(dubstep.get("keys")?.sound.effects.map(effect => effect.kind))
                    .toEqual(["reverb", "stereo"])

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
                    expect(rnb.get(role)?.sound.fingerprint).not.toBe(dubstep.get(role)?.sound.fingerprint)
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

    it("writes and verifies eight-bar MIDI asset bytes returned by the library endpoint", async () => {
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
                    midiAssetPath: actualAssets.get(role)!,
                    sound: createRoleTrackSound(role, "dubstep")
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

    it("changes synth, effects, and mixer without rewriting identical MIDI, then undoes the sound edit", async () => {
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
            const createPlan = LocalMusicPlanner.create("Create Dubstep", adapter.snapshot())
            expect((await adapter.apply(createPlan)).success).toBe(true)
            const before = roleMap(adapter.snapshot())
            const keysBefore = before.get("keys")!
            const originalAction = createPlan.actions.find(action =>
                action.type === "upsert-role-track" && action.role === "keys")
            expect(originalAction?.type).toBe("upsert-role-track")
            if (originalAction?.type !== "upsert-role-track") {throw new Error("Missing keys action")}
            const sound = createRoleTrackSound("keys", "rnb")
            const soundOnlyPlan: AgentPlan = {
                ...createPlan,
                id: "sound-only",
                prompt: "Keep the notes, make the keys warmer and wider",
                brief: {
                    ...createPlan.brief,
                    intent: "modify",
                    preserveTrackIds: [before.get("drums")!.id, before.get("bass")!.id],
                    targetRoles: ["keys"]
                },
                actions: [{
                    ...originalAction,
                    mode: "replace",
                    targetTrackId: keysBefore.id,
                    sound: {
                        ...sound,
                        mixer: {...sound.mixer, volumeDb: -9, panning: 0.18}
                    }
                }]
            }

            expect((await adapter.apply(soundOnlyPlan)).success).toBe(true)
            const keysAfter = roleMap(adapter.snapshot()).get("keys")!
            expect(keysAfter.id).toBe(keysBefore.id)
            expect(keysAfter.midiFingerprint).toBe(keysBefore.midiFingerprint)
            expect(keysAfter.sound.fingerprint).not.toBe(keysBefore.sound.fingerprint)
            expect(keysAfter.sound.mixer.volumeDb).toBeCloseTo(-9)
            expect(keysAfter.sound.mixer.panning).toBeCloseTo(0.18)
            expect(keysAfter.sound.effects.map(effect => effect.kind)).toEqual(["reverb", "stereo"])

            expect(adapter.undo().success).toBe(true)
            expect(roleMap(adapter.snapshot()).get("keys")).toEqual(keysBefore)
        } finally {
            project.terminate()
        }
    })

    it("applies MIDI transforms, arbitrary native effects, device parameters, and automation as one undo step",
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
                const createPlan = LocalMusicPlanner.create("Create Dubstep", adapter.snapshot())
                expect((await adapter.apply(createPlan)).success).toBe(true)
                const before = roleMap(adapter.snapshot()).get("drums")!
                const channelStrip = before.devices!.find(device => device.category === "channel-strip")!
                const region = before.regions[0]
                const controls: AgentPlan = {
                    ...createPlan,
                    id: "full-control",
                    prompt: "Transpose the drums, add crusher, lower the fader and automate it",
                    brief: {...createPlan.brief, intent: "modify", targetRoles: ["drums"]},
                    actions: [
                        controlAction({
                            command: "track",
                            operation: "rename",
                            targetTrackId: before.id,
                            name: "Heavy Room Kit"
                        }),
                        controlAction({
                            command: "midi-transform",
                            operation: "transpose",
                            targetTrackId: before.id,
                            targetRegionId: region.id,
                            value: 2
                        }),
                        controlAction({
                            command: "effect",
                            operation: "add",
                            targetTrackId: before.id,
                            kind: "Crusher",
                            name: "DAWdex Texture",
                            index: 99,
                            enabled: true,
                            parameters: [{
                                key: "crush",
                                numberValue: 0.62,
                                stringValue: "",
                                booleanValue: false
                            }]
                        }),
                        controlAction({
                            command: "device-parameter",
                            operation: "set",
                            targetTrackId: before.id,
                            targetDeviceId: channelStrip.id,
                            parameters: [{
                                key: "volume",
                                numberValue: 0.42,
                                stringValue: "",
                                booleanValue: false
                            }]
                        }),
                        controlAction({
                            command: "automation",
                            operation: "replace",
                            targetTrackId: before.id,
                            targetDeviceId: channelStrip.id,
                            name: "Drum volume ride",
                            parameters: [{
                                key: "volume",
                                numberValue: 0,
                                stringValue: "",
                                booleanValue: false
                            }],
                            points: [
                                {bar: 1, unitValue: 0.35},
                                {bar: 3, unitValue: 0.72}
                            ]
                        })
                    ]
                }

                expect((await adapter.apply(controls)).success).toBe(true)
                const after = roleMap(adapter.snapshot()).get("drums")!
                expect(after.name).toContain("Heavy Room Kit")
                expect(after.role).toBe("drums")
                expect(after.style).toBe(before.style)
                expect(after.midiFingerprint).not.toBe(before.midiFingerprint)
                expect(after.devices!.some(device => device.kind === "Crusher")).toBe(true)
                expect(after.devices!
                    .find(device => device.category === "channel-strip")!
                    .parameters.find(parameter => parameter.key === "volume")?.automated).toBe(true)
                expect(after.trackCount).toBe(before.trackCount + 1)

                expect(adapter.undo().success).toBe(true)
                expect(roleMap(adapter.snapshot()).get("drums")).toEqual(before)
            } finally {
                project.terminate()
            }
        })

    it("creates an aux bus, connects a send, swaps instruments, and controls loop and transport", async () => {
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
        let playing = false
        let position = 0
        const engine = {
            play: () => {playing = true},
            stop: (reset = false) => {
                playing = false
                if (reset) {position = 0}
            },
            setPosition: (value: number) => {position = value},
            position: {getValue: () => position},
            isPlaying: {getValue: () => playing}
        }
        const service = {
            hasProfile: true,
            project,
            engine,
            newProject: async () => {}
        } as never
        const adapter = new DawProjectAdapter(service, testAssetLoader)
        try {
            const createPlan = LocalMusicPlanner.create("Create R&B", adapter.snapshot())
            expect((await adapter.apply(createPlan)).success).toBe(true)
            const drums = roleMap(adapter.snapshot()).get("drums")!
            const baseBusCount = adapter.snapshot().buses!.length
            const busPlan: AgentPlan = {
                ...createPlan,
                id: "create-bus",
                actions: [controlAction({
                    command: "bus",
                    operation: "create",
                    kind: "aux",
                    name: "DAWdex Drum Space",
                    value: -3
                })]
            }
            expect((await adapter.apply(busPlan)).success).toBe(true)
            const bus = adapter.snapshot().buses!.find(candidate => candidate.name === "DAWdex Drum Space")!
            expect(adapter.snapshot().buses).toHaveLength(baseBusCount + 1)

            const sendAndTransportPlan: AgentPlan = {
                ...createPlan,
                id: "send-and-transport",
                actions: [
                    controlAction({
                        command: "effect",
                        operation: "add",
                        targetBusId: bus.id,
                        kind: "Reverb",
                        name: "DAWdex Bus Reverb",
                        index: 0,
                        enabled: true
                    }),
                    controlAction({
                        command: "send",
                        operation: "upsert",
                        targetTrackId: drums.id,
                        targetBusId: bus.id,
                        value: -12,
                        secondaryValue: -0.15
                    }),
                    controlAction({
                        command: "loop",
                        operation: "set",
                        enabled: true,
                        value: 2,
                        secondaryValue: 4
                    }),
                    controlAction({
                        command: "transport",
                        operation: "seek",
                        value: 2
                    }),
                    controlAction({
                        command: "transport",
                        operation: "play"
                    })
                ]
            }
            expect((await adapter.apply(sendAndTransportPlan)).success).toBe(true)
            const controlled = roleMap(adapter.snapshot()).get("drums")!
            expect(controlled.sends).toEqual([expect.objectContaining({
                targetBusId: bus.id,
                gainDb: -12,
                panning: -0.15
            })])
            expect(adapter.snapshot().buses!
                .find(candidate => candidate.id === bus.id)!
                .effects.some(effect => effect.kind === "Reverb")).toBe(true)
            expect(adapter.snapshot().transport).toEqual(expect.objectContaining({
                playing: true,
                position: PPQN.Bar,
                loopEnabled: true,
                loopFrom: PPQN.Bar,
                loopTo: PPQN.Bar * 5
            }))

            const instrumentPlan: AgentPlan = {
                ...createPlan,
                id: "instrument-swap",
                actions: [controlAction({
                    command: "instrument",
                    operation: "replace",
                    targetTrackId: drums.id,
                    kind: "MIDIOutput",
                    name: "External Drum MIDI"
                })]
            }
            expect((await adapter.apply(instrumentPlan)).success).toBe(true)
            expect(roleMap(adapter.snapshot()).get("drums")?.sound.instrumentKind).toBe("MIDIOutputDeviceBox")
            expect(adapter.undo().success).toBe(true)
            expect(roleMap(adapter.snapshot()).get("drums")?.sound.instrumentKind).toBe("VaporisateurDeviceBox")
        } finally {
            project.terminate()
        }
    })
})
