import {createHash} from "node:crypto"
import {readdir, readFile, rename, rm, mkdir} from "node:fs/promises"
import {relative, resolve, sep} from "node:path"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

type IndexedAsset = {
    readonly id: string
    readonly path: string
    readonly role: string
    readonly source: string
    readonly styleTags: string
    readonly bpm: number | null
    readonly bars: number | null
    readonly noteCount: number
    readonly minPitch: number | null
    readonly maxPitch: number | null
    readonly medianPitch: number | null
    readonly density: number | null
    readonly fingerprint: string
    readonly byteLength: number
    readonly valid: number
    readonly error: string | null
}

const midiRoot = resolve(process.env.DAWDEX_MIDI_ROOT
    ?? fileURLToPath(new URL("../../../../../midi/easy", import.meta.url)))
const catalogPath = resolve(
    process.env.DAWDEX_MIDI_CATALOG ?? resolve(midiRoot, "..", ".dawdex", "catalog.sqlite")
)
const temporaryPath = `${catalogPath}.tmp`

const normalizePath = (value: string): string => value.split(sep).join("/")
const idForPath = (path: string): string =>
    createHash("sha256").update(path).digest("hex").slice(0, 20)

const pathBpm = (path: string): number | null => {
    const section = path.match(/(?:^|[/@_-])(\d{2,3})-S/i)
    if (section !== null) {return Number(section[1])}
    const named = path.match(/(?:^|[/@_-])(\d{2,3})[_ -]?bpm/i)
    return named === null ? null : Number(named[1])
}

const styleTags = (path: string): string => {
    const normalized = path.toLowerCase()
    const tags = new Set<string>()
    if (/dubstep/.test(normalized)) {tags.add("dubstep")}
    if (/r&b|rnb|contemporary_r|neo.?soul/.test(normalized)) {tags.add("rnb")}
    if (/soul/.test(normalized)) {tags.add("soul")}
    if (/edm/.test(normalized)) {tags.add("edm")}
    if (/dance/.test(normalized)) {tags.add("dance")}
    if (/electronic/.test(normalized)) {tags.add("electronic")}
    if (/synth/.test(normalized)) {tags.add("synth")}
    if (/hip.?hop/.test(normalized)) {tags.add("hip-hop")}
    if (/funk/.test(normalized)) {tags.add("funk")}
    if (/jazz/.test(normalized)) {tags.add("jazz")}
    if (/straight/.test(normalized)) {tags.add("straight")}
    if (/swing|shuffle/.test(normalized)) {tags.add("swing")}
    return Array.from(tags).sort().join(" ")
}

const sourceName = (path: string): string => path.split("/").slice(2, 5).join(" / ")

const collectMidiFiles = async (root: string): Promise<ReadonlyArray<string>> => {
    const directories = [root]
    const files: Array<string> = []
    while (directories.length > 0) {
        const directory = directories.pop()!
        const entries = await readdir(directory, {withFileTypes: true})
        for (const entry of entries) {
            const path = resolve(directory, entry.name)
            if (entry.isDirectory()) {
                if (entry.name !== ".dawdex") {directories.push(path)}
            } else if (entry.isFile() && /\.midi?$/i.test(entry.name)) {
                files.push(path)
            }
        }
    }
    return files.sort()
}

type MidiSummary = {
    readonly timeDivision: number
    readonly maxTicks: number
    readonly pitches: ReadonlyArray<number>
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

const summarizeMidi = (bytes: Buffer): MidiSummary => {
    if (bytes.length < 14 || bytes.subarray(0, 4).toString("ascii") !== "MThd") {
        throw new Error("Missing MThd header")
    }
    const headerLength = bytes.readUInt32BE(4)
    const timeDivision = bytes.readUInt16BE(12)
    if ((timeDivision & 0x8000) !== 0 || timeDivision === 0) {
        throw new Error("SMPTE MIDI time division is not supported")
    }
    const pitches: Array<number> = []
    let maxTicks = 0
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
                position++ // meta type
                const length = readVariableLength(bytes, position)
                position = length.offset + length.value
                continue
            }
            if (status === 0xF0 || status === 0xF7) {
                const length = readVariableLength(bytes, position)
                position = length.offset + length.value
                continue
            }
            const type = status & 0xF0
            const dataLength = type === 0xC0 || type === 0xD0 ? 1 : 2
            const param0 = firstData ?? bytes[position++]
            const param1 = dataLength === 2 ? bytes[position++] : 0
            if (position > chunkEnd) {throw new Error("Truncated MIDI channel event")}
            if (type === 0x90 && param1 > 0) {pitches.push(param0)}
        }
    }
    return {timeDivision, maxTicks, pitches}
}

