import {createHash} from "node:crypto"
import {readdir, readFile, rename, rm, mkdir} from "node:fs/promises"
import {relative, resolve, sep} from "node:path"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"
import {analyzeMidi, parseMidi} from "./MidiAnalysis.ts"
import {parseMidiFamily} from "./MidiFamily.ts"

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
    readonly library: string
    readonly pack: string
    readonly familyId: string | null
    readonly familyLabel: string | null
    readonly familyKey: string | null
    readonly groove: string | null
    readonly meter: string | null
    readonly sourceBpm: number | null
    readonly sectionLabel: string | null
    readonly sectionKind: string | null
    readonly sectionOrder: number | null
    readonly variantLabel: string
    readonly keyRoot: number | null
    readonly keyMode: string | null
    readonly keyConfidence: number
    readonly pitchClassHistogram: string
    readonly rootTimeline: string
    readonly harmonicSignature: string
    readonly polyphony: number
    readonly registerLow: number | null
    readonly registerHigh: number | null
    readonly onsetSignature: string
    readonly velocityMean: number
    readonly velocityStd: number
    readonly pickupTicks: number
    readonly phraseBars: number
    readonly energy: number
    readonly fillLikelihood: number
    readonly musicFingerprint: string
    readonly drumProfile: string | null
    readonly drumRoleHistogram: string | null
    readonly drumMappedHits: number
    readonly drumUnsupportedHits: number
    readonly drumCoverage: number | null
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

const analyze = async (absolutePath: string): Promise<IndexedAsset> => {
    const path = normalizePath(relative(midiRoot, absolutePath))
    const role = path.split("/")[0] as "drums" | "bass" | "keys"
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
        const summary = parseMidi(bytes)
        const pitches = summary.notes.map(note => note.pitch)
        if (pitches.length === 0) {throw new Error("No playable note-on events")}
        pitches.sort((a, b) => a - b)
        const bars = Math.max(1, Math.ceil(summary.maxTicks / summary.timeDivision / 4))
        const family = parseMidiFamily(path, role)
        const musical = analyzeMidi(summary, role, path)
        return {
            ...base,
            bars,
            noteCount: pitches.length,
            minPitch: pitches[0],
            maxPitch: pitches[pitches.length - 1],
            medianPitch: pitches[Math.floor(pitches.length / 2)],
            density: pitches.length / bars,
            valid: 1,
            error: null,
            library: family.library,
            pack: family.pack,
            familyId: family.familyId,
            familyLabel: family.familyLabel,
            familyKey: family.familyKey,
            groove: family.groove,
            meter: family.meter ?? summary.meter,
            sourceBpm: family.sourceBpm ?? summary.tempo,
            sectionLabel: family.sectionLabel,
            sectionKind: family.sectionKind,
            sectionOrder: family.sectionOrder,
            variantLabel: family.variantLabel,
            keyRoot: musical.keyRoot,
            keyMode: musical.keyMode,
            keyConfidence: musical.keyConfidence,
            pitchClassHistogram: JSON.stringify(musical.pitchClassHistogram),
            rootTimeline: JSON.stringify(musical.rootTimeline),
            harmonicSignature: musical.harmonicSignature,
            polyphony: musical.polyphony,
            registerLow: musical.registerLow,
            registerHigh: musical.registerHigh,
            onsetSignature: JSON.stringify(musical.onsetSignature),
            velocityMean: musical.velocityMean,
            velocityStd: musical.velocityStd,
            pickupTicks: musical.pickupTicks,
            phraseBars: musical.phraseBars,
            energy: musical.energy,
            fillLikelihood: musical.fillLikelihood,
            musicFingerprint: musical.musicFingerprint,
            drumProfile: musical.drum?.profile.id ?? null,
            drumRoleHistogram: musical.drum === null ? null : JSON.stringify(musical.drum.histogram),
            drumMappedHits: musical.drum?.mappedHits ?? 0,
            drumUnsupportedHits: musical.drum?.unsupportedHits ?? 0,
            drumCoverage: musical.drum?.coverage ?? null
        }
    } catch (error) {
        const family = parseMidiFamily(path, role)
        return {
            ...base,
            bars: null,
            noteCount: 0,
            minPitch: null,
            maxPitch: null,
            medianPitch: null,
            density: null,
            valid: 0,
            error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
            library: family.library,
            pack: family.pack,
            familyId: family.familyId,
            familyLabel: family.familyLabel,
            familyKey: family.familyKey,
            groove: family.groove,
            meter: family.meter,
            sourceBpm: family.sourceBpm,
            sectionLabel: family.sectionLabel,
            sectionKind: family.sectionKind,
            sectionOrder: family.sectionOrder,
            variantLabel: family.variantLabel,
            keyRoot: null, keyMode: null, keyConfidence: 0,
            pitchClassHistogram: "[]", rootTimeline: "[]", harmonicSignature: "",
            polyphony: 0, registerLow: null, registerHigh: null, onsetSignature: "[]",
            velocityMean: 0, velocityStd: 0, pickupTicks: 0, phraseBars: 0,
            energy: 0, fillLikelihood: 0, musicFingerprint: "",
            drumProfile: null, drumRoleHistogram: null,
            drumMappedHits: 0, drumUnsupportedHits: 0, drumCoverage: null
        }
    }
}

