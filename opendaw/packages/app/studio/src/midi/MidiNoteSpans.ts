import {ControlEvent, ControlType, MidiFileFormat} from "@opendaw/lib-midi"

export type MidiNoteSpan = {
    readonly ticks: number
    readonly durationTicks: number
    readonly pitch: number
    readonly velocity: number
}

export type MidiNoteSpanGroup = {
    readonly trackIndex: number
    readonly channel: number
    readonly notes: ReadonlyArray<MidiNoteSpan>
}

type PendingNote = {
    readonly ticks: number
    readonly pitch: number
    readonly velocity: number
}

const append = (
    map: Map<number, Array<PendingNote>>,
    pitch: number,
    note: PendingNote
): void => {
    const queue = map.get(pitch) ?? []
    queue.push(note)
    map.set(pitch, queue)
}

const take = (
    map: Map<number, Array<PendingNote>>,
    pitch: number
): PendingNote | undefined => {
    const queue = map.get(pitch)
    const note = queue?.shift()
    if (queue?.length === 0) {map.delete(pitch)}
    return note
}

const decodeChannel = (
    events: ReadonlyArray<ControlEvent>,
    endTick: number
): ReadonlyArray<MidiNoteSpan> => {
    const active = new Map<number, Array<PendingNote>>()
    const sustained = new Map<number, Array<PendingNote>>()
    const notes: Array<MidiNoteSpan> = []
    let pedalDown = false

    const close = (note: PendingNote, ticks: number): void => {
        notes.push({
            ticks: note.ticks,
            durationTicks: Math.max(1, ticks - note.ticks),
            pitch: note.pitch,
            velocity: note.velocity
        })
    }
    const closeMap = (map: Map<number, Array<PendingNote>>, ticks: number): void => {
        map.forEach(queue => queue.forEach(note => close(note, ticks)))
        map.clear()
    }
    const ordered = events
        .map((event, index) => ({event, index}))
        .sort((a, b) => a.event.ticks - b.event.ticks || a.index - b.index)

    ordered.forEach(({event}) => {
        const isNoteOn = event.type === ControlType.NOTE_ON && event.param1 > 0
        const isNoteOff = event.type === ControlType.NOTE_OFF
            || (event.type === ControlType.NOTE_ON && event.param1 === 0)
        if (isNoteOn) {
            sustained.get(event.param0)?.forEach(note => close(note, event.ticks))
            sustained.delete(event.param0)
            append(active, event.param0, {
                ticks: event.ticks,
                pitch: event.param0,
                velocity: event.param1 / 127
            })
        } else if (isNoteOff) {
            const note = take(active, event.param0)
            if (note === undefined) {return}
            if (pedalDown) {
                append(sustained, event.param0, note)
            } else {
                close(note, event.ticks)
            }
        } else if (event.type === ControlType.CONTROLLER && event.param0 === 64) {
            const nextPedalDown = event.param1 >= 64
            if (pedalDown && !nextPedalDown) {closeMap(sustained, event.ticks)}
            pedalDown = nextPedalDown
        }
    })
    closeMap(sustained, endTick)
    closeMap(active, endTick)
    return notes.sort((a, b) =>
        a.ticks - b.ticks
        || a.pitch - b.pitch
        || a.durationTicks - b.durationTicks
        || a.velocity - b.velocity)
}

export const decodeMidiNoteSpans = (
    format: MidiFileFormat
): ReadonlyArray<MidiNoteSpanGroup> =>
    format.tracks.flatMap((track, trackIndex) => {
        const metaEnd = track.metaEvents.reduce(
            (maximum, event) => Math.max(maximum, event.ticks),
            0
        )
        return Array.from(track.controlEvents)
            .map(([channel, events]) => {
                const eventEnd = events.reduce(
                    (maximum, event) => Math.max(maximum, event.ticks),
                    0
                )
                return {
                    trackIndex,
                    channel,
                    notes: decodeChannel(events, Math.max(metaEnd, eventEnd))
                }
            })
            .filter(group => group.notes.length > 0)
    })
