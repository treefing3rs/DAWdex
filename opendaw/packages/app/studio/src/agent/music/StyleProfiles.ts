import {SupportedStyle} from "../AgentProtocol"

export type StyleProfile = {
    readonly style: SupportedStyle
    readonly bpm: number
    readonly swing: number
    readonly defaultEnergy: number
    readonly description: string
}

export const StyleProfiles: Readonly<Record<SupportedStyle, StyleProfile>> = {
    dubstep: {
        style: "dubstep",
        bpm: 140,
        swing: 0,
        defaultEnergy: 0.84,
        description: "140 BPM half-time drums, syncopated sub bass, and sparse minor stabs"
    },
    rnb: {
        style: "rnb",
        bpm: 82,
        swing: 0.58,
        defaultEnergy: 0.58,
        description: "laid-back swung drums, conversational bass, and spacious seventh/ninth voicings"
    }
}
