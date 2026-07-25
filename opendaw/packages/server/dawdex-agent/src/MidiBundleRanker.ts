import {createHash} from "node:crypto"
import type {CreativeBrief} from "./MusicPlan.ts"
import type {CatalogRole, MidiCandidate} from "./MidiCatalog.ts"

export type MidiBundle = {
    readonly id: string
    readonly score: number
    readonly parts: ReadonlyArray<MidiCandidate>
    readonly transposeByAssetId: Readonly<Record<string, number>>
    readonly reasons: ReadonlyArray<string>
}

const NOTE_ROOTS: Readonly<Record<string, number>> = {
    c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4,
    f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9,
    "a#": 10, bb: 10, b: 11
}

const targetKey = (value: string): {root: number | null, mode: "major" | "minor" | null} => {
    const match = value.trim().match(/^([a-g])([#b]?)\s*(major|minor|maj|min|m)?/i)
    if (match === null) {return {root: null, mode: null}}
    return {
        root: NOTE_ROOTS[`${match[1]}${match[2]}`.toLowerCase()] ?? null,
        mode: match[3] === undefined
            ? null
            : /^m(?:in(?:or)?)?$/i.test(match[3]) ? "minor" : "major"
    }
}

const shortestTranspose = (from: number | null, to: number | null): number => {
    if (from === null || to === null) {return 0}
    const upward = (to - from + 12) % 12
    return upward > 6 ? upward - 12 : upward
}

const GENERIC_SOURCE_TOKENS = new Set([
    "bass", "drums", "easy", "keys", "library", "midi", "patterns",
    "straight", "variation", "variations"
])

const sourceTokens = (candidate: MidiCandidate): ReadonlySet<string> =>
    new Set(`${candidate.source} ${candidate.path}`.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 4
            && !/^\d+$/.test(token)
            && !GENERIC_SOURCE_TOKENS.has(token)))

const sharedSourceTokens = (parts: ReadonlyArray<MidiCandidate>): number => {
    if (parts.length < 2) {return 0}
    const counts = new Map<string, number>()
    parts.forEach(part => sourceTokens(part).forEach(token =>
        counts.set(token, (counts.get(token) ?? 0) + 1)))
    return Array.from(counts.values()).filter(count => count >= 2).length
}

const densityTarget = (role: CatalogRole, energy: number): number =>
    role === "drums" ? 4 + energy * 16
        : role === "bass" ? 1 + energy * 5
            : 2 + energy * 10

const scoreBundle = (
    brief: CreativeBrief,
    parts: ReadonlyArray<MidiCandidate>,
    rankById: ReadonlyMap<string, number>
): Omit<MidiBundle, "id" | "parts"> => {
    const target = targetKey(brief.key)
    const transposeByAssetId: Record<string, number> = {}
    let score = parts.reduce((sum, part) => sum + (rankById.get(part.id) ?? 99) * 1.5, 0)
    for (const part of parts) {
        score += part.bpm === null ? 18 : Math.min(36, Math.abs(part.bpm - brief.bpm) * 0.8)
        score += part.bars === null ? 8 : Math.min(24, Math.abs(part.bars - brief.bars) * 3)
        if (part.density !== null) {
            score += Math.min(20, Math.abs(part.density - densityTarget(part.role, brief.energy)))
        }
        const transpose = part.role === "drums" ? 0 : shortestTranspose(part.keyRoot, target.root)
        transposeByAssetId[part.id] = transpose
        score += Math.abs(transpose) * 0.8
        if (part.keyMode !== null && target.mode !== null && part.keyMode !== target.mode) {score += 16}
    }
    const knownSections = parts.flatMap(part => part.section === null ? [] : [part.section])
    if (new Set(knownSections).size > 1) {score += 12}
    const shared = sharedSourceTokens(parts)
    score -= Math.min(12, shared * 2)
    return {
        score,
        transposeByAssetId,
        reasons: [
            `${parts.length} 个角色按 ${brief.bpm} BPM / ${brief.key} 共同评分`,
            knownSections.length === 0
                ? "段落标签未知，使用节奏与长度兼容度兜底"
                : `段落关系：${Array.from(new Set(knownSections)).join(" / ")}`,
            shared > 0 ? `素材家族共享 ${shared} 个路径线索` : "素材来自不同家族，已提高兼容惩罚"
        ]
    }
}

const combinations = (
    roles: ReadonlyArray<CatalogRole>,
    byRole: ReadonlyMap<CatalogRole, ReadonlyArray<MidiCandidate>>
): ReadonlyArray<ReadonlyArray<MidiCandidate>> => {
    let result: ReadonlyArray<ReadonlyArray<MidiCandidate>> = [[]]
    for (const role of roles) {
        const candidates = byRole.get(role) ?? []
        result = result.flatMap(prefix => candidates.map(candidate => [...prefix, candidate]))
    }
    return result
}

export const rankMidiBundles = (
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>,
    limit: number = 8
): ReadonlyArray<MidiBundle> => {
    const roles = brief.targetRoles as ReadonlyArray<CatalogRole>
    const byRole = new Map<CatalogRole, ReadonlyArray<MidiCandidate>>()
    const rankById = new Map<string, number>()
    roles.forEach(role => {
        const roleCandidates = candidates.filter(candidate => candidate.role === role)
        byRole.set(role, roleCandidates)
        roleCandidates.forEach((candidate, rank) => rankById.set(candidate.id, rank))
    })
    if (roles.some(role => (byRole.get(role)?.length ?? 0) === 0)) {return []}
    return combinations(roles, byRole)
        .map(parts => {
            const ranked = scoreBundle(brief, parts, rankById)
            const ids = parts.map(part => part.id).sort().join("|")
            return {
                id: createHash("sha1").update(ids).digest("hex").slice(0, 12),
                parts,
                ...ranked
            }
        })
        .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
        .slice(0, limit)
}

export const findExactBundle = (
    bundles: ReadonlyArray<MidiBundle>,
    selections: ReadonlyArray<{readonly role: CatalogRole, readonly assetId: string}>
): MidiBundle | null => bundles.find(bundle => selections.every(selection =>
    bundle.parts.some(part =>
        part.role === selection.role && part.id === selection.assetId))) ?? null
