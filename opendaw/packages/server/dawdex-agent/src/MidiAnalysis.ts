import {createHash} from "node:crypto"
import {analyzeDrumCoverage, type DrumCoverage} from "./DrumProfiles.ts"
import type {CatalogRole} from "./MidiCatalog.ts"

export type MidiNoteOn = {
    readonly tick: number
    readonly pitch: number
    readonly velocity: number
    readonly channel: number
}

export type ParsedMidi = {
    readonly timeDivision: number
    readonly maxTicks: number
    readonly notes: ReadonlyArray<MidiNoteOn>
    readonly tempo: number | null
    readonly meter: string | null
}

export type MidiMusicalAnalysis = {
    readonly keyRoot: number | null
    readonly keyMode: "major" | "minor" | null
    readonly keyConfidence: number
    readonly pitchClassHistogram: ReadonlyArray<number>
    readonly rootTimeline: ReadonlyArray<number>
    readonly harmonicSignature: string
    readonly polyphony: number
    readonly registerLow: number | null
    readonly registerHigh: number | null
    readonly onsetSignature: ReadonlyArray<number>
    readonly velocityMean: number
    readonly velocityStd: number
    readonly pickupTicks: number
    readonly phraseBars: number
    readonly energy: number
    readonly fillLikelihood: number
    readonly musicFingerprint: string
    readonly drum: DrumCoverage | null
}

const readVariableLength = (bytes: Buffer, initialOffset: number): {value: number, offset: number} => {
    let offset = initialOffset
    let value = 0
    for (let index = 0; index < 4; index++) {
        if (offset >= bytes.length) {throw new Error("Unexpected end of variable-length value")}
        const current = bytes[offset++]
        value = (value << 7) | (current & 0x7F)
        if ((current & 0x80) === 0) {return {value, offset}}
    }
    throw new Error("Invalid variable-length value")
}

