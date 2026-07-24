import {isAbsent, isDefined, Nullable} from "@opendaw/lib-std"
import {
    AgentPlan,
    DawProjectSnapshot,
    MusicIntent,
    MusicRole,
    ProjectTrackSnapshot,
    UpsertRoleTrackAction
} from "./AgentProtocol"
import {StyleProfiles} from "./music/StyleProfiles"

type LocalStyle = keyof typeof StyleProfiles

const allRoles: ReadonlyArray<MusicRole> = ["drums", "bass", "keys"]

const roleWords: Readonly<Record<MusicRole, ReadonlyArray<string>>> = {
    drums: ["鼓", "drum", "drums", "beat", "节拍"],
    bass: ["贝斯", "bass", "低频", "sub"],
    keys: ["和弦", "keys", "keyboard", "chord", "chords", "键盘", "铺底"]
}

const includesAny = (text: string, words: ReadonlyArray<string>): boolean =>
    words.some(word => text.includes(word))

const extractTempo = (prompt: string): Nullable<number> => {
    const match = prompt.match(/(?:bpm|tempo|速度|节奏)\s*[:：]?\s*(\d{2,3})/i)
    if (isAbsent(match)) {return null}
    const value = Number(match[1])
    return Number.isFinite(value) && value >= 30 && value <= 240 ? value : null
}

const extractBars = (text: string): 4 | 8 => {
    if (/(?:8|八)\s*(?:小节|bars?)/i.test(text)) {return 8}
    return 4
}

const inferStyle = (text: string, snapshot: DawProjectSnapshot): LocalStyle => {
    if (includesAny(text, ["r&b", "rnb", "节奏布鲁斯"])) {return "rnb"}
    if (includesAny(text, ["dubstep", "回响贝斯"])) {return "dubstep"}
    const existing = snapshot.tracks
        .find(track => track.generated && track.style !== null)?.style?.toLowerCase()
    return existing?.includes("dubstep") ? "dubstep" : "rnb"
}

const inferIntent = (text: string, snapshot: DawProjectSnapshot): MusicIntent => {
    const hasGeneratedTracks = snapshot.tracks.some(track => track.generated)
    if (hasGeneratedTracks && includesAny(text, [
        "改成", "换成", "改为", "换为", "restyle", "change to", "switch to"
    ])) {
        return "restyle"
    }
    if (hasGeneratedTracks && includesAny(text, [
        "只改", "只把", "仅改", "保留", "更松", "更紧", "增强", "减弱", "modify", "only"
    ])) {
        return "modify"
    }
    if (includesAny(text, ["添加", "增加", "加上", "叠加", "add ", "layer"])) {return "add"}
    return "create"
}

const mentionedRoles = (text: string): ReadonlyArray<MusicRole> =>
    allRoles.filter(role => includesAny(text, roleWords[role]))

const preservedRoles = (text: string): ReadonlyArray<MusicRole> =>
    allRoles.filter(role => roleWords[role].some(word =>
        text.includes(`保留${word}`)
        || text.includes(`保留 ${word}`)
        || text.includes(`keep ${word}`)
        || text.includes(`preserve ${word}`)))

const selectTargetRoles = (intent: MusicIntent, text: string,
                           preserved: ReadonlyArray<MusicRole>): ReadonlyArray<MusicRole> => {
    const mentioned = mentionedRoles(text).filter(role => !preserved.includes(role))
    if (intent === "restyle") {return allRoles.filter(role => !preserved.includes(role))}
    if (intent === "modify") {return mentioned.length > 0 ? mentioned : allRoles.filter(role => !preserved.includes(role))}
    if (intent === "add") {return mentioned.length > 0 ? mentioned : ["keys"]}
    return mentioned.length > 0 ? mentioned : allRoles
}

const seedFor = (prompt: string, role: MusicRole, style: LocalStyle): number => {
    const value = `${prompt.trim().toLowerCase()}|${role}|${style}`
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 1
}

const targetForRole = (snapshot: DawProjectSnapshot, role: MusicRole,
                       preserveTrackIds: ReadonlyArray<string>): ProjectTrackSnapshot | null =>
    snapshot.tracks.find(track =>
        track.generated && track.role === role && !preserveTrackIds.includes(track.id)) ?? null

