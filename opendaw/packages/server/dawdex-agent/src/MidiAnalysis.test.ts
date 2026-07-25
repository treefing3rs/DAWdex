import {describe, expect, it} from "vitest"
import {analyzeMidi, type ParsedMidi} from "./MidiAnalysis.ts"

const parsed = (pitches: ReadonlyArray<number>): ParsedMidi => ({
    timeDivision: 480,
    maxTicks: 1920,
    tempo: 120,
    meter: "4/4",
    notes: pitches.map((pitch, index) => ({tick: index * 120, pitch, velocity: 96, channel: 0}))
})

describe("MIDI musical analysis", () => {
    it("keeps harmonic signatures invariant under global transposition", () => {
        const c = analyzeMidi(parsed([60, 64, 67, 65, 69, 72, 67, 71, 74]), "keys", "keys/a.mid")
        const d = analyzeMidi(parsed([62, 66, 69, 67, 71, 74, 69, 73, 76]), "keys", "keys/b.mid")
        expect(c.keyMode).toBe(d.keyMode)
        expect(c.harmonicSignature).toBe(d.harmonicSignature)
    })

    it("does not report a certain key for empty or ambiguous material", () => {
        const result = analyzeMidi(parsed([]), "keys", "keys/empty.mid")
        expect(result.keyRoot).toBeNull()
        expect(result.keyConfidence).toBe(0)
    })
})
