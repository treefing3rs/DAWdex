import {describe, expect, it} from "vitest"
import {
    CreativeBriefSchema,
    CREATIVE_DIRECTOR_INSTRUCTIONS,
    createCreativeDirectorInput
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
})
