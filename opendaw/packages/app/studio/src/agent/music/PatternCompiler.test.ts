import {describe, expect, it} from "vitest"
import {MusicRole, SupportedStyle} from "../AgentProtocol"
import {compileRolePattern, midiFingerprint} from "./PatternCompiler"

const fingerprint = (style: SupportedStyle, role: MusicRole, seed: number): string =>
    midiFingerprint(compileRolePattern({
        style,
        role,
        bars: 4,
        rootMidi: role === "drums" ? 36 : role === "bass" ? 38 : 50,
        seed,
        density: 0.7,
        energy: 0.8
    }))

describe("PatternCompiler", () => {
    it("makes Dubstep and R&B structurally different for every band role", () => {
        const roles = ["drums", "bass", "keys"] as const
        roles.forEach(role => {
            expect(fingerprint("dubstep", role, 17)).not.toBe(fingerprint("rnb", role, 17))
        })
    })

    it("gives drums, bass, and keys distinct MIDI fingerprints", () => {
        const fingerprints = (["drums", "bass", "keys"] as const)
            .map(role => fingerprint("dubstep", role, 29))
        expect(new Set(fingerprints).size).toBe(3)
    })

    it("reproduces the same seed and varies a different seed", () => {
        expect(fingerprint("rnb", "drums", 41)).toBe(fingerprint("rnb", "drums", 41))
        expect(fingerprint("rnb", "drums", 41)).not.toBe(fingerprint("rnb", "drums", 42))
    })

    it("keeps Dubstep keys sparse instead of emitting long 6415 chords", () => {
        const keys = compileRolePattern({
            style: "dubstep",
            role: "keys",
            bars: 4,
            rootMidi: 50,
            seed: 7,
            density: 0.55,
            energy: 0.8
        })
        expect(keys).toHaveLength(8)
        expect(new Set(keys.map(note => note.position)).size).toBe(2)
    })
})
