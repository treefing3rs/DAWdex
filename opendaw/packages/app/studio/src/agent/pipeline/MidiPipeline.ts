/**
 * Music Pipeline — retrieve MIDI assets, transform, validate, and prepare parts for the DAW.
 */

import {int, clamp} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {CompiledNote, loadMidiFile} from "./MidiParser"
import {MidiAssetEntry, MIDI_CATALOG} from "./midi-catalog"
import {MusicRole, QualityGateResult, validateQuality} from "./QualityGate"

// ─── Types ───────────────────────────────────────────────────────────────────

export type MusicOperation =
    | { readonly type: "retrieve-and-transform"; readonly energy: "low" | "mid" | "high" }

export type RoleTask = {
    readonly id: string
    readonly role: MusicRole
    readonly operation: MusicOperation
    readonly constraints: ReadonlyArray<string>
}

export type MidiTransformReceipt = {
    readonly sourceAssetId: string
    readonly operations: ReadonlyArray<string>
}

export type PreparedMusicPart = {
    readonly taskId: string
    readonly role: MusicRole
    readonly notes: ReadonlyArray<CompiledNote>
    readonly transformReceipt: MidiTransformReceipt
    readonly quality: QualityGateResult
}

// ─── Asset retrieval ─────────────────────────────────────────────────────────

export const retrieveAsset = (role: MusicRole, energy: "low" | "mid" | "high"): MidiAssetEntry | undefined => {
    const candidates = MIDI_CATALOG.filter(entry => entry.role === role && entry.energy === energy)
    if (candidates.length === 0) return undefined
    // Random selection among matching candidates for variety
    return candidates[Math.floor(Math.random() * candidates.length)]
}

// ─── Transform functions ─────────────────────────────────────────────────────

/**
 * Crop notes to the first N bars (based on ticks per beat from the file, default PPQN.Quarter).
 */
export const cropToBars = (
    notes: ReadonlyArray<CompiledNote>,
    bars: number,
    ticksPerBeat: number = PPQN.Quarter
): ReadonlyArray<CompiledNote> => {
    const barTicks = ticksPerBeat * 4 // 4 beats per bar in 4/4
    const maxTick = bars * barTicks
    return notes
        .filter(n => n.position < maxTick)
        .map(n => {
            const overflow = n.position + n.duration - maxTick
            if (overflow > 0) {
                return {...n, duration: n.duration - overflow}
            }
            return n
        })
}

/**
 * Transpose all pitches by N semitones (positive = up, negative = down).
 */
export const transpose = (notes: ReadonlyArray<CompiledNote>, steps: int): ReadonlyArray<CompiledNote> => {
    if (steps === 0) return notes
    return notes.map(n => ({...n, pitch: clamp(n.pitch + steps, 0, 127) as int}))
}

/**
 * Quantize note positions to the nearest grid tick.
 */
export const quantize = (notes: ReadonlyArray<CompiledNote>, gridTicks: number): ReadonlyArray<CompiledNote> => {
    if (gridTicks <= 0) return notes
    return notes.map(n => {
        const quantizedPosition = Math.round(n.position / gridTicks) * gridTicks
        return {...n, position: quantizedPosition}
    })
}

/**
 * Re-scale note positions/durations from the source file's ticks-per-beat to our internal PPQN.
 * This is needed when the MIDI file uses a different PPQN than openDAW (960).
 */
export const rescaleToPPQN = (
    notes: ReadonlyArray<CompiledNote>,
    sourceTicksPerBeat: number
): ReadonlyArray<CompiledNote> => {
    if (sourceTicksPerBeat === PPQN.Quarter) return notes
    const ratio = PPQN.Quarter / sourceTicksPerBeat
    return notes.map(n => ({
        ...n,
        position: Math.round(n.position * ratio),
        duration: Math.max(1, Math.round(n.duration * ratio))
    }))
}

// ─── Full pipeline ───────────────────────────────────────────────────────────

/**
 * Load MIDI notes from a file path (absolute) and return CompiledNote[].
 */
export const loadMidiNotes = async (absolutePath: string): Promise<{
    readonly notes: ReadonlyArray<CompiledNote>
    readonly ticksPerBeat: number
}> => {
    const result = await loadMidiFile(absolutePath)
    return {notes: result.notes, ticksPerBeat: result.ticksPerBeat}
}

/**
 * Full pipeline: retrieve → load → transform → validate → PreparedMusicPart.
 * @param repoRoot - Base URL or path prefix for resolving MIDI asset source paths.
 *                   In Vite dev, this is typically "" or "../.." relative to the app root.
 *                   The resolved path will be passed to fetch().
 */
export const preparePart = async (
    task: RoleTask,
    repoRoot: string,
    projectBars: number = 4
): Promise<PreparedMusicPart> => {
    if (task.operation.type !== "retrieve-and-transform") {
        throw new Error(`Unsupported operation type: ${task.operation.type}`)
    }

    const energy = task.operation.energy
    const asset = retrieveAsset(task.role, energy)
    if (asset === undefined) {
        throw new Error(`No asset found for role=${task.role}, energy=${energy}`)
    }

    const resolvedPath = repoRoot ? `${repoRoot}/${asset.sourcePath}` : `/${asset.sourcePath}`
    const {notes: rawNotes, ticksPerBeat} = await loadMidiNotes(resolvedPath)
    const operations: Array<string> = [`loaded from ${asset.sourcePath}`]

    // 1. Rescale to internal PPQN
    let notes = rescaleToPPQN(rawNotes, ticksPerBeat)
    if (ticksPerBeat !== PPQN.Quarter) {
        operations.push(`rescaled from ${ticksPerBeat} to ${PPQN.Quarter} tpb`)
    }

    // 2. Crop if needed
    if (asset.needsCrop) {
        notes = cropToBars(notes, projectBars)
        operations.push(`cropped to ${projectBars} bars`)
    }

    // 3. Transpose if needed
    if (asset.transposeSteps !== 0) {
        notes = transpose(notes, asset.transposeSteps)
        operations.push(`transposed ${asset.transposeSteps} semitones`)
    }

    // 4. Validate
    const quality = validateQuality(notes, task.role, projectBars)
    if (!quality.passed) {
        operations.push(`quality gate FAILED: ${quality.violations.length} violation(s)`)
    } else {
        operations.push("quality gate passed")
    }

    return {
        taskId: task.id,
        role: task.role,
        notes,
        transformReceipt: {sourceAssetId: asset.id, operations},
        quality
    }
}
