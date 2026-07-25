import {clamp} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {MidiFile} from "@opendaw/lib-midi"
import {decodeMidiNoteSpans} from "@/midi/MidiNoteSpans"
import type {MusicRole} from "../AgentProtocol"
import type {CompiledNote} from "./PatternCompiler"

export type MidiAssetLoader = (assetId: string) => Promise<ArrayBuffer>

const agentEndpoint = (): string =>
    import.meta.env.VITE_DAWDEX_AGENT_URL ?? "http://localhost:8787/v1/plan"

export const loadMidiAsset: MidiAssetLoader = async assetId => {
    const url = new URL(`/v1/midi-assets/${encodeURIComponent(assetId)}`, agentEndpoint())
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`MIDI library returned ${response.status} for asset ${assetId}`)
    }
    return response.arrayBuffer()
}

const decodeNotes = (buffer: ArrayBuffer): ReadonlyArray<CompiledNote> => {
    const format = MidiFile.decoder(buffer).decode()
    return decodeMidiNoteSpans(format).flatMap(({notes}) => notes.map(note => ({
        position: PPQN.fromSignature(note.ticks / format.timeDivision, 4),
        duration: PPQN.fromSignature(note.durationTicks / format.timeDivision, 4),
        pitch: note.pitch,
        velocity: note.velocity
    })))
}

const roleRange = (role: Exclude<MusicRole, "drums">) =>
    role === "bass"
        ? {min: 28, max: 55, center: 41}
        : {min: 48, max: 88, center: 67}

// The stock Playfield TR-808/TR-909 presets occupy C3-B3 (MIDI 60-71), while
// most library drum grooves use General MIDI percussion notes. Keep the
// musical drum role when translating between those two layouts.
const gmToPlayfield = new Map<number, number>([
    [35, 60], [36, 60], // kick
    [41, 61], [43, 61], // low tom
    [38, 62], [40, 62], // snare
    [45, 63], [47, 63], // mid tom
    [48, 64], [50, 64], // high tom
    [37, 65],           // rim shot
    [39, 66],           // clap
    [42, 67], [44, 67], // closed/pedal hat
    [46, 68],           // open hat
    [49, 69], [52, 69], [55, 69], [57, 69], // crash
    [51, 70], [53, 70], [59, 70],            // ride
    [54, 71], [56, 71], [58, 71]             // auxiliary percussion
])

const playfieldDrumPitch = (pitch: number): number => {
    const rounded = Math.round(pitch)
    if (rounded >= 60 && rounded <= 71) {return rounded}
    return gmToPlayfield.get(rounded) ?? 60 + ((rounded - 35) % 12 + 12) % 12
}

const normalizePitchRange = (
    notes: ReadonlyArray<CompiledNote>,
    role: MusicRole
): ReadonlyArray<CompiledNote> => {
    if (notes.length === 0) {return notes}
    if (role === "drums") {
        return notes.map(note => ({...note, pitch: playfieldDrumPitch(note.pitch)}))
    }
    const range = roleRange(role)
    const sorted = notes.map(note => note.pitch).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const octaveShift = Math.round((range.center - median) / 12) * 12
    return notes.map(note => {
        let pitch = note.pitch + octaveShift
        while (pitch < range.min) {pitch += 12}
        while (pitch > range.max) {pitch -= 12}
        return {...note, pitch: clamp(Math.round(pitch), range.min, range.max)}
    })
}

const fitToBars = (
    notes: ReadonlyArray<CompiledNote>,
    bars: number
): ReadonlyArray<CompiledNote> => {
    if (notes.length === 0) {return []}
    const firstPosition = Math.min(...notes.map(note => note.position))
    const shifted = notes.map(note => ({...note, position: note.position - firstPosition}))
    const maxEnd = Math.max(...shifted.map(note => note.position + note.duration))
    const sourceBars = Math.max(1, Math.ceil(maxEnd / PPQN.Bar))
    const sourceDuration = sourceBars * PPQN.Bar
    const targetDuration = bars * PPQN.Bar
    const fitted: Array<CompiledNote> = []
    for (let offset = 0; offset < targetDuration; offset += sourceDuration) {
        shifted.forEach(note => {
            const position = Math.round(note.position + offset)
            if (position >= targetDuration) {return}
            const duration = Math.min(
                Math.max(1, Math.round(note.duration)),
                targetDuration - position
            )
            if (duration <= 0) {return}
            fitted.push({...note, position, duration})
        })
    }
    return fitted
}

export const compileMidiAsset = (
    buffer: ArrayBuffer,
    role: MusicRole,
    bars: number,
    transposeSemitones: number = 0
): ReadonlyArray<CompiledNote> => {
    const decoded = decodeNotes(buffer)
    if (decoded.length === 0) {throw new Error("The selected MIDI asset contains no playable notes")}
    const fitted = fitToBars(decoded, bars)
    const transposed = role === "drums" || transposeSemitones === 0
        ? fitted
        : fitted.map(note => ({...note, pitch: note.pitch + Math.round(transposeSemitones)}))
    const normalized = normalizePitchRange(transposed, role)
    if (normalized.length === 0) {throw new Error("The selected MIDI asset is empty after fitting")}
    return normalized
}
