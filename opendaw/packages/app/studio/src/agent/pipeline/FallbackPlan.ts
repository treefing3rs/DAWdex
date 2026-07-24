/**
 * Fallback plan — energy-differentiated generative patterns.
 * Each energy level produces a clearly distinct musical character:
 *   LOW  = sparse, soft, half-time feel, open space
 *   MID  = standard groove, balanced density
 *   HIGH = busy, loud, double-time elements, fills
 *
 * All patterns: 120 BPM, C minor, 4 bars, 4/4.
 */

import {PPQN} from "@opendaw/lib-dsp"
import {CompiledNote} from "./MidiParser"
import {MusicRole, validateQuality} from "./QualityGate"
import {PreparedMusicPart} from "./MidiPipeline"

export type EnergyLevel = "low" | "mid" | "high"

const TICKS_PER_BAR = PPQN.Bar // 3840
const QUARTER = PPQN.Quarter   // 960
const EIGHTH = QUARTER / 2     // 480
const SIXTEENTH = QUARTER / 4  // 240

// ─── Drums ───────────────────────────────────────────────────────────────────
// GM: kick=36, snare=38, rimshot=37, hi-hat closed=42, hi-hat open=46,
//     ride=51, crash=49, tom-hi=48, tom-mid=45, tom-low=41

const buildDrums = (energy: EnergyLevel): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []

    for (let bar = 0; bar < 4; bar++) {
        const barStart = bar * TICKS_PER_BAR

        if (energy === "low") {
            // Sparse half-time: kick on 1, rimshot on 3, ride bell on quarters
            notes.push({position: barStart, duration: QUARTER, pitch: 36, velocity: 0.7})
            notes.push({position: barStart + 2 * QUARTER, duration: EIGHTH, pitch: 37, velocity: 0.55})
            // Ride on 1 and 3 only
            notes.push({position: barStart, duration: EIGHTH, pitch: 51, velocity: 0.45})
            notes.push({position: barStart + 2 * QUARTER, duration: EIGHTH, pitch: 51, velocity: 0.4})
            // Ghost open hat on & of 4 (sparse texture)
            if (bar % 2 === 1) {
                notes.push({position: barStart + 3 * QUARTER + EIGHTH, duration: EIGHTH, pitch: 46, velocity: 0.35})
            }
        } else if (energy === "mid") {
            // Standard rock: kick 1&3, snare 2&4, closed hats on 8ths
            for (let i = 0; i < 8; i++) {
                const pos = barStart + i * EIGHTH
                notes.push({position: pos, duration: EIGHTH * 0.5, pitch: 42, velocity: 0.6 + Math.random() * 0.1})
                if (i === 0 || i === 4) {
                    notes.push({position: pos, duration: EIGHTH, pitch: 36, velocity: 0.82})
                }
                if (i === 2 || i === 6) {
                    notes.push({position: pos, duration: EIGHTH, pitch: 38, velocity: 0.78})
                }
            }
            // Extra kick syncopation on bar 3
            if (bar === 2) {
                notes.push({position: barStart + 3 * QUARTER + EIGHTH, duration: EIGHTH, pitch: 36, velocity: 0.7})
            }
        } else {
            // HIGH: 16th hats, double kick, snare w/ ghost notes, crash on 1
            if (bar === 0) {
                notes.push({position: barStart, duration: QUARTER, pitch: 49, velocity: 0.9})
            }
            for (let i = 0; i < 16; i++) {
                const pos = barStart + i * SIXTEENTH
                // 16th hi-hats with accents on beats
                const accent = (i % 4 === 0) ? 0.8 : 0.5
                notes.push({position: pos, duration: SIXTEENTH * 0.4, pitch: 42, velocity: accent + Math.random() * 0.08})
                // Kick: 1, &of2, 3, &of4
                if (i === 0 || i === 5 || i === 8 || i === 13) {
                    notes.push({position: pos, duration: SIXTEENTH, pitch: 36, velocity: 0.9})
                }
                // Snare on 2 & 4
                if (i === 4 || i === 12) {
                    notes.push({position: pos, duration: SIXTEENTH, pitch: 38, velocity: 0.88})
                }
                // Ghost snares
                if (i === 3 || i === 7 || i === 11 || i === 15) {
                    notes.push({position: pos, duration: SIXTEENTH * 0.5, pitch: 38, velocity: 0.35})
                }
            }
            // Fill on bar 4: descending toms
            if (bar === 3) {
                const fillStart = barStart + 3 * QUARTER
                notes.push({position: fillStart, duration: SIXTEENTH, pitch: 48, velocity: 0.85})
                notes.push({position: fillStart + SIXTEENTH, duration: SIXTEENTH, pitch: 45, velocity: 0.82})
                notes.push({position: fillStart + 2 * SIXTEENTH, duration: SIXTEENTH, pitch: 41, velocity: 0.8})
                notes.push({position: fillStart + 3 * SIXTEENTH, duration: SIXTEENTH, pitch: 36, velocity: 0.9})
            }
        }
    }
    return notes
}

