import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {resolve} from "node:path"
import {DatabaseSync} from "node:sqlite"
import {afterEach, describe, expect, it} from "vitest"
import {MidiCatalog} from "./MidiCatalog.ts"

const temporaryDirectories: Array<string> = []
const openCatalogs: Array<MidiCatalog> = []

const createCatalog = async (): Promise<MidiCatalog> => {
    const directory = await mkdtemp(resolve(tmpdir(), "dawdex-midi-catalog-"))
    temporaryDirectories.push(directory)
    const midiRoot = resolve(directory, "easy")
    const databasePath = resolve(directory, "catalog.sqlite")
    await mkdir(midiRoot)
    const database = new DatabaseSync(databasePath)
    database.exec(`
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
        )
    `)
    const insert = database.prepare(`
        INSERT INTO assets (
            id, path, role, source, style_tags, bpm, bars, note_count,
            min_pitch, max_pitch, median_pitch, density, fingerprint,
            byte_length, valid, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    database.exec("BEGIN")
    for (let index = 0; index < 2_050; index++) {
        insert.run(
            `generic-${index}`,
            `drums/Generic/${index}.mid`,
            "drums",
            "Generic",
            "",
            90,
            4,
            16,
            36,
            46,
            40,
            4,
            `generic-fingerprint-${index}`,
            100,
            1,
            null
        )
    }
    insert.run(
        "house-after-2050",
        "drums/House/124_bpm/four_on_the_floor.mid",
        "drums",
        "House",
        "house dance",
        124,
        8,
        64,
        36,
        46,
        40,
        8,
        "house-fingerprint",
        100,
        1,
        null
    )
    database.exec("COMMIT")
    database.close()
    const catalog = new MidiCatalog(midiRoot, databasePath)
    openCatalogs.push(catalog)
    return catalog
}

afterEach(async () => {
    openCatalogs.splice(0).forEach(catalog => catalog.close())
    await Promise.all(temporaryDirectories.splice(0).map(directory =>
        rm(directory, {recursive: true, force: true})
    ))
})

describe("MidiCatalog", () => {
    it("can initialize the SQLite catalog eagerly before the first search", async () => {
        const catalog = await createCatalog()

        await Promise.all([catalog.initialize(), catalog.initialize()])

        await expect(catalog.candidate("house-after-2050")).resolves.toMatchObject({
            id: "house-after-2050",
            role: "drums"
        })
    })

    it("searches the indexed database for an arbitrary style instead of a tiny preset list", async () => {
        const catalog = await createCatalog()

        const candidates = await catalog.candidates(
            "House",
            "drums",
            124,
            "A minor",
            "uplifting four-on-the-floor groove",
            8,
            8,
            ["house", "dance", "four on the floor"]
        )

        expect(candidates[0]).toMatchObject({
            id: "house-after-2050",
            role: "drums",
            style: "House",
            bpm: 124,
            bars: 8
        })
    })

    it("does not silently return unrelated assets when no search term matches", async () => {
        const catalog = await createCatalog()

        const candidates = await catalog.candidates(
            "nonexistent-style", "drums", 124, "A minor", "nonexistent-style",
            8, 8, ["term-that-is-not-in-the-catalog"]
        )

        expect(candidates).toEqual([])
    })

    it("deduplicates identical MIDI fingerprints before ranking", async () => {
        const catalog = await createCatalog()
        const databasePath = resolve(temporaryDirectories[0], "catalog.sqlite")
        catalog.close()
        const database = new DatabaseSync(databasePath)
        database.prepare(`
            INSERT INTO assets (
                id, path, role, source, style_tags, bpm, bars, note_count,
                min_pitch, max_pitch, median_pitch, density, fingerprint,
                byte_length, valid, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            "house-duplicate",
            "drums/House/124_bpm/duplicate.mid",
            "drums",
            "House",
            "house dance",
            124,
            8,
            64,
            36,
            46,
            40,
            8,
            "house-fingerprint",
            100,
            1,
            null
        )
        database.close()
        const reloaded = new MidiCatalog(resolve(temporaryDirectories[0], "easy"), databasePath)
        openCatalogs.push(reloaded)

        const candidates = await reloaded.candidates(
            "House", "drums", 124, "A minor", "house", 8, 8, ["house"]
        )

        expect(candidates.filter(candidate =>
            candidate.id === "house-after-2050" || candidate.id === "house-duplicate"
        )).toHaveLength(1)
    })

    it("returns one verified variant per family section in musical order", async () => {
        const catalog = await createCatalog()
        const databasePath = resolve(temporaryDirectories[0], "catalog.sqlite")
        catalog.close()
        const database = new DatabaseSync(databasePath)
        database.exec(`
            ALTER TABLE assets ADD COLUMN family_id TEXT;
            ALTER TABLE assets ADD COLUMN family_label TEXT;
            ALTER TABLE assets ADD COLUMN section_label TEXT;
            ALTER TABLE assets ADD COLUMN section_order INTEGER;
            ALTER TABLE assets ADD COLUMN section_kind TEXT;
            ALTER TABLE assets ADD COLUMN key_root INTEGER;
            ALTER TABLE assets ADD COLUMN key_mode TEXT;
            ALTER TABLE assets ADD COLUMN key_confidence REAL NOT NULL DEFAULT 0;
            ALTER TABLE assets ADD COLUMN harmonic_signature TEXT NOT NULL DEFAULT '';
            ALTER TABLE assets ADD COLUMN root_timeline TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE assets ADD COLUMN energy REAL NOT NULL DEFAULT 0.5;
            ALTER TABLE assets ADD COLUMN drum_coverage REAL;
            ALTER TABLE assets ADD COLUMN drum_role_histogram TEXT;
            ALTER TABLE assets ADD COLUMN source_bpm INTEGER;
            ALTER TABLE assets ADD COLUMN fill_likelihood REAL NOT NULL DEFAULT 0;
            ALTER TABLE assets ADD COLUMN music_fingerprint TEXT NOT NULL DEFAULT '';
        `)
        const update = database.prepare(`
            UPDATE assets
            SET path = ?, style_tags = 'house dance', family_id = 'house-family',
                family_label = 'House Song', section_order = ?, section_kind = ?,
                drum_coverage = 1.0,
                drum_role_histogram = '{"kick":8,"snare":4,"closed-hat":16}',
                source_bpm = 124, music_fingerprint = ?
            WHERE id = ?
        `)
        update.run("drums/MIDI/House/01@Intro/Variation_01.mid", 1, "intro", "music-1", "generic-0")
        update.run("drums/MIDI/House/02@Verse/Variation_01.mid", 2, "develop", "music-2", "generic-1")
        update.run("drums/MIDI/House/03@Outro/Variation_01.mid", 3, "outro", "music-3", "generic-2")
        database.close()
        const reloaded = new MidiCatalog(resolve(temporaryDirectories[0], "easy"), databasePath)
        openCatalogs.push(reloaded)

        const sequences = await reloaded.sequences(
            "House", "drums", 124, "house arrangement", 4, ["house"]
        )

        expect(sequences).toHaveLength(1)
        expect(sequences[0].familyLabel).toBe("House Song")
        expect(sequences[0].sections.map(section => section.sectionKind))
            .toEqual(["intro", "develop", "outro"])
        expect(sequences[0].sections.map(section => section.assetId))
            .toEqual(["generic-0", "generic-1", "generic-2"])
    })
})
