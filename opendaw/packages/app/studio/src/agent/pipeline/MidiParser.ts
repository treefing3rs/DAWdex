/**
 * Minimal MIDI file parser — extracts note events from Format 0 and Format 1 .mid files.
 * No external dependencies; uses only Node `fs` for file reading.
 */

import {int} from "@opendaw/lib-std"

export type CompiledNote = {
    readonly position: number   // absolute ticks (ppqn)
    readonly duration: number
    readonly pitch: int
    readonly velocity: number
}

export type MidiParseResult = {
    readonly notes: ReadonlyArray<CompiledNote>
    readonly ticksPerBeat: number
    readonly format: number
    readonly trackCount: number
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const readUint16 = (buf: Uint8Array, offset: number): number =>
    (buf[offset] << 8) | buf[offset + 1]

const readUint32 = (buf: Uint8Array, offset: number): number =>
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0

const readVariableLength = (buf: Uint8Array, offset: number): { value: number; bytesRead: number } => {
    let value = 0
    let bytesRead = 0
    let byte: number
    do {
        byte = buf[offset + bytesRead]
        value = (value << 7) | (byte & 0x7F)
        bytesRead++
    } while ((byte & 0x80) !== 0 && bytesRead < 4)
    return {value, bytesRead}
}

type PendingNote = {
    readonly pitch: int
    readonly velocity: number
    readonly startTick: number
}

const parseTrack = (buf: Uint8Array, offset: number, length: number): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const pending: Map<number, PendingNote> = new Map()
    let pos = offset
    const end = offset + length
    let absoluteTick = 0
    let runningStatus = 0

    while (pos < end) {
        // Delta time
        const delta = readVariableLength(buf, pos)
        pos += delta.bytesRead
        absoluteTick += delta.value

        if (pos >= end) break

        let statusByte = buf[pos]

        // Meta event
        if (statusByte === 0xFF) {
            pos++ // skip 0xFF
            pos++ // skip type byte
            if (pos >= end) break
            const metaLen = readVariableLength(buf, pos)
            pos += metaLen.bytesRead + metaLen.value
            continue
        }

        // SysEx event
        if (statusByte === 0xF0 || statusByte === 0xF7) {
            pos++ // skip status
            const sysexLen = readVariableLength(buf, pos)
            pos += sysexLen.bytesRead + sysexLen.value
            continue
        }

        // Channel message
        if (statusByte & 0x80) {
            runningStatus = statusByte
            pos++
        } else {
            // Running status — reuse previous status byte
            statusByte = runningStatus
        }

        const messageType = statusByte & 0xF0

        if (messageType === 0x90) {
            // Note On
            const pitch = buf[pos++] as int
            const velocity = buf[pos++]
            if (velocity === 0) {
                // Note On with velocity 0 = Note Off
                const p = pending.get(pitch)
                if (p !== undefined) {
                    notes.push({
                        position: p.startTick,
                        duration: Math.max(1, absoluteTick - p.startTick),
                        pitch: p.pitch,
                        velocity: p.velocity / 127.0
                    })
                    pending.delete(pitch)
                }
            } else {
                // Close any previous note on same pitch (overlapping note handling)
                const existing = pending.get(pitch)
                if (existing !== undefined) {
                    notes.push({
                        position: existing.startTick,
                        duration: Math.max(1, absoluteTick - existing.startTick),
                        pitch: existing.pitch,
                        velocity: existing.velocity / 127.0
                    })
                }
                pending.set(pitch, {pitch, velocity, startTick: absoluteTick})
            }
        } else if (messageType === 0x80) {
            // Note Off
            const pitch = buf[pos++] as int
            pos++ // skip velocity byte
            const p = pending.get(pitch)
            if (p !== undefined) {
                notes.push({
                    position: p.startTick,
                    duration: Math.max(1, absoluteTick - p.startTick),
                    pitch: p.pitch,
                    velocity: p.velocity / 127.0
                })
                pending.delete(pitch)
            }
        } else if (messageType === 0xA0 || messageType === 0xB0 || messageType === 0xE0) {
            // Polyphonic aftertouch, CC, pitch bend — 2 data bytes
            pos += 2
        } else if (messageType === 0xC0 || messageType === 0xD0) {
            // Program change, channel aftertouch — 1 data byte
            pos += 1
        }
    }

    // Close any notes still pending at end of track
    for (const p of pending.values()) {
        notes.push({
            position: p.startTick,
            duration: Math.max(1, absoluteTick - p.startTick),
            pitch: p.pitch,
            velocity: p.velocity / 127.0
        })
    }

    return notes
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a MIDI file buffer into note events.
 * Supports Format 0 (single track) and Format 1 (multi-track, merged).
 */
export const parseMidiBuffer = (buf: Uint8Array): MidiParseResult => {
    // Validate MThd header
    const headerTag = String.fromCharCode(buf[0], buf[1], buf[2], buf[3])
    if (headerTag !== "MThd") {
        throw new Error(`Invalid MIDI file: expected MThd header, got "${headerTag}"`)
    }

    const headerLength = readUint32(buf, 4)
    const format = readUint16(buf, 8)
    const trackCount = readUint16(buf, 10)
    const ticksPerBeat = readUint16(buf, 12)

    if (format > 1) {
        throw new Error(`Unsupported MIDI format ${format} (only Format 0 and 1 supported)`)
    }

    let offset = 8 + headerLength // skip past MThd chunk
    const allNotes: Array<CompiledNote> = []

    for (let t = 0; t < trackCount; t++) {
        if (offset + 8 > buf.length) break

        const trackTag = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
        if (trackTag !== "MTrk") {
            throw new Error(`Expected MTrk at offset ${offset}, got "${trackTag}"`)
        }

        const trackLength = readUint32(buf, offset + 4)
        offset += 8

        const trackNotes = parseTrack(buf, offset, trackLength)
        allNotes.push(...trackNotes)

        offset += trackLength
    }

    // Sort by position, then pitch (for determinism)
    allNotes.sort((a, b) => a.position - b.position || a.pitch - b.pitch)

    return {notes: allNotes, ticksPerBeat, format, trackCount}
}

/**
 * Load and parse a MIDI file.
 * In the browser (Vite dev server), fetches via relative URL.
 * Falls back to Node fs/promises if fetch is not available or URL is absolute.
 */
export const loadMidiFile = async (absolutePath: string): Promise<MidiParseResult> => {
    // In browser context, convert absolute repo path to a relative URL that Vite can serve.
    // Vite's fs.allow covers the workspace root, so relative paths from the server root work.
    const response = await fetch(absolutePath)
    if (!response.ok) {
        throw new Error(`Failed to load MIDI file: ${response.status} ${absolutePath}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return parseMidiBuffer(new Uint8Array(arrayBuffer))
}