// ─── Bass ────────────────────────────────────────────────────────────────────
// C minor progression: Cm(C2=36) → Ab(Ab1=44) → Eb(Eb2=39) → Bb(Bb1=34) → G(G1=31)

const buildBass = (energy: EnergyLevel): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    // Different progressions per energy for harmonic variety
    const progressions: Record<EnergyLevel, number[]> = {
        low:  [36, 36, 44, 44],       // Cm → Cm → Ab → Ab (slow harmonic rhythm)
        mid:  [36, 44, 39, 46],       // Cm → Ab → Eb → Bb (standard)
        high: [36, 31, 44, 39]        // Cm → G → Ab → Eb (more tension with G)
    }
    const roots = progressions[energy]

    for (let bar = 0; bar < 4; bar++) {
        const barStart = bar * TICKS_PER_BAR
        const root = roots[bar]

        if (energy === "low") {
            // Whole notes, soft — just root on beat 1
            notes.push({position: barStart, duration: TICKS_PER_BAR * 0.9, pitch: root, velocity: 0.55})
        } else if (energy === "mid") {
            // Quarter note pattern with octave jump on beat 3
            notes.push({position: barStart, duration: QUARTER * 0.8, pitch: root, velocity: 0.75})
            notes.push({position: barStart + QUARTER, duration: QUARTER * 0.5, pitch: root, velocity: 0.6})
            notes.push({position: barStart + 2 * QUARTER, duration: QUARTER * 0.8, pitch: root + 12, velocity: 0.7})
            notes.push({position: barStart + 3 * QUARTER, duration: QUARTER * 0.5, pitch: root + 7, velocity: 0.6}) // fifth
        } else {
            // Driving 8th notes with chromatic approach notes
            for (let i = 0; i < 8; i++) {
                const pos = barStart + i * EIGHTH
                let pitch = root
                // Chromatic approach to next bar's root on last two 8ths
                if (i === 6) pitch = root + 1
                if (i === 7) pitch = root - 1
                // Octave alternation on off-beats
                if (i % 2 === 1 && i < 6) pitch = root + 12
                notes.push({
                    position: pos,
                    duration: EIGHTH * 0.75,
                    pitch,
                    velocity: (i === 0 ? 0.9 : 0.72) + Math.random() * 0.05
                })
            }
        }
    }
    return notes
}

// ─── Keys ────────────────────────────────────────────────────────────────────
// Voicings in C minor: Cm7, AbMaj7, EbMaj7, Bb7

