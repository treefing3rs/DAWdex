export const DAWDEX_VERSION = "0.2.0"

export type AgentPlanSource = "codex" | "model" | "local"
export type AgentProviderId = "codex" | "openai" | "local"
export type MusicIntent = "create" | "add" | "restyle" | "modify"
export type MusicRole = "drums" | "bass" | "keys"
export type SupportedStyle = string

export type AgentProgressStage =
    | "understanding"
    | "direction"
    | "searching"
    | "arranging"
    | "review"

export type AgentProgress = {
    readonly stage: AgentProgressStage
    readonly message: string
}

export type CodexRateLimit = {
    readonly usedPercent: number
    readonly windowDurationMins: number | null
    readonly resetsAt: number | null
}

export type CodexProviderStatus = {
    readonly available: boolean
    readonly authenticated: boolean
    readonly accountType: string | null
    readonly email: string | null
    readonly planType: string | null
    readonly rateLimit: CodexRateLimit | null
    readonly error: string | null
}

export type AgentProviderStatus = {
    readonly activeProvider: AgentProviderId
    readonly preference: string
    readonly codex: CodexProviderStatus
    readonly openai: {
        readonly configured: boolean
    }
}

export type CodexLoginResult = {
    readonly alreadyAuthenticated: boolean
    readonly authUrl: string | null
    readonly loginId: string | null
}

export type ProjectTrackSnapshot = {
    readonly id: string
    readonly name: string
    readonly trackCount: number
    readonly regionCount: number
    readonly generated: boolean
    readonly role: MusicRole | null
    readonly style: SupportedStyle | null
    readonly midiFingerprint: string | null
    readonly regions: ReadonlyArray<ProjectRegionSnapshot>
}

export type ProjectRegionSnapshot = {
    readonly id: string
    readonly position: number
    readonly duration: number
    readonly noteCount: number
    readonly midiFingerprint: string | null
}

export type DawProjectSnapshot = {
    readonly hasProject: boolean
    readonly bpm: number
    readonly tracks: ReadonlyArray<ProjectTrackSnapshot>
}

export type SetTempoAction = {
    readonly type: "set-tempo"
    readonly bpm: number
}

export type UpsertRoleTrackAction = {
    readonly type: "upsert-role-track"
    readonly mode: "create" | "replace"
    readonly targetTrackId: string | null
    readonly role: MusicRole
    readonly style: SupportedStyle
    readonly startBar: number
    readonly bars: number
    readonly rootMidi: number
    readonly seed: number
    readonly density: number
    readonly energy: number
    readonly midiAssetId: string
    readonly midiAssetPath: string
}

export type DawAction = SetTempoAction | UpsertRoleTrackAction

export type MusicBrief = {
    readonly intent: MusicIntent
    readonly style: SupportedStyle
    readonly styleAlternatives: ReadonlyArray<string>
    readonly moods: ReadonlyArray<string>
    readonly decisionSummary: string
    readonly instrumentation: ReadonlyArray<string>
    readonly bpm: number
    readonly key: string
    readonly bars: 4 | 8
    readonly energy: number
    readonly swing: number
    readonly preserveTrackIds: ReadonlyArray<string>
    readonly targetRoles: ReadonlyArray<MusicRole>
}

export type AgentPlan = {
    readonly id: string
    readonly prompt: string
    readonly title: string
    readonly summary: string
    readonly rationale: ReadonlyArray<string>
    readonly brief: MusicBrief
    readonly actions: ReadonlyArray<DawAction>
    readonly source: AgentPlanSource
}

export namespace DawAction {
    export const describe = (action: DawAction): string => {
        switch (action.type) {
            case "set-tempo":
                return `Set tempo to ${Math.round(action.bpm)} BPM`
            case "upsert-role-track": {
                const operation = action.mode === "replace" ? "Replace" : "Create"
                const asset = action.midiAssetPath.split("/").at(-1) ?? action.midiAssetId
                return `${operation} ${action.role} · ${action.style} · ${asset} · bars ${action.startBar}–${action.startBar + action.bars - 1}`
            }
        }
    }
}
