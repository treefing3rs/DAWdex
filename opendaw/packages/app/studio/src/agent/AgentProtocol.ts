export const DAWDEX_VERSION = "0.3.0"

export type AgentPlanSource = "codex" | "kimi" | "qoder" | "model" | "local"
export type AgentProviderId = "codex" | "openai" | "local"

// ── 本地 CLI 运行时适配器契约（/v1/runtimes） ────────────────────────────────
export type AgentRuntimeId = "codex" | "kimi" | "qoder"
export type AgentRuntimeModel = {readonly id: string, readonly label: string}
export type AgentRuntimeSummary = {
    readonly id: AgentRuntimeId
    readonly name: string
    readonly available: boolean
    readonly selectable: boolean
    readonly displayPath: string | null
    readonly version: string | null
    readonly authState: "unknown" | "authenticated" | "unauthenticated"
    readonly models: ReadonlyArray<AgentRuntimeModel>
    readonly modelsSource: "live" | "default" | "fallback"
    readonly diagnostic: string | null
}
export type AgentRuntimeSelection = {
    readonly mode: "auto" | "local-cli" | "api-key"
    readonly runtimeId: AgentRuntimeId | null
    readonly model: string | null
    readonly lockedByEnvironment: boolean
}
export type AgentRuntimeSnapshot = {
    readonly scan: {readonly state: string, readonly startedAt: string, readonly completedAt: string}
    readonly selection: AgentRuntimeSelection
    readonly runtimes: ReadonlyArray<AgentRuntimeSummary>
}
export type MusicIntent = "create" | "add" | "restyle" | "modify"
export type MusicRole = "drums" | "bass" | "keys"
export type SupportedStyle = string
export type SynthWaveform = "sine" | "triangle" | "saw" | "square"
export type SynthVoicing = "mono" | "poly"
export type DelayTiming = "eighth" | "dotted-eighth" | "quarter" | "dotted-quarter" | "half"
export type PlannedInstrumentKind = "vaporisateur" | "playfield" | "soundfont" | "nano"
export type DrumKitPreset = "TR-808" | "TR-909"

export type SynthSoundParameters = {
    readonly attack: number
    readonly decay: number
    readonly sustain: number
    readonly release: number
    readonly cutoff: number
    readonly resonance: number
    readonly voicing: SynthVoicing
    readonly unisonCount: 1 | 3 | 5
    readonly unisonDetune: number
    readonly oscillator1: {
        readonly waveform: SynthWaveform
        readonly volumeDb: number
        readonly octave: number
    }
    readonly oscillator2: {
        readonly waveform: SynthWaveform
        readonly volumeDb: number
        readonly octave: number
    }
    readonly noiseAttack: number
    readonly noiseHold: number
    readonly noiseRelease: number
    readonly noiseVolumeDb: number
}

export type TrackMixerSettings = {
    readonly volumeDb: number
    readonly panning: number
    readonly mute: boolean
    readonly solo: boolean
}

export type CompressorEffect = {
    readonly kind: "compressor"
    readonly enabled: boolean
    readonly thresholdDb: number
    readonly ratio: number
    readonly attackMs: number
    readonly releaseMs: number
    readonly mix: number
}

export type DelayEffect = {
    readonly kind: "delay"
    readonly enabled: boolean
    readonly timing: DelayTiming
    readonly feedback: number
    readonly filter: number
    readonly wetDb: number
}

export type ReverbEffect = {
    readonly kind: "reverb"
    readonly enabled: boolean
    readonly preDelayMs: number
    readonly decay: number
    readonly damping: number
    readonly wetDb: number
}

export type StereoEffect = {
    readonly kind: "stereo"
    readonly enabled: boolean
    readonly width: number
}

export type MaximizerEffect = {
    readonly kind: "maximizer"
    readonly enabled: boolean
    readonly thresholdDb: number
}

export type TrackEffect =
    | CompressorEffect
    | DelayEffect
    | ReverbEffect
    | StereoEffect
    | MaximizerEffect

export type TrackSoundDesign = {
    readonly instrument: {
        readonly kind: PlannedInstrumentKind
        readonly presetLabel: string
        readonly assetId: string
        readonly presetIndex: number
        readonly drumKit: DrumKitPreset
        readonly parameters: SynthSoundParameters
    }
    readonly mixer: TrackMixerSettings
    readonly effects: ReadonlyArray<TrackEffect>
}

export type ProjectTrackSoundSnapshot = {
    readonly instrumentKind: string
    readonly instrumentLabel: string
    readonly instrumentAssetId: string | null
    readonly instrumentPresetIndex: number | null
    readonly drumKit: DrumKitPreset | null
    readonly synthParameters: SynthSoundParameters | null
    readonly mixer: TrackMixerSettings
    readonly effects: ReadonlyArray<TrackEffect>
    readonly unmanagedEffectCount: number
    readonly fingerprint: string | null
}

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
    readonly sound: ProjectTrackSoundSnapshot
    readonly regions: ReadonlyArray<ProjectRegionSnapshot>
    readonly devices?: ReadonlyArray<DawDeviceSnapshot>
    readonly sends?: ReadonlyArray<DawAuxSendSnapshot>
}