const buildKeys = (energy: EnergyLevel): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []

    const chordSets: Record<EnergyLevel, number[][]> = {
        // LOW: open voicings, widely spaced, fewer notes
        low: [
            [48, 55],         // C5 + G3 (open fifth)
            [56, 63],         // Ab + Eb (open fifth)
            [51, 58],         // Eb + Bb
            [53, 60]          // F + C (sus feel)
        ],
        // MID: triads, standard voicings
        mid: [
            [48, 51, 55],     // Cm
            [44, 48, 51],     // Ab (1st inv)
            [51, 55, 58],     // Eb
            [46, 50, 53]      // Bb (1st inv)
        ],
        // HIGH: dense 7th chords + upper extensions
        high: [
            [48, 51, 55, 58, 62], // Cm9
            [44, 48, 51, 55, 60], // AbMaj9
            [51, 55, 58, 62, 65], // EbMaj9
            [46, 50, 53, 57, 60]  // Bb9
        ]
    }
    const chords = chordSets[energy]

    for (let bar = 0; bar < 4; bar++) {
        const barStart = bar * TICKS_PER_BAR
        const chord = chords[bar]

        if (energy === "low") {
            // Whole notes, very soft pad
            for (const pitch of chord) {
                notes.push({position: barStart, duration: TICKS_PER_BAR * 0.95, pitch, velocity: 0.4})
            }
        } else if (energy === "mid") {
            // Half-note rhythm (chord on 1, re-attack on 3)
            for (const pitch of chord) {
                notes.push({position: barStart, duration: 2 * QUARTER * 0.9, pitch, velocity: 0.6})
                notes.push({position: barStart + 2 * QUARTER, duration: 2 * QUARTER * 0.9, pitch, velocity: 0.55})
            }
        } else {
            // Rhythmic stabs on 8th note pattern: 1, &of2, 4
            const hitPositions = [0, QUARTER + EIGHTH, 3 * QUARTER]
            for (const offset of hitPositions) {
                for (const pitch of chord) {
                    notes.push({
                        position: barStart + offset,
                        duration: EIGHTH * 0.6,
                        pitch,
                        velocity: offset === 0 ? 0.85 : 0.72
                    })
                }
            }
            // Extra: arpeggio run in bar 2 and 4
            if (bar === 1 || bar === 3) {
                const arpStart = barStart + 2 * QUARTER
                chord.forEach((pitch, idx) => {
                    notes.push({
                        position: arpStart + idx * SIXTEENTH,
                        duration: SIXTEENTH * 0.8,
                        pitch,
                        velocity: 0.7
                    })
                })
            }
        }
    }
    return notes
}

// ─── Assembly ────────────────────────────────────────────────────────────────

const makePart = (role: MusicRole, energy: EnergyLevel, notes: ReadonlyArray<CompiledNote>): PreparedMusicPart => ({
    taskId: `generated-${role}-${energy}`,
    role,
    notes,
    transformReceipt: {
        sourceAssetId: `generated-${role}-${energy}`,
        operations: [`programmatic ${energy} pattern generation`]
    },
    quality: validateQuality(notes, role, 4)
})

/**
 * Build parts for a specific energy level. Each energy sounds distinctly different:
 * - LOW:  sparse, soft, half-time, open voicings
 * - MID:  standard groove, balanced
 * - HIGH: busy, loud, dense chords, syncopation, fills
 */
export const buildEnergyArrangement = (energy: EnergyLevel): ReadonlyArray<PreparedMusicPart> => [
    makePart("drums", energy, buildDrums(energy)),
    makePart("bass", energy, buildBass(energy)),
    makePart("keys", energy, buildKeys(energy))
]

/**
 * Returns a complete fallback arrangement (defaults to mid energy).
 */
export const getFallbackArrangement = (): ReadonlyArray<PreparedMusicPart> =>
    buildEnergyArrangement("mid")

/**
 * Returns a single fallback part for the given role (mid energy).
 */
export const getFallbackPart = (role: MusicRole): PreparedMusicPart =>
    makePart(role, "mid", role === "drums" ? buildDrums("mid") : role === "bass" ? buildBass("mid") : buildKeys("mid"))
