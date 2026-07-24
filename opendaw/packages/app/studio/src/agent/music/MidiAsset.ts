import {clamp, isDefined} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {ControlType, MidiFile} from "@opendaw/lib-midi"
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

type ActiveNote = {
    readonly position: number
    readonly pitch: number
    readonly velocity: number
}

const decodeNotes = (buffer: ArrayBuffer): ReadonlyArray<CompiledNote> => {
    const format = MidiFile.decoder(buffer).decode()
    const notes: Array<CompiledNote> = []
    for (const track of format.tracks) {
        for (const [channel, events] of track.controlEvents) {
            const active = new Map<number, Array<ActiveNote>>()
            for (const event of events) {
                const position = PPQN.fromSignature(event.ticks / format.timeDivision, 4)
                const isNoteOn = event.type === ControlType.NOTE_ON && event.param1 > 0
                const isNoteOff = event.type === ControlType.NOTE_OFF
                    || (event.type === ControlType.NOTE_ON && event.param1 === 0)
                if (isNoteOn) {
                    const queue = active.get(event.param0) ?? []
                    queue.push({
                        position,
                        pitch: event.param0,
                        velocity: event.param1 / 127
                    })
                    active.set(event.param0, queue)
                } else if (isNoteOff) {
                    const queue = active.get(event.param0)
                    const started = queue?.shift()
                    if (queue?.length === 0) {active.delete(event.param0)}
                    if (!isDefined(started) || position <= started.position) {continue}
                    notes.push({
                        position: started.position,
                        duration: position - started.position,
                        pitch: started.pitch,
                        velocity: started.velocity
                    })
                }
            }
            if (channel === 9) {
                // Channel 10 is conventionally drums. The role-specific range pass below still
                // decides whether pitches are preserved or normalized.
            }
        }
    }
    return notes
}

const roleRange = (role: Exclude<MusicRole, "drums">) =>
    role === "bass"
        ? {min: 28, max: 55, center: 41}
        : {min: 48, max: 88, center: 67}

const normalizePitchRange = (
    notes: ReadonlyArray<CompiledNote>,
    role: MusicRole
): ReadonlyArray<CompiledNote> => {
    if (role === "drums" || notes.length === 0) {return notes}
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
    bars: number
): ReadonlyArray<CompiledNote> => {
    const decoded = decodeNotes(buffer)
    if (decoded.length === 0) {throw new Error("The selected MIDI asset contains no playable notes")}
    const fitted = fitToBars(decoded, bars)
    const normalized = normalizePitchRange(fitted, role)
    if (normalized.length === 0) {throw new Error("The selected MIDI asset is empty after fitting")}
    return normalized
}
