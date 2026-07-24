import {MusicRole, SupportedStyle} from "../AgentProtocol"

export type DawdexTrackMetadata = {
    readonly role: MusicRole
    readonly style: SupportedStyle | null
}

const roleAliases: ReadonlyArray<readonly [MusicRole, ReadonlyArray<string>]> = [
    ["drums", ["drum", "drums", "鼓"]],
    ["bass", ["bass", "贝斯", "低频"]],
    ["keys", [
        "keys", "key", "chord", "chords", "keyboard", "lead", "idea",
        "和弦", "键盘", "主奏", "旋律"
    ]]
]

export const dawdexTrackName = (role: MusicRole, style: SupportedStyle): string => {
    const roleName = role === "drums" ? "Drums" : role === "bass" ? "Bass" : "Keys"
    const styleName = style === "dubstep" ? "Dubstep" : "R&B"
    return `DAWdex ${roleName} · ${styleName}`
}

export const readDawdexTrackMetadata = (name: string): DawdexTrackMetadata | null => {
    const normalized = name.toLowerCase()
    if (!normalized.startsWith("dawdex")) {return null}
    const role = roleAliases.find(([, aliases]) => aliases.some(alias => normalized.includes(alias)))?.[0]
    if (role === undefined) {return null}
    const style = normalized.includes("dubstep")
        ? "dubstep"
        : normalized.includes("r&b") || normalized.includes("rnb")
            ? "rnb"
            : null
    return {role, style}
}
