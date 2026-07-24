import {describe, expect, it} from "vitest"
import {midiFingerprint} from "./PatternCompiler"

const notes = [
    {position: 0, duration: 480, pitch: 60, velocity: 0.8},
    {position: 960, duration: 240, pitch: 64, velocity: 0.7}
] as const

describe("midiFingerprint", () => {
    it("is deterministic and independent of note ordering", () => {
        expect(midiFingerprint(notes)).toBe(midiFingerprint(notes))
        expect(midiFingerprint(notes)).toBe(midiFingerprint(notes.toReversed()))
    })

    it("changes when imported MIDI content changes", () => {
        expect(midiFingerprint(notes)).not.toBe(midiFingerprint([
            notes[0],
            {...notes[1], pitch: 65}
        ]))
    })
})