export const parseMidi = (bytes: Buffer): ParsedMidi => {
    if (bytes.length < 14 || bytes.subarray(0, 4).toString("ascii") !== "MThd") {
        throw new Error("Missing MThd header")
    }
    const headerLength = bytes.readUInt32BE(4)
    const timeDivision = bytes.readUInt16BE(12)
    if ((timeDivision & 0x8000) !== 0 || timeDivision === 0) {
        throw new Error("SMPTE MIDI time division is not supported")
    }
    const notes: Array<MidiNoteOn> = []
    let maxTicks = 0
    let tempo: number | null = null
    let meter: string | null = null
    let offset = 8 + headerLength
    while (offset + 8 <= bytes.length) {
        const chunkType = bytes.subarray(offset, offset + 4).toString("ascii")
        const chunkLength = bytes.readUInt32BE(offset + 4)
        const chunkStart = offset + 8
        const chunkEnd = chunkStart + chunkLength
        if (chunkEnd > bytes.length) {throw new Error("MIDI chunk exceeds file length")}
        offset = chunkEnd
        if (chunkType !== "MTrk") {continue}
        let position = chunkStart
        let ticks = 0
        let runningStatus = 0
        while (position < chunkEnd) {
            const delta = readVariableLength(bytes, position)
            ticks += delta.value
            maxTicks = Math.max(maxTicks, ticks)
            position = delta.offset
            if (position >= chunkEnd) {break}
            let status = bytes[position]
            let firstData: number | null = null
            if (status < 0x80) {
                if (runningStatus === 0) {throw new Error("Running status used before a channel event")}
                firstData = status
                status = runningStatus
                position++
            } else {
                position++
                if (status < 0xF0) {runningStatus = status}
            }
            if (status === 0xFF) {
                if (position >= chunkEnd) {throw new Error("Truncated MIDI meta event")}
                const metaType = bytes[position++]
                const length = readVariableLength(bytes, position)
                const dataStart = length.offset
                const dataEnd = dataStart + length.value
                if (dataEnd > chunkEnd) {throw new Error("Truncated MIDI meta payload")}
                if (metaType === 0x51 && length.value === 3 && tempo === null) {
                    const micros = bytes.readUIntBE(dataStart, 3)
                    if (micros > 0) {tempo = Math.round(60_000_000 / micros)}
                } else if (metaType === 0x58 && length.value >= 2 && meter === null) {
                    meter = `${bytes[dataStart]}/${2 ** bytes[dataStart + 1]}`
                }
                position = dataEnd
                continue
            }
            if (status === 0xF0 || status === 0xF7) {
                const length = readVariableLength(bytes, position)
                position = length.offset + length.value
                continue
            }
            const type = status & 0xF0
            const channel = status & 0x0F
            const dataLength = type === 0xC0 || type === 0xD0 ? 1 : 2
            const param0 = firstData ?? bytes[position++]
            const param1 = dataLength === 2 ? bytes[position++] : 0
            if (position > chunkEnd) {throw new Error("Truncated MIDI channel event")}
            if (type === 0x90 && param1 > 0) {
                notes.push({tick: ticks, pitch: param0, velocity: param1, channel})
            }
        }
    }
    return {timeDivision, maxTicks, notes, tempo, meter}
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const keyAnalysis = (histogram: ReadonlyArray<number>): {
    readonly root: number | null,
    readonly mode: "major" | "minor" | null,
    readonly confidence: number
} => {
    const total = histogram.reduce((sum, value) => sum + value, 0)
    if (total === 0) {return {root: null, mode: null, confidence: 0}}
    const scores: Array<{root: number, mode: "major" | "minor", score: number}> = []
    for (let root = 0; root < 12; root++) {
        for (const [mode, profile] of [["major", MAJOR_PROFILE], ["minor", MINOR_PROFILE]] as const) {
            const score = histogram.reduce((sum, value, pitchClass) =>
                sum + value * profile[(pitchClass - root + 12) % 12], 0)
            scores.push({root, mode, score})
        }
    }
    scores.sort((a, b) => b.score - a.score)
    const best = scores[0]
    const second = scores[1]
    const confidence = Math.max(0, Math.min(1, (best.score - second.score) / Math.max(1, best.score) * 8))
    return confidence < 0.08
        ? {root: null, mode: null, confidence}
        : {root: best.root, mode: best.mode, confidence}
}

const rounded = (value: number): number => Math.round(value * 1000) / 1000

export const analyzeMidi = (
    parsed: ParsedMidi,
    role: CatalogRole,
    path: string
): MidiMusicalAnalysis => {
    const pitches = parsed.notes.map(note => note.pitch)
    const histogram = Array.from({length: 12}, () => 0)
    pitches.forEach(pitch => histogram[pitch % 12]++)
    const key = role === "drums"
        ? {root: null, mode: null, confidence: 0}
        : keyAnalysis(histogram)
    const barTicks = parsed.timeDivision * 4
    const phraseBars = Math.max(1, Math.ceil(parsed.maxTicks / barTicks))
    const roots = Array.from({length: phraseBars}, (_, bar) => {
        const barNotes = parsed.notes.filter(note => Math.floor(note.tick / barTicks) === bar)
        if (barNotes.length === 0) {return -1}
        return Math.min(...barNotes.map(note => note.pitch)) % 12
    })
    const normalizedRoots = key.root === null
        ? roots
        : roots.map(root => root < 0 ? -1 : (root - key.root! + 12) % 12)
    const onset = Array.from({length: 16}, () => 0)
    parsed.notes.forEach(note => {
        const withinBar = ((note.tick % barTicks) + barTicks) % barTicks
        const slot = Math.min(15, Math.floor(withinBar / barTicks * 16))
        onset[slot]++
    })
    const maxOnset = Math.max(1, ...onset)
    const onsetSignature = onset.map(value => rounded(value / maxOnset))
    const velocities = parsed.notes.map(note => note.velocity)
    const velocityMean = velocities.length === 0
        ? 0
        : velocities.reduce((sum, value) => sum + value, 0) / velocities.length
    const velocityStd = velocities.length === 0
        ? 0
        : Math.sqrt(velocities.reduce((sum, value) => sum + (value - velocityMean) ** 2, 0) / velocities.length)
    const simultaneous = new Map<number, number>()
    parsed.notes.forEach(note => simultaneous.set(note.tick, (simultaneous.get(note.tick) ?? 0) + 1))
    const polyphony = simultaneous.size === 0
        ? 0
        : Array.from(simultaneous.values()).reduce((sum, value) => sum + value, 0) / simultaneous.size
    const density = parsed.notes.length / phraseBars
    const lastQuarterStart = Math.max(0, parsed.maxTicks - parsed.timeDivision)
    const lastQuarter = parsed.notes.filter(note => note.tick >= lastQuarterStart).length
    const expectedQuarter = parsed.notes.length / Math.max(1, phraseBars * 4)
    const fillLikelihood = Math.max(0, Math.min(1, (lastQuarter - expectedQuarter) / Math.max(1, expectedQuarter * 2)))
    const normalizedNotes = parsed.notes.map(note => [
        Math.round(note.tick / Math.max(1, parsed.timeDivision / 24)),
        role === "drums" || key.root === null ? note.pitch : (note.pitch - key.root + 120) % 12,
        Math.round(note.velocity / 8)
    ])
    const musicFingerprint = createHash("sha256")
        .update(JSON.stringify(normalizedNotes)).digest("hex")
    const drum = role === "drums" ? analyzeDrumCoverage(path, pitches) : null
    return {
        keyRoot: key.root,
        keyMode: key.mode,
        keyConfidence: rounded(key.confidence),
        pitchClassHistogram: histogram,
        rootTimeline: normalizedRoots,
        harmonicSignature: normalizedRoots.join(","),
        polyphony: rounded(polyphony),
        registerLow: pitches.length === 0 ? null : Math.min(...pitches),
        registerHigh: pitches.length === 0 ? null : Math.max(...pitches),
        onsetSignature,
        velocityMean: rounded(velocityMean / 127),
        velocityStd: rounded(velocityStd / 127),
        pickupTicks: parsed.notes.length === 0 ? 0 : Math.min(...parsed.notes.map(note => note.tick)),
        phraseBars,
        energy: rounded(Math.min(1, density / (role === "drums" ? 48 : 32)) * 0.7
            + Math.min(1, velocityMean / 127) * 0.3),
        fillLikelihood: rounded(fillLikelihood),
        musicFingerprint,
        drum
    }
}
