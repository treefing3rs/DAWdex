import {createHash} from "node:crypto"
import {existsSync} from "node:fs"
import {readdir, readFile} from "node:fs/promises"
import {relative, resolve, sep} from "node:path"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

export type CatalogRole = "drums" | "bass" | "keys"
export type CatalogStyle = string

export type MidiCandidate = {
    readonly id: string
    readonly role: CatalogRole
    readonly style: CatalogStyle
    readonly path: string
    readonly label: string
    readonly bpm: number | null
    readonly bars: number | null
    readonly noteCount: number | null
    readonly minPitch: number | null
    readonly maxPitch: number | null
    readonly medianPitch: number | null
    readonly density: number | null
    readonly source: string
    readonly styleTags: ReadonlyArray<string>
    readonly keyRoot: number | null
    readonly keyMode: "major" | "minor" | null
    readonly section: string | null
    readonly familyId?: string | null
    readonly sectionOrder?: number | null
    readonly keyConfidence?: number
    readonly harmonicSignature?: string
    readonly rootTimeline?: ReadonlyArray<number>
    readonly energy?: number
    readonly drumCoverage?: number | null
    readonly drumRoleHistogram?: Readonly<Record<string, number>>
}

export type MidiSequenceSection = {
    readonly assetId: string
    readonly assetPath: string
    readonly label: string
    readonly sectionKind: string
    readonly sectionOrder: number
    readonly bars: number
    readonly keyRoot: number | null
    readonly keyMode: "major" | "minor" | null
    readonly keyConfidence: number
    readonly harmonicSignature: string
    readonly rootTimeline: ReadonlyArray<number>
    readonly energy: number
}

export type MidiFamilySequence = {
    readonly role: CatalogRole
    readonly familyId: string
    readonly familyLabel: string
    readonly anchor: MidiCandidate
    readonly sections: ReadonlyArray<MidiSequenceSection>
}

type ScoredMidiFamilySequence = {
    readonly sequence: MidiFamilySequence
    readonly score: number
}

type CatalogSource = {
    readonly role: CatalogRole
    readonly style: CatalogStyle
    readonly path: string
}

const sources: ReadonlyArray<CatalogSource> = [
    {
        role: "drums",
        style: "dubstep",
        path: "drums/MIDI/000332@DRUM_BEATS/109@DUBSTEP"
    },
    {
        role: "drums",
        style: "dubstep",
        path: "drums/MIDI/000332@DRUM_BEATS/209@DUBSTEP"
    },
    {
        role: "bass",
        style: "dubstep",
        path: "bass/MIDI/000651@EBX_Synth_Bass"
    },
    {
        role: "keys",
        style: "dubstep",
        path: "keys/EZkeys Library/MIDI/000915@DanceMidiSamples/01@DNS_Epic_Piano_Vol_1"
    },
    {
        role: "drums",
        style: "rnb",
        path: "drums/MIDI/000331@CONTEMPORARY_R&B_GROOVES"
    },
    {
        role: "bass",
        style: "rnb",
        path: "bass/MIDI/000731@Contemporary_R&B"
    },
    {
        role: "keys",
        style: "rnb",
        path: "keys/EZkeys Library/MIDI/000940@GForce/On_The_Rhodes/05@R&B_90_bpm"
    }
]

const normalizePath = (value: string): string => value.split(sep).join("/")

const assetId = (path: string): string =>
    createHash("sha256").update(path).digest("hex").slice(0, 20)

const pathBpm = (path: string): number | null => {
    const section = path.match(/(?:^|[/@_-])(\d{2,3})-S/i)
    if (section !== null) {return Number(section[1])}
    const named = path.match(/(?:^|[/@_-])(\d{2,3})[_ -]?bpm/i)
    return named === null ? null : Number(named[1])
}

const pathLabel = (path: string): string => {
    const parts = path.split("/")
    return parts.slice(Math.max(0, parts.length - 4)).join(" / ")
}

const NOTE_ROOTS: Readonly<Record<string, number>> = {
    c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4,
    f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9,
    "a#": 10, bb: 10, b: 11
}