export type ProjectRegionSnapshot = {
    readonly id: string
    readonly name?: string
    readonly position: number
    readonly duration: number
    readonly loopOffset?: number
    readonly loopDuration?: number
    readonly mute?: boolean
    readonly noteCount: number
    readonly midiFingerprint: string | null
}

export type DawParameterSnapshot = {
    readonly key: string
    readonly name: string
    readonly value: number | boolean
    readonly unitValue: number
    readonly displayValue: string
    readonly automated: boolean
}

export type DawDeviceSnapshot = {
    readonly id: string
    readonly kind: string
    readonly category: "channel-strip" | "instrument" | "midi-effect" | "audio-effect"
    readonly label: string
    readonly enabled: boolean
    readonly index: number
    readonly parameters: ReadonlyArray<DawParameterSnapshot>
}

export type DawAuxSendSnapshot = {
    readonly id: string
    readonly targetBusId: string
    readonly gainDb: number
    readonly panning: number
}

export type DawBusSnapshot = {
    readonly id: string
    readonly name: string
    readonly volumeDb: number
    readonly panning: number
    readonly mute: boolean
    readonly solo: boolean
    readonly channelStrip?: DawDeviceSnapshot
    readonly effects: ReadonlyArray<DawDeviceSnapshot>
}

export type DawCapabilitySnapshot = {
    readonly commands: ReadonlyArray<DawControlCommand>
    readonly instruments: ReadonlyArray<{
        readonly kind: string
        readonly requiresAsset: boolean
        readonly available: boolean
    }>
    readonly midiEffects: ReadonlyArray<string>
    readonly audioEffects: ReadonlyArray<string>
}

export type DawTransportSnapshot = {
    readonly playing: boolean
    readonly position: number
    readonly loopEnabled: boolean
    readonly loopFrom: number
    readonly loopTo: number
}

export type DawAssetSnapshot = {
    readonly id: string
    readonly kind: "audio-file" | "soundfont" | "playfield" | "apparat"
    readonly name: string
}

export type DawProjectSnapshot = {
    readonly hasProject: boolean
    readonly bpm: number
    readonly tracks: ReadonlyArray<ProjectTrackSnapshot>
    readonly transport?: DawTransportSnapshot
    readonly buses?: ReadonlyArray<DawBusSnapshot>
    readonly assets?: ReadonlyArray<DawAssetSnapshot>
    readonly capabilities?: DawCapabilitySnapshot
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
    readonly transposeSemitones: number
    readonly midiSections?: ReadonlyArray<{
        readonly assetId: string
        readonly assetPath: string
        readonly label: string
        readonly sectionKind: string
        readonly startBar: number
        readonly bars: number
        readonly transposeSemitones: number
    }>
    readonly sound: TrackSoundDesign
}

export type DawControlCommand =
    | "transport"
    | "loop"
    | "track"
    | "region"
    | "midi-transform"
    | "instrument"
    | "effect"
    | "device-parameter"
    | "automation"
    | "bus"
    | "send"
    | "routing"

export type DawControlParameter = {
    readonly key: string
    readonly numberValue: number
    readonly stringValue: string
    readonly booleanValue: boolean
}

export type DawAutomationPoint = {
    readonly bar: number
    readonly unitValue: number
}

/**
 * Flat on purpose: strict model response schemas reject nested action unions. The
 * executor still validates each command, operation, target, key, and value through
 * the capability registry before mutating the project.
 */
export type DawControlAction = {
    readonly type: "control"
    readonly command: DawControlCommand
    readonly operation: string
    readonly targetTrackId: string | null
    readonly targetRegionId: string | null
    readonly targetDeviceId: string | null
    readonly targetBusId: string | null
    readonly kind: string
    readonly name: string
    readonly assetId: string
    readonly index: number
    readonly enabled: boolean
    readonly value: number
    readonly secondaryValue: number
    readonly seed: number
    readonly parameters: ReadonlyArray<DawControlParameter>
    readonly points: ReadonlyArray<DawAutomationPoint>
}

export type DawAction = SetTempoAction | UpsertRoleTrackAction | DawControlAction

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
                if (action.sound.instrument.presetLabel.length > 0) {
                    const effects = action.sound.effects.map(effect => effect.kind).join(", ") || "dry"
                    return `${operation} ${action.role} · ${action.style} · `
                        + `${action.sound.instrument.presetLabel} · ${effects} · ${asset}`
                }
                return `${operation} ${action.role} · ${action.style} · ${asset} · bars ${action.startBar}–${action.startBar + action.bars - 1}`
            }
            case "control":
                return `${action.command}: ${action.operation}`
                    + (action.name.length > 0 ? ` · ${action.name}` : "")
                    + (action.kind.length > 0 ? ` · ${action.kind}` : "")
        }
    }
}