await mkdir(resolve(catalogPath, ".."), {recursive: true})
await rm(temporaryPath, {force: true})
const database = new DatabaseSync(temporaryPath)
database.exec(`
    PRAGMA user_version = 2;
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
        error TEXT,
        library TEXT NOT NULL,
        pack TEXT NOT NULL,
        family_id TEXT,
        family_label TEXT,
        family_key TEXT,
        groove TEXT,
        meter TEXT,
        source_bpm INTEGER,
        section_label TEXT,
        section_kind TEXT,
        section_order INTEGER,
        variant_label TEXT NOT NULL,
        key_root INTEGER,
        key_mode TEXT,
        key_confidence REAL NOT NULL,
        pitch_class_histogram TEXT NOT NULL,
        root_timeline TEXT NOT NULL,
        harmonic_signature TEXT NOT NULL,
        polyphony REAL NOT NULL,
        register_low INTEGER,
        register_high INTEGER,
        onset_signature TEXT NOT NULL,
        velocity_mean REAL NOT NULL,
        velocity_std REAL NOT NULL,
        pickup_ticks INTEGER NOT NULL,
        phrase_bars INTEGER NOT NULL,
        energy REAL NOT NULL,
        fill_likelihood REAL NOT NULL,
        music_fingerprint TEXT NOT NULL,
        drum_profile TEXT,
        drum_role_histogram TEXT,
        drum_mapped_hits INTEGER NOT NULL,
        drum_unsupported_hits INTEGER NOT NULL,
        drum_coverage REAL
    );
`)
const insert = database.prepare(`
    INSERT INTO assets (
        id, path, role, source, style_tags, bpm, bars, note_count,
        min_pitch, max_pitch, median_pitch, density, fingerprint,
        byte_length, valid, error, library, pack, family_id, family_label, family_key,
        groove, meter, source_bpm, section_label, section_kind, section_order, variant_label,
        key_root, key_mode, key_confidence, pitch_class_histogram, root_timeline,
        harmonic_signature, polyphony, register_low, register_high, onset_signature,
        velocity_mean, velocity_std, pickup_ticks, phrase_bars, energy, fill_likelihood,
        music_fingerprint, drum_profile, drum_role_histogram, drum_mapped_hits,
        drum_unsupported_hits, drum_coverage
    ) VALUES (${Array.from({length: 50}, () => "?").join(", ")})
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
                asset.error,
                asset.library,
                asset.pack,
                asset.familyId,
                asset.familyLabel,
                asset.familyKey,
                asset.groove,
                asset.meter,
                asset.sourceBpm,
                asset.sectionLabel,
                asset.sectionKind,
                asset.sectionOrder,
                asset.variantLabel,
                asset.keyRoot,
                asset.keyMode,
                asset.keyConfidence,
                asset.pitchClassHistogram,
                asset.rootTimeline,
                asset.harmonicSignature,
                asset.polyphony,
                asset.registerLow,
                asset.registerHigh,
                asset.onsetSignature,
                asset.velocityMean,
                asset.velocityStd,
                asset.pickupTicks,
                asset.phraseBars,
                asset.energy,
                asset.fillLikelihood,
                asset.musicFingerprint,
                asset.drumProfile,
                asset.drumRoleHistogram,
                asset.drumMappedHits,
                asset.drumUnsupportedHits,
                asset.drumCoverage
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
    CREATE TABLE families AS
    SELECT family_id AS id, role, MIN(family_label) AS label,
        MIN(library) AS library, MIN(pack) AS pack, MIN(groove) AS groove,
        MIN(meter) AS meter, CAST(AVG(source_bpm) AS INTEGER) AS source_bpm,
        COUNT(DISTINCT section_order || ':' || section_label) AS section_count,
        COUNT(*) AS asset_count, AVG(energy) AS energy,
        AVG(CASE WHEN key_confidence >= 0.15 THEN key_confidence ELSE NULL END) AS key_confidence
    FROM assets
    WHERE valid = 1 AND family_id IS NOT NULL
    GROUP BY family_id, role;
    CREATE UNIQUE INDEX families_id ON families(id);
    CREATE INDEX families_role ON families(role);

    CREATE TABLE family_sections AS
    SELECT family_id, section_order, MIN(section_label) AS section_label,
        MIN(section_kind) AS section_kind, COUNT(*) AS variant_count,
        AVG(energy) AS energy, AVG(fill_likelihood) AS fill_likelihood
    FROM assets
    WHERE valid = 1 AND family_id IS NOT NULL
    GROUP BY family_id, section_order;
    CREATE UNIQUE INDEX family_sections_identity ON family_sections(family_id, section_order);

    CREATE INDEX assets_role_valid ON assets(role, valid);
    CREATE INDEX assets_bpm ON assets(bpm);
    CREATE INDEX assets_bars ON assets(bars);
    CREATE INDEX assets_fingerprint ON assets(fingerprint);
    CREATE INDEX assets_style_tags ON assets(style_tags);
    CREATE INDEX assets_source ON assets(source);
    CREATE INDEX assets_family_section ON assets(family_id, section_order, valid);
    CREATE INDEX assets_music_fingerprint ON assets(music_fingerprint);
    CREATE INDEX assets_harmony ON assets(key_mode, harmonic_signature);
    CREATE INDEX assets_drum_profile ON assets(drum_profile);
    ANALYZE;
`)
database.close()
await rm(catalogPath, {force: true})
await rename(temporaryPath, catalogPath)
console.log(`MIDI catalog ready: ${catalogPath}`)
console.log(`Valid: ${files.length - invalid}; invalid: ${invalid}`)
