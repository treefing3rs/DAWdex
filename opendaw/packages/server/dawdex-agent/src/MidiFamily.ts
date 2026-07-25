import {createHash} from "node:crypto"
import {posix} from "node:path"
import type {CatalogRole} from "./MidiCatalog.ts"

export type SectionKind =
    | "intro" | "establish" | "develop" | "peak"
    | "contrast" | "outro" | "transition" | "custom"

export type MidiFamilyMetadata = {
    readonly library: string
    readonly pack: string
    readonly familyId: string | null
    readonly familyLabel: string | null
    readonly familyKey: string | null
    readonly groove: "straight" | "swing" | null
    readonly meter: string | null
    readonly sourceBpm: number | null
    readonly sectionLabel: string | null
    readonly sectionKind: SectionKind | null
    readonly sectionOrder: number | null
    readonly variantLabel: string
}

const stripId = (value: string): string =>
    value.replace(/^\d+(?:-S\d+)?@/, "").replace(/[#_]+/g, " ").trim()

const normalizeKeyPath = (path: string): string => path
    .replace(/\\/g, "/")
    .replace(/^keys\/EZkeys Library\//i, "keys/")
    .toLowerCase()

const sectionTerms: ReadonlyArray<readonly [RegExp, SectionKind, number]> = [
    [/\b(?:intro|opening)\b/i, "intro", 10],
    [/\b(?:verse|theme|main)\b/i, "establish", 20],
    [/\b(?:pre[ _-]?chorus|build|development)\b/i, "develop", 30],
    [/\b(?:chorus|drop|arpeggio|climax|peak)\b/i, "peak", 40],
    [/\b(?:bridge|breakdown|middle[ _-]?8|interlude)\b/i, "contrast", 50],
    [/\b(?:outro|ending|end)\b/i, "outro", 60],
    [/\b(?:fill|transition|crossover|crescendo)\b/i, "transition", 55]
]

export const normalizeSection = (label: string): {
    readonly kind: SectionKind,
    readonly defaultOrder: number
} | null => {
    const readable = label.replace(/[_-]+/g, " ")
    for (const [pattern, kind, defaultOrder] of sectionTerms) {
        if (pattern.test(readable)) {return {kind, defaultOrder}}
    }
    return null
}

const stableFamilyId = (familyKey: string): string =>
    `fam_${createHash("sha256").update(familyKey).digest("hex").slice(0, 20)}`

const inferLibraryAndPack = (segments: ReadonlyArray<string>): {
    readonly library: string,
    readonly pack: string
} => {
    const midiIndex = segments.findIndex(segment => /^midi$/i.test(segment))
    const libraryIndex = midiIndex >= 0 ? midiIndex + 1 : 1
    return {
        library: stripId(segments[libraryIndex] ?? segments[1] ?? "unknown"),
        pack: stripId(segments[libraryIndex + 1] ?? segments[libraryIndex] ?? "unknown")
    }
}

const sourceBpmFromPath = (path: string): number | null => {
    const section = path.match(/(?:^|\/)(\d{2,3})-S\d+@/i)
    if (section !== null) {return Number(section[1])}
    const named = path.match(/(?:^|[/@_ -])(\d{2,3})[ _-]?bpm(?=$|[/@_ .-])/i)
    return named === null ? null : Number(named[1])
}

const meterFromPath = (path: string): string | null => {
    const match = path.match(/(?:straight|swing)[_ -]?(\d+)[#/]([24816])|(?:^|[/_ -])(\d+)[#/]([24816])(?:$|[/_ -])/i)
    if (match === null) {return null}
    return `${match[1] ?? match[3]}/${match[2] ?? match[4]}`
}

/**
 * Parses only deterministic family signals. Unknown paths deliberately return
 * familyId=null so unrelated files can never be merged by fuzzy similarity.
 */
export const parseMidiFamily = (path: string, role: CatalogRole): MidiFamilyMetadata => {
    const normalized = path.replace(/\\/g, "/")
    const segments = normalized.split("/").filter(Boolean)
    const {library, pack} = inferLibraryAndPack(segments)
    const groove = /(?:^|[/_ -])swing(?:$|[/_ -])/i.test(normalized)
        ? "swing" as const
        : /(?:^|[/_ -])straight(?:$|[/_ -])/i.test(normalized)
            ? "straight" as const
            : null
    const base = {
        library,
        pack,
        groove,
        meter: meterFromPath(normalized),
        sourceBpm: sourceBpmFromPath(normalized),
        variantLabel: stripId(posix.basename(normalized).replace(/\.midi?$/i, ""))
    }

    // Toontrack convention: 100-S021@FULL_SONG. The first two digits after S
    // identify the song and the remaining suffix is the source section order.
    const toontrackIndex = segments.findIndex(segment => /^\d{2,3}-S\d{3,4}@/i.test(segment))
    if (toontrackIndex >= 0) {
        const match = segments[toontrackIndex].match(/^(\d{2,3})-S(\d{2})(\d{1,2})@(.+)$/i)!
        const parent = segments.slice(0, toontrackIndex).join("/")
        const label = stripId(segments[toontrackIndex])
        const normalizedSection = normalizeSection(label)
        const familyKey = `${normalizeKeyPath(parent)}|${match[1]}-s${match[2]}`
        return {
            ...base,
            familyId: stableFamilyId(familyKey),
            familyLabel: `${stripId(segments[toontrackIndex - 1] ?? pack)} · ${match[1]} S${match[2]}`,
            familyKey,
            sectionLabel: label,
            sectionKind: normalizedSection?.kind ?? "custom",
            sectionOrder: Number(match[3])
        }
    }

    // Curated and other explicit section-directory layouts: 01@Intro/variant.mid.
    const numberedIndex = segments.findIndex(segment => /^\d{1,3}@.+/i.test(segment)
        && normalizeSection(stripId(segment)) !== null)
    if (numberedIndex >= 0) {
        const match = segments[numberedIndex].match(/^(\d{1,3})@(.+)$/i)!
        const parent = segments.slice(0, numberedIndex).join("/")
        const label = stripId(segments[numberedIndex])
        const normalizedSection = normalizeSection(label)!
        const familyKey = normalizeKeyPath(parent)
        return {
            ...base,
            familyId: stableFamilyId(familyKey),
            familyLabel: stripId(segments[numberedIndex - 1] ?? pack),
            familyKey,
            sectionLabel: label,
            sectionKind: normalizedSection.kind,
            sectionOrder: Number(match[1])
        }
    }

    // Piano loop packs keep the song/progression in the parent directory and
    // the section in the filename (for example Prog1_Song1_Intro.mid).
    const fileLabel = posix.basename(normalized).replace(/\.midi?$/i, "")
    const fileSection = normalizeSection(fileLabel)
    if (role === "keys" && fileSection !== null && segments.length >= 2) {
        const parent = segments.slice(0, -1).join("/")
        const familyKey = normalizeKeyPath(parent)
        const matchedLabel = sectionTerms.find(([pattern]) => pattern.test(fileLabel))
        return {
            ...base,
            familyId: stableFamilyId(familyKey),
            familyLabel: stripId(segments.at(-2) ?? pack),
            familyKey,
            sectionLabel: matchedLabel === undefined ? fileLabel : stripId(matchedLabel[0].source),
            sectionKind: fileSection.kind,
            sectionOrder: fileSection.defaultOrder
        }
    }

    return {
        ...base,
        familyId: null,
        familyLabel: null,
        familyKey: null,
        sectionLabel: null,
        sectionKind: null,
        sectionOrder: null
    }
}
