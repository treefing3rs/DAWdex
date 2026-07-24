/**
 * Quality gate — hard validation for MIDI note data before it enters the DAW.
 */

import {PPQN} from "@opendaw/lib-dsp"
import {CompiledNote} from "./MidiParser"

export type QualityGateResult = {
    readonly passed: boolean
    readonly violations: ReadonlyArray<string>
}

export type MusicRole = "drums" | "bass" | "keys"

// ─── Constants ───────────────────────────────────────────────────────────────

const PITCH_RANGES: Record<MusicRole, readonly [number, number]> = {
    drums: [35, 81],   // GM drum map range
    bass: [24, 60],    // C1 – C4
    keys: [48, 96]     // C3 – C7
}

const MAX_NOTES_PER_BAR = 32

// ─── Validation ──────────────────────────────────────────────────────────────

export const validateQuality = (
    notes: ReadonlyArray<CompiledNote>,
    role: MusicRole,
    bars: number
): QualityGateResult => {
    const violations: Array<string> = []
    const totalTicks = bars * PPQN.Bar
    const [pitchMin, pitchMax] = PITCH_RANGES[role]

    // Check empty
    if (notes.length === 0) {
        violations.push("No notes present")
        return {passed: false, violations}
    }

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i]

        // Pitch range (universal 0-127)
        if (note.pitch < 0 || note.pitch > 127) {
            violations.push(`Note ${i}: pitch ${note.pitch} outside valid MIDI range [0, 127]`)
        }

        // Role-specific pitch range
        if (note.pitch < pitchMin || note.pitch > pitchMax) {
            violations.push(`Note ${i}: pitch ${note.pitch} outside ${role} range [${pitchMin}, ${pitchMax}]`)
        }

        // Position must be non-negative
        if (note.position < 0) {
            violations.push(`Note ${i}: position ${note.position} is negative`)
        }

        // Duration must be positive
        if (note.duration <= 0) {
            violations.push(`Note ${i}: duration ${note.duration} is not positive`)
        }

        // Note must not extend past the end
        if (note.position + note.duration > totalTicks) {
            violations.push(
                `Note ${i}: extends past end (pos=${note.position} + dur=${note.duration} > ${totalTicks})`
            )
        }
    }

    // Note density check per bar
    for (let bar = 0; bar < bars; bar++) {
        const barStart = bar * PPQN.Bar
        const barEnd = barStart + PPQN.Bar
        const count = notes.filter(n => n.position >= barStart && n.position < barEnd).length
        if (count > MAX_NOTES_PER_BAR) {
            violations.push(`Bar ${bar + 1}: ${count} notes exceeds max density of ${MAX_NOTES_PER_BAR}`)
        }
    }

    return {passed: violations.length === 0, violations}
}
