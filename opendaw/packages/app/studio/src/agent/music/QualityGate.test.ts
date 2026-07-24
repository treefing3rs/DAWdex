import {describe, expect, it} from "vitest"
import {hasDuplicateMidiFingerprint} from "./QualityGate"

const existing = [
    {id: "drums", fingerprint: "midi-a"},
    {id: "bass", fingerprint: "midi-b"}
]

describe("QualityGate", () => {
    it("blocks a duplicate candidate from becoming a new track", () => {
        expect(hasDuplicateMidiFingerprint("midi-a", existing)).toBe(true)
    })

    it("allows a replacement to exclude its own old fingerprint", () => {
        expect(hasDuplicateMidiFingerprint("midi-a", existing, "drums")).toBe(false)
        expect(hasDuplicateMidiFingerprint("midi-b", existing, "drums")).toBe(true)
    })
})
