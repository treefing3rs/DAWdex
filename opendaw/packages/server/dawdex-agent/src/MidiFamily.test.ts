import {describe, expect, it} from "vitest"
import {parseMidiFamily} from "./MidiFamily.ts"

describe("parseMidiFamily", () => {
    it("keeps consecutive EZbass sections in one ordered family", () => {
        const paths = [
            "bass/MIDI/000500@EZbass/105@Straight_4#4/066-S011@Intro/Variation_01.mid",
            "bass/MIDI/000500@EZbass/105@Straight_4#4/066-S012@Verse/Variation_01.mid",
            "bass/MIDI/000500@EZbass/105@Straight_4#4/066-S013@Pre_Chorus/Variation_01.mid",
            "bass/MIDI/000500@EZbass/105@Straight_4#4/066-S014@Chorus/Variation_01.mid"
        ]
        const parsed = paths.map(path => parseMidiFamily(path, "bass"))
        expect(new Set(parsed.map(item => item.familyId)).size).toBe(1)
        expect(parsed.map(item => item.sectionOrder)).toEqual([1, 2, 3, 4])
        expect(parsed.map(item => item.sectionKind)).toEqual(["intro", "establish", "develop", "peak"])
    })

    it("does not merge equal numeric prefixes under different parents", () => {
        const a = parseMidiFamily("bass/MIDI/Pack_A/105@Straight_4#4/066-S011@Intro/a.mid", "bass")
        const b = parseMidiFamily("bass/MIDI/Pack_B/105@Straight_4#4/066-S011@Intro/a.mid", "bass")
        expect(a.familyId).not.toBe(b.familyId)
    })

    it("parses section names from keys filenames without inventing unknown families", () => {
        const intro = parseMidiFamily(
            "keys/MIDI/000970@Piano-Loops/000913@Pop_Piano/009@Song1_F_124bpm_Prog_1/Prog1_Song1_Intro.mid",
            "keys"
        )
        const outro = parseMidiFamily(
            "keys/MIDI/000970@Piano-Loops/000913@Pop_Piano/009@Song1_F_124bpm_Prog_1/Prog1_Song1_Outro.mid",
            "keys"
        )
        expect(intro.familyId).toBe(outro.familyId)
        expect([intro.sectionKind, outro.sectionKind]).toEqual(["intro", "outro"])
        expect(parseMidiFamily("keys/MIDI/random/clip.mid", "keys").familyId).toBeNull()
    })
})
