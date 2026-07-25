export type CanonicalDrumRole =
    | "kick" | "snare" | "low-tom" | "mid-tom" | "high-tom"
    | "rim" | "clap" | "closed-hat" | "open-hat" | "crash" | "ride"
    | "auxiliary" | "unsupported"

export type DrumSourceProfile = {
    readonly id: string
    readonly productScope: string
    readonly mappingBasis: "curated-playfield" | "toontrack-standard-gm-core" | "unknown"
}

const gmRoles = new Map<number, CanonicalDrumRole>([
    [35, "kick"], [36, "kick"],
    [38, "snare"], [40, "snare"],
    [41, "low-tom"], [43, "low-tom"],
    [45, "mid-tom"], [47, "mid-tom"],
    [48, "high-tom"], [50, "high-tom"],
    [37, "rim"], [39, "clap"],
    [42, "closed-hat"], [44, "closed-hat"], [46, "open-hat"],
    [49, "crash"], [52, "crash"], [55, "crash"], [57, "crash"],
    [51, "ride"], [53, "ride"], [59, "ride"],
    [54, "auxiliary"], [56, "auxiliary"], [58, "auxiliary"]
])

export const drumSourceProfile = (path: string): DrumSourceProfile => {
    const normalized = path.replace(/\\/g, "/")
    if (/\/dawdex-curated\//i.test(normalized)) {
        return {
            id: "dawdex-curated-playfield-v1",
            productScope: "DAWdex curated Playfield assets",
            mappingBasis: "curated-playfield"
        }
    }
    const ezx = normalized.match(/^drums\/(EZX[^/]+)\//i)
    if (ezx !== null) {
        return {
            id: `ezx:${ezx[1].toLowerCase()}:gm-core-only`,
            productScope: ezx[1],
            mappingBasis: "toontrack-standard-gm-core"
        }
    }
    if (/^drums\/MIDI\//i.test(normalized)) {
        const pack = normalized.split("/")[2] ?? "Toontrack MIDI"
        return {
            id: `toontrack:${pack.toLowerCase()}:gm-core-only`,
            productScope: pack,
            mappingBasis: "toontrack-standard-gm-core"
        }
    }
    return {id: "unknown", productScope: "unknown", mappingBasis: "unknown"}
}

const curatedPlayfieldRole = (note: number): CanonicalDrumRole => new Map<number, CanonicalDrumRole>([
    [60, "kick"], [61, "snare"], [62, "low-tom"], [63, "mid-tom"],
    [64, "high-tom"], [65, "rim"], [66, "clap"], [67, "closed-hat"],
    [68, "open-hat"], [69, "auxiliary"], [70, "ride"]
]).get(note) ?? "unsupported"

export const canonicalDrumRole = (
    profile: DrumSourceProfile,
    note: number
): CanonicalDrumRole => {
    const rounded = Math.round(note)
    if (profile.mappingBasis === "curated-playfield") {return curatedPlayfieldRole(rounded)}
    if (profile.mappingBasis === "toontrack-standard-gm-core") {
        return gmRoles.get(rounded) ?? "unsupported"
    }
    return "unsupported"
}

export type DrumCoverage = {
    readonly profile: DrumSourceProfile
    readonly histogram: Readonly<Record<string, number>>
    readonly mappedHits: number
    readonly unsupportedHits: number
    readonly coverage: number
}

export const analyzeDrumCoverage = (
    path: string,
    notes: ReadonlyArray<number>
): DrumCoverage => {
    const profile = drumSourceProfile(path)
    const histogram: Record<string, number> = {}
    let mappedHits = 0
    let unsupportedHits = 0
    for (const note of notes) {
        const role = canonicalDrumRole(profile, note)
        histogram[role] = (histogram[role] ?? 0) + 1
        if (role === "unsupported") {unsupportedHits++} else {mappedHits++}
    }
    return {
        profile,
        histogram,
        mappedHits,
        unsupportedHits,
        coverage: notes.length === 0 ? 0 : mappedHits / notes.length
    }
}
