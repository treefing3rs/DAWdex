import {describe, expect, it} from "vitest"
import {ClassicWaveform} from "@opendaw/lib-dsp"
import {VoicingMode} from "@opendaw/studio-enums"
import {RoleInstrumentProfiles} from "./RoleInstrumentProfiles"

describe("RoleInstrumentProfiles", () => {
    it("uses a percussive, noise-backed profile for drums", () => {
        for (const style of ["dubstep", "rnb"] as const) {
            const drums = RoleInstrumentProfiles[style].drums
            expect(drums.sustain).toBe(0)
            expect(drums.release).toBeLessThan(0.1)
            expect(drums.noise.volume).toBeGreaterThan(Number.NEGATIVE_INFINITY)
            expect(drums.voicingMode).toBe(VoicingMode.Polyphonic)
        }
    })

    it("uses a monophonic sub-focused profile for bass", () => {
        expect(RoleInstrumentProfiles.dubstep.bass.voicingMode).toBe(VoicingMode.Monophonic)
        expect(RoleInstrumentProfiles.rnb.bass.voicingMode).toBe(VoicingMode.Monophonic)
        expect(RoleInstrumentProfiles.dubstep.bass.cutoff).toBeLessThan(
            RoleInstrumentProfiles.rnb.bass.cutoff
        )
        expect(RoleInstrumentProfiles.rnb.bass.oscillators[0].waveform).toBe(ClassicWaveform.sine)
    })

    it("keeps Keys polyphonic and gives the two styles different synthesis", () => {
        const dubstep = RoleInstrumentProfiles.dubstep.keys
        const rnb = RoleInstrumentProfiles.rnb.keys
        expect(dubstep.voicingMode).toBe(VoicingMode.Polyphonic)
        expect(rnb.voicingMode).toBe(VoicingMode.Polyphonic)
        expect(dubstep.oscillators).not.toEqual(rnb.oscillators)
        expect(dubstep.cutoff).not.toBe(rnb.cutoff)
    })
})