const analyze = async (absolutePath: string): Promise<IndexedAsset> => {
    const path = normalizePath(relative(midiRoot, absolutePath))
    const role = path.split("/")[0]
    const bytes = await readFile(absolutePath)
    const fingerprint = createHash("sha256").update(bytes).digest("hex")
    const base = {
        id: idForPath(path),
        path,
        role,
        source: sourceName(path),
        styleTags: styleTags(path),
        bpm: pathBpm(path),
        fingerprint,
        byteLength: bytes.length
    }
    try {
        const summary = summarizeMidi(bytes)
        const pitches = Array.from(summary.pitches)
        if (pitches.length === 0) {throw new Error("No playable note-on events")}
        pitches.sort((a, b) => a - b)
        const bars = Math.max(1, Math.ceil(summary.maxTicks / summary.timeDivision / 4))
        return {
            ...base,
            bars,
            noteCount: pitches.length,
            minPitch: pitches[0],
            maxPitch: pitches[pitches.length - 1],
            medianPitch: pitches[Math.floor(pitches.length / 2)],
            density: pitches.length / bars,
            valid: 1,
            error: null
        }
    } catch (error) {
        return {
            ...base,
            bars: null,
            noteCount: 0,
            minPitch: null,
            maxPitch: null,
            medianPitch: null,
            density: null,
            valid: 0,
            error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
        }
    }
}

await mkdir(resolve(catalogPath, ".."), {recursive: true})
await rm(temporaryPath, {force: true})
const database = new DatabaseSync(temporaryPath)
database.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        source TEXT NOT NULL,
        style_tags TEXT NOT NULL,
        bpm INTEGER,
        bars INTEGER,
        note_count INTEGER NOT NULL,
        min_pitch INTEGER,
        max_pitch INTEGER,
        median_pitch INTEGER,
        density REAL,
        fingerprint TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        valid INTEGER NOT NULL,
        error TEXT
    );
`)
const insert = database.prepare(`
    INSERT INTO assets (
        id, path, role, source, style_tags, bpm, bars, note_count,
        min_pitch, max_pitch, median_pitch, density, fingerprint,
        byte_length, valid, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const files = await collectMidiFiles(midiRoot)
console.log(`Indexing ${files.length} MIDI files from ${midiRoot}`)
let invalid = 0
const concurrency = 64
for (let start = 0; start < files.length; start += concurrency) {
    const batch = await Promise.all(files.slice(start, start + concurrency).map(analyze))
    database.exec("BEGIN")
    try {
        for (const asset of batch) {
            invalid += asset.valid === 0 ? 1 : 0
            insert.run(
                asset.id,
                asset.path,
                asset.role,
                asset.source,
                asset.styleTags,
                asset.bpm,
                asset.bars,
                asset.noteCount,
                asset.minPitch,
                asset.maxPitch,
                asset.medianPitch,
                asset.density,
                asset.fingerprint,
                asset.byteLength,
                asset.valid,
                asset.error
            )
        }
        database.exec("COMMIT")
    } catch (error) {
        database.exec("ROLLBACK")
        throw error
    }
    const completed = Math.min(files.length, start + batch.length)
    if (completed % 5_000 < concurrency || completed === files.length) {
        console.log(`Indexed ${completed}/${files.length}`)
    }
}

database.exec(`
    CREATE INDEX assets_role_valid ON assets(role, valid);
    CREATE INDEX assets_bpm ON assets(bpm);
    CREATE INDEX assets_bars ON assets(bars);
    CREATE INDEX assets_fingerprint ON assets(fingerprint);
    CREATE INDEX assets_style_tags ON assets(style_tags);
    CREATE INDEX assets_source ON assets(source);
    ANALYZE;
`)
database.close()
await rm(catalogPath, {force: true})
await rename(temporaryPath, catalogPath)
console.log(`MIDI catalog ready: ${catalogPath}`)
console.log(`Valid: ${files.length - invalid}; invalid: ${invalid}`)
