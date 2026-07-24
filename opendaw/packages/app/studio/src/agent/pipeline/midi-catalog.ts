/**
 * Demo MIDI asset catalog — fixed selection for 120 BPM, C minor, 4 bars, 4/4.
 * All source paths are relative to the DAWdex repo root.
 */

export type MidiAssetEntry = {
    readonly id: string
    readonly role: "drums" | "bass" | "keys"
    readonly energy: "low" | "mid" | "high"
    readonly bpm: number
    readonly key: string
    readonly scale: string
    readonly bars: number
    readonly sourcePath: string
    readonly needsCrop: boolean
    readonly transposeSteps: number
    readonly tags: ReadonlyArray<string>
}

export const MIDI_CATALOG: ReadonlyArray<MidiAssetEntry> = [
    // ─── Drums ───────────────────────────────────────────────────────────────────
    {
        id: "drums-low-verse-ezd3-v1",
        role: "drums",
        energy: "low",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/02_@EZDRUMMER_3/999405@STRAIGHT_4#4/120-S591@VERSE/Variation_01.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["verse", "straight", "simple"]
    },
    {
        id: "drums-low-verse-ezd3-v2",
        role: "drums",
        energy: "low",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/02_@EZDRUMMER_3/999405@STRAIGHT_4#4/120-S591@VERSE/Variation_02.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["verse", "straight", "simple", "variation"]
    },
    {
        id: "drums-mid-verse-rock-v1",
        role: "drums",
        energy: "mid",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/1905@EZX_ROCK!/405@STRAIGHT_4#4/120-S042@VERSE/Variation_01.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["verse", "rock", "driving"]
    },
    {
        id: "drums-mid-verse-rock-v2",
        role: "drums",
        energy: "mid",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/1905@EZX_ROCK!/405@STRAIGHT_4#4/120-S042@VERSE/Variation_02.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["verse", "rock", "driving", "variation"]
    },
    {
        id: "drums-high-chorus-ezd3-v1",
        role: "drums",
        energy: "high",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/02_@EZDRUMMER_3/999405@STRAIGHT_4#4/120-S592@CHORUS/Variation_01.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["chorus", "straight", "energetic"]
    },
    {
        id: "drums-high-chorus-ezd3-v2",
        role: "drums",
        energy: "high",
        bpm: 120,
        key: "none",
        scale: "none",
        bars: 4,
        sourcePath: "midi/easy/drums/MIDI/02_@EZDRUMMER_3/999405@STRAIGHT_4#4/120-S592@CHORUS/Variation_02.mid",
        needsCrop: false,
        transposeSteps: 0,
        tags: ["chorus", "straight", "energetic", "variation"]
    },
    // ─── Bass ────────────────────────────────────────────────────────────────────
    {
        id: "bass-low-prechorus-rock",
        role: "bass",
        energy: "low",
        bpm: 120,
        key: "C",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/bass/MIDI/000730@Basic_Rock/405@Straight_4#4/120-S073@Pre_Chorus/Variation_01.mid",
        needsCrop: true,
        transposeSteps: 0,
        tags: ["pre-chorus", "rock", "simple"]
    },
    {
        id: "bass-mid-verse-eighties",
        role: "bass",
        energy: "mid",
        bpm: 120,
        key: "C",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/bass/MIDI/000652@EBX_The_Eighties/205@Straight_4#4/120-S062@Verse/Variation_01.mid",
        needsCrop: true,
        transposeSteps: 0,
        tags: ["verse", "eighties", "melodic"]
    },
    {
        id: "bass-high-prechorus-rock-v3",
        role: "bass",
        energy: "high",
        bpm: 120,
        key: "C",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/bass/MIDI/000730@Basic_Rock/405@Straight_4#4/120-S073@Pre_Chorus/Variation_03.mid",
        needsCrop: true,
        transposeSteps: 0,
        tags: ["pre-chorus", "rock", "busy"]
    },
    // ─── Keys ────────────────────────────────────────────────────────────────────
    {
        id: "keys-low-epic-chords-cm",
        role: "keys",
        energy: "low",
        bpm: 120,
        key: "C",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/keys/MIDI/000915@DanceMidiSamples/04@DNS_Epic_Chords_Vol_2/01@Epic_Chords_2/36_Cminor.mid",
        needsCrop: true,
        transposeSteps: 0,
        tags: ["chords", "epic", "pad"]
    },
    {
        id: "keys-mid-epic-chords-em",
        role: "keys",
        energy: "mid",
        bpm: 120,
        key: "E",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/keys/MIDI/000915@DanceMidiSamples/04@DNS_Epic_Chords_Vol_2/01@Epic_Chords_2/32_Eminor.mid",
        needsCrop: true,
        transposeSteps: -4, // E → C = -4 semitones
        tags: ["chords", "epic", "transpose"]
    },
    {
        id: "keys-high-epic-piano-gm",
        role: "keys",
        energy: "high",
        bpm: 120,
        key: "G",
        scale: "minor",
        bars: 4,
        sourcePath: "midi/easy/keys/MIDI/000915@DanceMidiSamples/01@DNS_Epic_Piano_Vol_1/01@Epic_Piano_1/30_Gminor.mid",
        needsCrop: true,
        transposeSteps: -7, // G → C = -7 semitones
        tags: ["piano", "epic", "energetic", "transpose"]
    }
] as const
