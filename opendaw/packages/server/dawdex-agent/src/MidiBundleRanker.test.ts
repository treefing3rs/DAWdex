import {describe, expect, it} from "vitest"
import type {CreativeBrief} from "./MusicPlan.ts"
import type {CatalogRole, MidiCandidate} from "./MidiCatalog.ts"
import {findExactBundle, rankMidiBundles} from "./MidiBundleRanker.ts"

const candidate = (
    id: string,
    role: CatalogRole,
    keyRoot: number | null,
    source: string,
    bpm = 82
): MidiCandidate => ({
    id,
    role,
    style: "rnb",
    path: `${role}/${source}/${id}.mid`,
    label: id,
    bpm,
    bars: 8,
    noteCount: 32,
    minPitch: role === "bass" ? 36 : 48,
    maxPitch: role === "bass" ? 52 : 76,
    medianPitch: role === "bass" ? 41 : 64,
    density: role === "drums" ? 12 : 4,
    source,
    styleTags: ["rnb"],
    keyRoot,
    keyMode: "minor",
    section: "verse"
})

const brief = {
    intent: "create",
    style: "rnb",
    styleAlternatives: [],
    moods: ["romantic"],
    decisionSummary: "Warm R&B",
    instrumentation: ["drums", "bass", "keys"],
    bpm: 82,
    key: "D minor",
    bars: 8,
    energy: 0.5,
    swing: 0.3,
    preserveTrackIds: [],
    targetRoles: ["drums", "bass", "keys"],
    searchTerms: {drums: [], bass: [], keys: []}
} satisfies CreativeBrief

describe("MidiBundleRanker", () => {
    it("prefers a coherent family and calculates one target-key adaptation", () => {
        const bundles = rankMidiBundles(brief, [
            candidate("d-good", "drums", null, "SoulPack"),
            candidate("d-fast", "drums", null, "Other", 140),
            candidate("b-good", "bass", 2, "SoulPack"),
            candidate("b-other", "bass", 9, "Other"),
            candidate("k-good", "keys", 2, "SoulPack"),
            candidate("k-other", "keys", 9, "Other")
        ])

        expect(bundles[0].parts.map(part => part.id)).toEqual(["d-good", "b-good", "k-good"])
        expect(bundles[0].transposeByAssetId).toMatchObject({
            "d-good": 0,
            "b-good": 0,
            "k-good": 0
        })
    })

    it("accepts the model's exact compatible bundle without replacing its choices", () => {
        const bundles = rankMidiBundles(brief, [
            candidate("d", "drums", null, "SoulPack"),
            candidate("b1", "bass", 2, "SoulPack"),
            candidate("b2", "bass", 9, "Other"),
            candidate("k1", "keys", 2, "SoulPack"),
            candidate("k2", "keys", 9, "Other")
        ])

        const selected = findExactBundle(bundles, [
            {role: "drums", assetId: "d"},
            {role: "bass", assetId: "b1"},
            {role: "keys", assetId: "k1"}
        ])
        expect(selected?.parts.map(part => part.id)).toEqual(["d", "b1", "k1"])
    })

    it("rejects a cross-bundle mix instead of silently choosing a nearby bundle", () => {
        const ranked = rankMidiBundles(brief, [
            candidate("d", "drums", null, "SoulPack"),
            candidate("b1", "bass", 2, "SoulPack"),
            candidate("b2", "bass", 9, "Other"),
            candidate("k1", "keys", 2, "SoulPack"),
            candidate("k2", "keys", 9, "Other")
        ])
        const bundles = ranked.filter(bundle => {
            const ids = bundle.parts.map(part => part.id).join(",")
            return ids === "d,b1,k1" || ids === "d,b2,k2"
        })

        expect(findExactBundle(bundles, [
            {role: "drums", assetId: "d"},
            {role: "bass", assetId: "b1"},
            {role: "keys", assetId: "k2"}
        ])).toBeNull()
    })
})