const createRoleAction = (
    prompt: string,
    snapshot: DawProjectSnapshot,
    intent: MusicIntent,
    role: MusicRole,
    style: LocalStyle,
    preserveTrackIds: ReadonlyArray<string>,
    startBar: number,
    bars: 4 | 8,
    density: number,
    energy: number
): UpsertRoleTrackAction => {
    const target = intent === "add" ? null : targetForRole(snapshot, role, preserveTrackIds)
    const seed = seedFor(prompt, role, style)
    return {
        type: "upsert-role-track",
        mode: target === null ? "create" : "replace",
        targetTrackId: target?.id ?? null,
        role,
        style,
        startBar,
        bars,
        rootMidi: role === "drums" ? 36 : role === "bass" ? 38 : 62,
        seed,
        density,
        energy,
        midiAssetId: `auto:${style}:${role}:${seed}`,
        midiAssetPath: `Automatic ${style} ${role} library match`
    }
}

export namespace LocalMusicPlanner {
    export const create = (prompt: string, snapshot: DawProjectSnapshot): AgentPlan => {
        const normalized = prompt.toLowerCase()
        const style = inferStyle(normalized, snapshot)
        const profile = StyleProfiles[style]
        const intent = inferIntent(normalized, snapshot)
        const preserved = preservedRoles(normalized)
        const preserveTrackIds = snapshot.tracks
            .filter(track => track.generated && track.role !== null && preserved.includes(track.role))
            .map(track => track.id)
        const targetRoles = selectTargetRoles(intent, normalized, preserved)
        const chorus = includesAny(normalized, ["副歌", "chorus"])
        const startBar = chorus ? 9 : 1
        const bars = chorus ? 8 : extractBars(normalized)
        const spacious = includesAny(normalized, ["不要太满", "留白", "简单", "稀疏", "更松", "松一点"])
        const intense = includesAny(normalized, ["更炸", "爆发", "压迫", "强烈", "intense", "hard"])
        const density = spacious ? 0.48 : style === "dubstep" ? 0.72 : 0.64
        const energy = intense
            ? Math.min(1, profile.defaultEnergy + 0.12)
            : spacious
                ? Math.max(0.25, profile.defaultEnergy - 0.12)
                : profile.defaultEnergy
        const requestedTempo = extractTempo(prompt)
        const bpm = requestedTempo ?? profile.bpm
        const shouldSetStyleTempo = intent === "create" || intent === "restyle"
        const actions: Array<AgentPlan["actions"][number]> = []
        if ((isDefined(requestedTempo) || shouldSetStyleTempo) && Math.round(snapshot.bpm) !== bpm) {
            actions.push({type: "set-tempo", bpm})
        }
        targetRoles.forEach(role => actions.push(createRoleAction(
            prompt,
            snapshot,
            intent,
            role,
            style,
            preserveTrackIds,
            startBar,
            bars,
            density,
            energy
        )))
        const operation = intent === "restyle"
            ? `Restyle the DAWdex arrangement as ${style === "dubstep" ? "Dubstep" : "R&B"}`
            : intent === "modify"
                ? `Modify ${targetRoles.join(", ")} while preserving the other roles`
                : intent === "add"
                    ? `Add a ${targetRoles.join(", ")} layer`
                    : `Create a ${style === "dubstep" ? "Dubstep" : "R&B"} band arrangement`
        return {
            id: crypto.randomUUID(),
            prompt,
            title: operation,
            summary: `${profile.description}. ${preserveTrackIds.length} explicitly preserved track${preserveTrackIds.length === 1 ? "" : "s"}.`,
            rationale: [
                `Use seeded, editable MIDI for deterministic variation`,
                `Upsert DAWdex role tracks instead of stacking duplicates`,
                `Apply the complete change as one undoable transaction`
            ],
            brief: {
                intent,
                style,
                styleAlternatives: [],
                moods: [style === "rnb" ? "laid-back" : "intense"],
                decisionSummary: `Legacy local ${style} plan`,
                instrumentation: targetRoles,
                bpm,
                key: "D minor",
                bars,
                energy,
                swing: profile.swing,
                preserveTrackIds,
                targetRoles
            },
            actions,
            source: "local"
        }
    }
}
