import {describe, expect, it} from "vitest"
import {z} from "zod"
import {
    CodexPlanOutputSchema,
    CreativeBriefSchema,
    CREATIVE_DIRECTOR_INSTRUCTIONS,
    createCreativeDirectorInput,
    DawControlActionSchema,
    parseCodexPlan,
    PlanOutputSchema
} from "./MusicPlan.ts"

const emptyProject = {
    hasProject: false,
    bpm: 120,
    tracks: []
}

describe("CreativeBrief", () => {
    it("accepts an open-ended style inferred from an amateur mood request", () => {
        const brief = CreativeBriefSchema.parse({
            intent: "create",
            style: "neo-soul",
            styleAlternatives: ["contemporary R&B", "jazz ballad"],
            moods: ["romantic", "warm", "late-night"],
            decisionSummary: "浪漫和夜晚感更适合温暖、留白较多的 neo-soul。",
            instrumentation: ["laid-back drums", "conversational bass", "Rhodes keys"],
            bpm: 78,
            key: "D minor",
            bars: 8,
            energy: 0.42,
            swing: 0.38,
            preserveTrackIds: [],
            targetRoles: ["drums", "bass", "keys"],
            searchTerms: {
                drums: ["neo soul", "r&b", "laid back", "swing"],
                bass: ["soul", "r&b", "groove"],
                keys: ["rhodes", "soul", "jazz"]
            }
        })

        expect(brief.style).toBe("neo-soul")
        expect(brief.styleAlternatives).toContain("jazz ballad")
    })

    it("does not instruct the model to choose from a Dubstep/R&B whitelist", () => {
        const input = createCreativeDirectorInput("给我一段浪漫的音乐", emptyProject)

        expect(CREATIVE_DIRECTOR_INSTRUCTIONS).toContain("Genre is not a whitelist")
        expect(input).toContain("给我一段浪漫的音乐")
        expect(input).toContain("bossa nova")
        expect(input).not.toContain("only dubstep")
        expect(input).not.toContain("only rnb")
    })

    it("accepts House directly instead of downgrading it to Dubstep", () => {
        const result = CreativeBriefSchema.safeParse({
            intent: "create",
            style: "House",
            styleAlternatives: ["French house", "disco house"],
            moods: ["uplifting"],
            decisionSummary: "A four-on-the-floor House groove matches the requested pulse.",
            instrumentation: ["four-on-the-floor drums", "syncopated bass", "piano stabs"],
            bpm: 124,
            key: "A minor",
            bars: 8,
            energy: 0.72,
            swing: 0.08,
            preserveTrackIds: [],
            targetRoles: ["drums", "bass", "keys"],
            searchTerms: {
                drums: ["house", "dance", "four on the floor"],
                bass: ["house", "dance", "synth bass"],
                keys: ["house", "dance", "piano"]
            }
        })

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.style).toBe("House")
        }
    })

    it("accepts model-controlled synth, mixer, and effects for a retrieved MIDI action", () => {
        const result = PlanOutputSchema.safeParse({
            title: "Warm neo-soul keys",
            summary: "Use the selected real MIDI with a designed electric-key patch.",
            rationale: ["A slow envelope and restrained reverb leave room for the groove."],
            brief: {
                intent: "modify",
                style: "neo-soul",
                styleAlternatives: ["contemporary R&B"],
                moods: ["warm"],
                decisionSummary: "Warm keys support the requested mood.",
                instrumentation: ["electric keys"],
                bpm: 78,
                key: "D minor",
                bars: 8,
                energy: 0.42,
                swing: 0.38,
                preserveTrackIds: [],
                targetRoles: ["keys"]
            },
            actions: [{
                type: "upsert-role-track",
                mode: "replace",
                targetTrackId: "keys-track",
                role: "keys",
                style: "neo-soul",
                startBar: 1,
                bars: 8,
                rootMidi: 62,
                seed: 42,
                density: 0.6,
                energy: 0.42,
                midiAssetId: "keys-asset",
                midiAssetPath: "keys/neo-soul.mid",
                sound: {
                    instrument: {
                        kind: "vaporisateur",
                        presetLabel: "Warm Electric Keys",
                        parameters: {
                            attack: 0.03,
                            decay: 0.5,
                            sustain: 0.58,
                            release: 1.2,
                            cutoff: 4_800,
                            resonance: 0.24,
                            voicing: "poly",
                            unisonCount: 3,
                            unisonDetune: 8,
                            oscillator1: {waveform: "triangle", volumeDb: -7, octave: 0},
                            oscillator2: {waveform: "sine", volumeDb: -15, octave: 1},
                            noiseAttack: 0.001,
                            noiseHold: 0.001,
                            noiseRelease: 0.001,
                            noiseVolumeDb: -96
                        }
                    },
                    mixer: {volumeDb: -7, panning: 0.12, mute: false, solo: false},
                    effects: [{
                        kind: "reverb",
                        enabled: true,
                        preDelayMs: 24,
                        decay: 0.68,
                        damping: 0.58,
                        wetDb: -13
                    }, {
                        kind: "stereo",
                        enabled: true,
                        width: 0.62
                    }]
                }
            }]
        })

        expect(result.success).toBe(true)
        if (result.success) {
            const action = result.data.actions[0]
            expect(action.type).toBe("upsert-role-track")
            if (action.type === "upsert-role-track") {
                expect(action.sound.effects.map(effect => effect.kind)).toEqual(["reverb", "stereo"])
            }
        }
    })

    it("exports the sound design as a Codex structured-output schema", () => {
        const schema = z.toJSONSchema(CodexPlanOutputSchema)
        const serialized = JSON.stringify(schema)

        expect(serialized).toContain("\"sound\"")
        expect(serialized).toContain("\"effects\"")
        expect(serialized).toContain("\"compressor\"")
        expect(serialized).toContain("\"vaporisateur\"")
        expect(serialized).toContain("\"controls\"")
        expect(serialized).not.toContain("\"oneOf\"")
    })

    it("accepts the full flat DAW control envelope without arbitrary unvalidated payloads", () => {
        const result = DawControlActionSchema.safeParse({
            type: "control",
            command: "automation",
            operation: "replace",
            targetTrackId: "track-1",
            targetRegionId: null,
            targetDeviceId: "device-1",
            targetBusId: null,
            kind: "",
            name: "Filter sweep",
            assetId: "",
            index: 0,
            enabled: true,
            value: 0,
            secondaryValue: 0,
            seed: 0,
            parameters: [{
                key: "cutoff",
                numberValue: 0,
                stringValue: "",
                booleanValue: false
            }],
            points: [
                {bar: 1, unitValue: 0.2},
                {bar: 8, unitValue: 0.85}
            ]
        })

        expect(result.success).toBe(true)
    })

    it("merges Codex control actions into the approved DAW action list", () => {
        const control = {
            type: "control" as const,
            command: "transport" as const,
            operation: "play",
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
            points: []
        }
        const result = parseCodexPlan({
            title: "Play",
            summary: "Start playback after approval.",
            rationale: ["The user explicitly asked to play."],
            brief: {
                intent: "modify",
                style: "existing",
                styleAlternatives: [],
                moods: ["unchanged"],
                decisionSummary: "Keep the music unchanged and start playback.",
                instrumentation: ["existing arrangement"],
                bpm: 120,
                key: "C major",
                bars: 4,
                energy: 0.5,
                swing: 0,
                preserveTrackIds: [],
                targetRoles: ["keys"]
            },
            actions: [],
            controls: [control]
        })

        expect(result.actions).toEqual([control])
    })
})