const pathKey = (path: string): {
    readonly root: number | null,
    readonly mode: "major" | "minor" | null
} => {
    const match = path.match(
        /(?:^|[/@_\-\s])(?:\d+[_-])?([a-g])([#b]?)[_\-\s]?(major|minor|maj|min)(?=$|[./@_\-\s])/i
    )
    if (match === null) {return {root: null, mode: null}}
    return {
        root: NOTE_ROOTS[`${match[1]}${match[2]}`.toLowerCase()] ?? null,
        mode: /^m(?:in(?:or)?)?$/i.test(match[3]) ? "minor" : "major"
    }
}

const pathSection = (path: string): string | null => {
    const match = path.match(
        /(?:^|[/@_\-\s])(intro|verse|pre.?chorus|chorus|drop|bridge|outro|fill)(?=$|[/@_\-\s])/i
    )
    return match === null ? null : match[1].toLowerCase().replace(/[^a-z]/g, "")
}

const stableJitter = (value: string): number => {
    const hash = createHash("sha1").update(value).digest()
    return hash.readUInt16BE(0) / 0xFFFF
}

const lexicalTokens = (value: string): ReadonlyArray<string> =>
    value.toLowerCase().split(/[^a-z0-9&]+/).filter(token => token.length > 0)

const containsTerm = (value: string, term: string): boolean => {
    const valueTokens = lexicalTokens(value)
    const termTokens = lexicalTokens(term)
    if (termTokens.length === 0 || termTokens.length > valueTokens.length) {return false}
    return valueTokens.some((_, start) =>
        termTokens.every((token, offset) => valueTokens[start + offset] === token))
}

const sqlPathTokens =
    "('/' || LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(path, '@', '/'), '_', '/'), '-', '/'), ' ', '/'), '#', '/')) || '/')"

const sqlPathPattern = (term: string): string =>
    `%/${lexicalTokens(term).join("/")}/%`

const sqlTagPattern = (term: string): string =>
    `% ${lexicalTokens(term).join(" ")} %`

const walkMidiFiles = async (directory: string): Promise<ReadonlyArray<string>> => {
    const entries = await readdir(directory, {withFileTypes: true})
    const nested = await Promise.all(entries.map(async entry => {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) {return walkMidiFiles(path)}
        return entry.isFile() && /\.midi?$/i.test(entry.name) ? [path] : []
    }))
    return nested.flat()
}

const defaultMidiRoot = (): string =>
    resolve(process.env.DAWDEX_MIDI_ROOT
        ?? fileURLToPath(new URL("../../../../../midi/easy", import.meta.url)))

const defaultCatalogPath = (midiRoot: string): string =>
    resolve(process.env.DAWDEX_MIDI_CATALOG ?? resolve(midiRoot, "..", ".dawdex", "catalog.sqlite"))

type CatalogRow = {
    readonly id: string
    readonly path: string
    readonly role: CatalogRole
    readonly style_tags: string
    readonly source: string
    readonly bpm: number | null
    readonly bars: number | null
    readonly note_count: number
    readonly min_pitch: number | null
    readonly max_pitch: number | null
    readonly median_pitch: number | null
    readonly density: number | null
    readonly family_id: string | null
    readonly section_order: number | null
    readonly section_kind: string | null
    readonly key_root: number | null
    readonly key_mode: string | null
    readonly key_confidence: number
    readonly harmonic_signature: string
    readonly root_timeline: string
    readonly energy: number
    readonly drum_coverage: number | null
    readonly drum_role_histogram: string | null
}

type FamilyRow = CatalogRow & {
    readonly family_label: string | null
    readonly section_label: string | null
}

const parseNumberArray = (value: string | undefined): ReadonlyArray<number> => {
    if (value === undefined) {return []}
    try {
        const parsed = JSON.parse(value) as unknown
        return Array.isArray(parsed)
            ? parsed.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
            : []
    } catch {
        return []
    }
}

const parseNumberRecord = (value: string | null): Readonly<Record<string, number>> => {
    if (value === null) {return {}}
    try {
        const parsed = JSON.parse(value) as unknown
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {return {}}
        return Object.fromEntries(Object.entries(parsed)
            .filter((entry): entry is [string, number] =>
                typeof entry[1] === "number" && Number.isFinite(entry[1])))
    } catch {
        return {}
    }
}

const hasCoreDrumRoles = (row: CatalogRow): boolean => {
    const histogram = parseNumberRecord(row.drum_role_histogram)
    return (histogram.kick ?? 0) > 0
        && (histogram.snare ?? 0) > 0
        && ((histogram["closed-hat"] ?? 0) + (histogram["open-hat"] ?? 0)) > 0
}

const inferredStyle = (row: CatalogRow): CatalogStyle => {
    if (row.style_tags.split(" ").includes("rnb")
        || /r&b|rnb|contemporary_r/i.test(row.path)) {
        return "rnb"
    }
    return "dubstep"
}

export class MidiCatalog {
    readonly #root: string
    readonly #catalogPath: string
    readonly #byId = new Map<string, {candidate: MidiCandidate, absolutePath: string}>()
    #database: DatabaseSync | null = null
    #hasFamilySchema = false
    #loading: Promise<void> | null = null

    constructor(root: string = defaultMidiRoot(), catalogPath?: string) {
        this.#root = resolve(root)
        this.#catalogPath = resolve(catalogPath ?? defaultCatalogPath(this.#root))
    }

    async initialize(): Promise<void> {
        await this.#ensureLoaded()
    }

    close(): void {
        this.#database?.close()
        this.#database = null
        this.#hasFamilySchema = false
        this.#loading = null
        this.#byId.clear()
    }

    async candidates(
        style: CatalogStyle,
        role: CatalogRole,
        bpm: number,
        key: string,
        prompt: string,
        limit: number = 8,
        bars: number = 4,
        searchTerms: ReadonlyArray<string> = []
    ): Promise<ReadonlyArray<MidiCandidate>> {
        await this.#ensureLoaded()
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "")
        const normalizedPrompt = prompt.toLowerCase()
        const normalizedTerms = Array.from(new Set([style, ...searchTerms]
            .map(term => term.toLowerCase().trim())
            .filter(term => lexicalTokens(term).join("").length >= 2)))
        const available = this.#database === null
            ? Array.from(this.#byId.values())
                .map(({candidate}) => candidate)
                .filter(candidate => candidate.role === role)
                .map(candidate => ({...candidate, style}))
            : this.#databaseCandidates(style, role, normalizedTerms)
        return available
            .map(candidate => {
                const lower = candidate.path.toLowerCase()
                let score = candidate.bpm === null ? 45 : Math.abs(candidate.bpm - bpm)
                const matchedTerms = normalizedTerms.filter(term =>
                    containsTerm(lower, term)).length
                score -= matchedTerms * 22
                if (normalizedTerms.length > 0 && matchedTerms === 0) {score += 80}
                score += candidate.bars === null
                    ? 20
                    : Math.min(60, Math.abs(candidate.bars - bars) * 5)
                if (candidate.medianPitch !== null) {
                    if (role === "bass" && candidate.medianPitch > 55) {
                        score += candidate.medianPitch - 55
                    } else if (role === "keys" && candidate.medianPitch < 48) {
                        score += (48 - candidate.medianPitch) * 2
                    }
                }
                if (normalizedKey.length > 0
                    && lower.replace(/[^a-z0-9]/g, "").includes(normalizedKey)) {
                    score -= 60
                }
                if (/fills?|intro|full_song/i.test(candidate.path)) {score += 55}
                if (/beats?|verse|a_section|chorus|drop/i.test(candidate.path)) {score -= 15}
                if (normalizedPrompt.includes("副歌") || normalizedPrompt.includes("chorus")) {
                    score += /chorus/i.test(candidate.path) ? -35 : 10
                }
                if (normalizedPrompt.includes("drop")) {
                    score += /drop/i.test(candidate.path) ? -35 : 10
                }
                score += stableJitter(`${prompt}|${candidate.id}`) * 8
                return {candidate, score}
            })
            .sort((a, b) => a.score - b.score || a.candidate.path.localeCompare(b.candidate.path))
            .slice(0, limit)
            .map(({candidate}) => candidate)
    }

    async candidate(id: string): Promise<MidiCandidate | null> {
        await this.#ensureLoaded()
        if (id.startsWith("auto:")) {
            const [, style, role, rawSeed] = id.split(":")
            if ((style !== "dubstep" && style !== "rnb")
                || (role !== "drums" && role !== "bass" && role !== "keys")) {
                return null
            }
            const candidates = await this.candidates(
                style,
                role,
                style === "dubstep" ? 140 : 82,
                "D minor",
                id,
                32
            )
            if (candidates.length === 0) {return null}
            const seed = Number(rawSeed)
            return candidates[Math.abs(Number.isFinite(seed) ? Math.trunc(seed) : 0) % candidates.length]
        }
        if (this.#database === null) {return this.#byId.get(id)?.candidate ?? null}
        const row = this.#database.prepare(`
            SELECT id, path, role, style_tags, source, bpm, bars, note_count,
                min_pitch, max_pitch, median_pitch, density, ${this.#analysisColumns()}
            FROM assets
            WHERE id = ? AND valid = 1
        `).get(id) as CatalogRow | undefined
        return row === undefined ? null : this.#rowCandidate(row, inferredStyle(row))
    }

    async sequences(
        style: CatalogStyle,
        role: CatalogRole,
        bpm: number,
        prompt: string,
        limit: number = 12,
        searchTerms: ReadonlyArray<string> = []
    ): Promise<ReadonlyArray<MidiFamilySequence>> {
        await this.#ensureLoaded()
        if (this.#database === null || !this.#hasFamilySchema) {return []}
        const terms = Array.from(new Set([style, ...searchTerms]
            .map(term => term.toLowerCase().trim())
            .filter(term => lexicalTokens(term).join("").length >= 2)))
        const aliases = terms.length > 0 ? terms : [style]
        const clauses = aliases.map(() =>
            `(${sqlPathTokens} LIKE ? OR (' ' || LOWER(style_tags) || ' ') LIKE ?)`).join(" OR ")
        const drumClause = role === "drums"
            ? "AND drum_coverage >= 0.95"
            : ""
        const rows = this.#database.prepare(`
            SELECT id, path, role, style_tags, source, bpm, bars, note_count,
                min_pitch, max_pitch, median_pitch, density, family_id, family_label,
                section_label, section_order, section_kind, key_root, key_mode, key_confidence,
                harmonic_signature, root_timeline, energy, drum_coverage,
                drum_role_histogram
            FROM assets
            WHERE valid = 1
              AND role = ?
              AND family_id IS NOT NULL
              ${drumClause}
              AND (${clauses})
            ORDER BY family_id, section_order, fill_likelihood, ABS(COALESCE(source_bpm, bpm, ?) - ?),
                music_fingerprint, path
            LIMIT 12000
        `).all(
            role,
            ...aliases.flatMap(alias => [sqlPathPattern(alias), sqlTagPattern(alias)]),
            bpm,
            bpm
        ) as unknown as ReadonlyArray<FamilyRow>
        const usableRows = role === "drums" ? rows.filter(hasCoreDrumRoles) : rows
        const families = new Map<string, Array<FamilyRow>>()
        usableRows.forEach(row => {
            if (row.family_id === null || row.section_order === null) {return}
            const current = families.get(row.family_id) ?? []
            current.push(row)
            families.set(row.family_id, current)
        })
        return Array.from(families, ([familyId, familyRows]): ScoredMidiFamilySequence | null => {
            const byOrder = new Map<number, FamilyRow>()
            familyRows.forEach(row => {
                if (row.section_order !== null && !byOrder.has(row.section_order)) {
                    byOrder.set(row.section_order, row)
                }
            })
            const selected = Array.from(byOrder.values())
                .sort((a, b) => (a.section_order ?? 0) - (b.section_order ?? 0))
            const anchorRow = selected.find(row => row.section_kind !== "custom") ?? selected[0]
            if (anchorRow === undefined) {return null}
            const anchor = this.#rowCandidate(anchorRow, style)
            const sections: Array<MidiSequenceSection> = selected.map(row => ({
                assetId: row.id,
                assetPath: row.path,
                label: row.section_label ?? row.section_kind ?? pathSection(row.path) ?? "section",
                sectionKind: row.section_kind ?? "section",
                sectionOrder: row.section_order ?? 0,
                bars: Math.max(1, Math.min(16, row.bars ?? 4)),
                keyRoot: row.key_root,
                keyMode: row.key_mode === "major" || row.key_mode === "minor" ? row.key_mode : null,
                keyConfidence: row.key_confidence,
                harmonicSignature: row.harmonic_signature,
                rootTimeline: parseNumberArray(row.root_timeline),
                energy: row.energy
            }))
            const tempo = anchor.bpm ?? bpm
            const termMatches = aliases.filter(term => containsTerm(anchor.path, term)).length
            const score = Math.abs(tempo - bpm)
                - termMatches * 24
                - Math.min(6, sections.length) * 12
                + Math.abs((anchor.energy ?? 0.5) - 0.55) * 8
                + stableJitter(`${prompt}|${familyId}`) * 4
            return {
                sequence: {
                    role,
                    familyId,
                    familyLabel: anchorRow.family_label ?? familyId,
                    anchor,
                    sections
                },
                score
            }
        })
            .filter((entry): entry is ScoredMidiFamilySequence =>
                entry !== null && entry.sequence.sections.length >= 3)
            .sort((a, b) => a.score - b.score
                || a.sequence.familyId.localeCompare(b.sequence.familyId))
            .slice(0, limit)
            .map(entry => entry.sequence)
    }

    async read(id: string): Promise<{candidate: MidiCandidate, bytes: Buffer} | null> {
        const candidate = await this.candidate(id)
        if (candidate === null) {return null}
        const absolutePath = this.#database === null
            ? this.#byId.get(candidate.id)?.absolutePath
            : resolve(this.#root, candidate.path)
        if (absolutePath === undefined
            || !(absolutePath === this.#root || absolutePath.startsWith(`${this.#root}${sep}`))) {
            return null
        }
        return {candidate, bytes: await readFile(absolutePath)}
    }

    async #ensureLoaded(): Promise<void> {
        if (this.#loading === null) {
            this.#loading = this.#load()
        }
        await this.#loading
    }

    async #load(): Promise<void> {
        if (existsSync(this.#catalogPath)) {
            this.#database = new DatabaseSync(this.#catalogPath, {readOnly: true})
            const columns = this.#database.prepare("PRAGMA table_info(assets)")
                .all() as unknown as ReadonlyArray<{name: string}>
            this.#hasFamilySchema = columns.some(column => column.name === "family_id")
            const row = this.#database.prepare(
                "SELECT COUNT(*) AS count FROM assets WHERE valid = 1"
            ).get() as {count: number}
            console.log(`DAWdex opened ${row.count} indexed MIDI assets`)
            return
        }
        console.warn(
            "DAWdex MIDI catalog is missing; using the smaller curated-directory fallback. "
            + "Run the index:midi workspace script to restore full-library retrieval."
        )
        for (const source of sources) {
            const sourceRoot = resolve(this.#root, source.path)
            const files = await walkMidiFiles(sourceRoot)
            files.forEach(absolutePath => {
                const path = normalizePath(relative(this.#root, absolutePath))
                const candidate: MidiCandidate = {
                    id: assetId(path),
                    role: source.role,
                    style: source.style,
                    path,
                    label: pathLabel(path),
                    bpm: pathBpm(path),
                    bars: null,
                    noteCount: null,
                    minPitch: null,
                    maxPitch: null,
                    medianPitch: null,
                    density: null,
                    source: source.path,
                    styleTags: [source.style],
                    keyRoot: pathKey(path).root,
                    keyMode: pathKey(path).mode,
                    section: pathSection(path),
                    familyId: null,
                    sectionOrder: null,
                    keyConfidence: 0,
                    harmonicSignature: "",
                    rootTimeline: [],
                    energy: 0.5,
                    drumCoverage: null,
                    drumRoleHistogram: {}
                }
                this.#byId.set(candidate.id, {candidate, absolutePath})
            })
        }
        if (this.#byId.size === 0) {
            throw new Error(`No MIDI assets were indexed under ${this.#root}`)
        }
        console.log(`DAWdex indexed ${this.#byId.size} curated MIDI assets from ${this.#root}`)
    }

    #databaseCandidates(
        style: CatalogStyle,
        role: CatalogRole,
        searchTerms: ReadonlyArray<string>
    ): ReadonlyArray<MidiCandidate> {
        if (this.#database === null) {return []}
        const legacyAliases = style.toLowerCase() === "rnb"
            ? ["r&b", "rnb", "contemporary r"]
            : style.toLowerCase() === "dubstep" && role === "bass"
                ? ["dubstep", "ebx synth bass"]
                : style.toLowerCase() === "dubstep" && role === "keys"
                    ? ["dubstep", "dance midi samples"]
                    : style.toLowerCase() === "dubstep"
                        ? ["dubstep", "edm grooves"]
                        : []
        const aliases = Array.from(new Set([
            ...legacyAliases,
            ...searchTerms
        ].filter(term => lexicalTokens(term).length > 0)))
        const select = `
            SELECT id, path, role, style_tags, source, bpm, bars, note_count,
                min_pitch, max_pitch, median_pitch, density, ${this.#analysisColumns()}
            FROM (
                SELECT id, path, role, style_tags, source, bpm, bars, note_count,
                    min_pitch, max_pitch, median_pitch, density, fingerprint,
                    ${this.#analysisColumns()},
                    ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY path) AS duplicate_rank
                FROM assets
                WHERE valid = 1
                  AND role = ?
                  $MATCH
            )
            WHERE duplicate_rank = 1
            LIMIT 2000
        `
        const clauses = aliases.map(() =>
            `(${sqlPathTokens} LIKE ? OR (' ' || LOWER(style_tags) || ' ') LIKE ?)`).join(" OR ")
        const matchedRows = aliases.length === 0
            ? []
            : this.#database.prepare(select.replace("$MATCH", `AND (${clauses})`))
                .all(role, ...aliases.flatMap(alias => [
                    sqlPathPattern(alias),
                    sqlTagPattern(alias)
                ])) as unknown as ReadonlyArray<CatalogRow>
        return matchedRows.map(row => this.#rowCandidate(row, style))
    }

    #analysisColumns(): string {
        return this.#hasFamilySchema
            ? `family_id, section_order, section_kind, key_root, key_mode, key_confidence,
                harmonic_signature, root_timeline, energy, drum_coverage, drum_role_histogram`
            : `NULL AS family_id, NULL AS section_order, NULL AS section_kind,
                NULL AS key_root, NULL AS key_mode, 0 AS key_confidence,
                '' AS harmonic_signature, '[]' AS root_timeline, 0.5 AS energy,
                NULL AS drum_coverage, NULL AS drum_role_histogram`
    }

    #rowCandidate(row: CatalogRow, style: CatalogStyle): MidiCandidate {
        const pathDerivedKey = pathKey(row.path)
        const analyzedMode = row.key_mode === "major" || row.key_mode === "minor"
            ? row.key_mode
            : null
        return {
            id: row.id,
            role: row.role,
            style,
            path: row.path,
            label: pathLabel(row.path),
            bpm: row.bpm,
            bars: row.bars,
            noteCount: row.note_count,
            minPitch: row.min_pitch,
            maxPitch: row.max_pitch,
            medianPitch: row.median_pitch,
            density: row.density,
            source: row.source,
            styleTags: row.style_tags.split(" ").filter(tag => tag.length > 0),
            keyRoot: row.key_root ?? pathDerivedKey.root,
            keyMode: analyzedMode ?? pathDerivedKey.mode,
            section: row.section_kind ?? pathSection(row.path),
            familyId: row.family_id,
            sectionOrder: row.section_order,
            keyConfidence: row.key_confidence,
            harmonicSignature: row.harmonic_signature,
            rootTimeline: parseNumberArray(row.root_timeline),
            energy: row.energy,
            drumCoverage: row.drum_coverage,
            drumRoleHistogram: parseNumberRecord(row.drum_role_histogram)
        }
    }
}
