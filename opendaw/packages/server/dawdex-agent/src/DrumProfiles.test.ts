import {describe, expect, it} from "vitest"
import {analyzeDrumCoverage, canonicalDrumRole, drumSourceProfile} from "./DrumProfiles.ts"

describe("drum source profiles", () => {
    it("maps the verified GM core to canonical roles", () => {
        const profile = drumSourceProfile("drums/MIDI/000333@EDM_GROOVES/groove.mid")
        expect(canonicalDrumRole(profile, 38)).toBe("snare")
        expect(canonicalDrumRole(profile, 41)).toBe("low-tom")
        expect(canonicalDrumRole(profile, 69)).toBe("unsupported")
    })

    it("counts unknown EZX articulations instead of folding them", () => {
        const result = analyzeDrumCoverage(
            "drums/EZX2_Custom/Midi/clip.mid",
            [36, 38, 42, 69, 88]
        )
        expect(result.mappedHits).toBe(3)
        expect(result.unsupportedHits).toBe(2)
        expect(result.coverage).toBeCloseTo(0.6)
    })
})
