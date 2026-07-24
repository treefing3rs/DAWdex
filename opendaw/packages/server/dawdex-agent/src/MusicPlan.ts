import {z} from "zod"
import type {MidiCandidate} from "./MidiCatalog.ts"

const MusicIntentSchema = z.enum(["create", "add", "restyle", "modify"])
const MusicRoleSchema = z.enum(["drums", "bass", "keys"])
const StyleSchema = z.string().trim().min(1).max(80)
const SynthWaveformSchema = z.enum(["sine", "triangle", "saw", "square"])
const DelayTimingSchema = z.enum(["eighth", "dotted-eighth", "quarter", "dotted-quarter", "half"])

const SynthSoundParametersSchema = z.object({
    attack: z.number().min(0.001).max(4),
    decay: z.number().min(0.001).max(4),
    sustain: z.number().min(0).max(1),
    release: z.number().min(0.001).max(8),
    cutoff: z.number().min(40).max(20_000),
    resonance: z.number().min(0).max(10),
    voicing: z.enum(["mono", "poly"]),
    unisonCount: z.union([z.literal(1), z.literal(3), z.literal(5)]),
    unisonDetune: z.number().min(0).max(100),
    oscillator1: z.object({
        waveform: SynthWaveformSchema,
        volumeDb: z.number().min(-96).max(6),
        octave: z.number().int().min(-3).max(3)
    }),
    oscillator2: z.object({
        waveform: SynthWaveformSchema,
        volumeDb: z.number().min(-96).max(6),
        octave: z.number().int().min(-3).max(3)
    }),
    noiseAttack: z.number().min(0.001).max(4),
    noiseHold: z.number().min(0.001).max(4),
    noiseRelease: z.number().min(0.001).max(8),
    noiseVolumeDb: z.number().min(-96).max(0)
})

const TrackMixerSettingsSchema = z.object({
    volumeDb: z.number().min(-24).max(6),
    panning: z.number().min(-1).max(1),
    mute: z.boolean(),
    solo: z.boolean()
})

const TrackEffectSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("compressor"),
        enabled: z.boolean(),
        thresholdDb: z.number().min(-60).max(0),
        ratio: z.number().min(1).max(24),
        attackMs: z.number().min(0).max(100),
        releaseMs: z.number().min(5).max(1_500),
        mix: z.number().min(0).max(1)
    }),
    z.object({
        kind: z.literal("delay"),
        enabled: z.boolean(),
        timing: DelayTimingSchema,
        feedback: z.number().min(0).max(0.95),
        filter: z.number().min(-1).max(1),
        wetDb: z.number().min(-48).max(0)
    }),
    z.object({
        kind: z.literal("reverb"),
        enabled: z.boolean(),
        preDelayMs: z.number().min(0).max(1_000),
        decay: z.number().min(0).max(1),
        damping: z.number().min(0).max(1),
        wetDb: z.number().min(-48).max(0)
    }),
    z.object({
        kind: z.literal("stereo"),
        enabled: z.boolean(),
        width: z.number().min(-1).max(1)
    }),
    z.object({
        kind: z.literal("maximizer"),
        enabled: z.boolean(),
        thresholdDb: z.number().min(-24).max(0)
    })
])

const TrackSoundDesignSchema = z.object({
    instrument: z.object({
        kind: z.literal("vaporisateur"),
        presetLabel: z.string().trim().min(1).max(64),
        parameters: SynthSoundParametersSchema
    }),
    mixer: TrackMixerSettingsSchema,
    effects: z.array(TrackEffectSchema).max(4)
})

// Codex response_format rejects `oneOf` inside array items. Keep its wire schema flat,
// then convert each effect back into the strict discriminated union used by DAWdex.
const CodexTrackEffectSchema = z.object({
    kind: z.enum(["compressor", "delay", "reverb", "stereo", "maximizer"]),
    enabled: z.boolean(),
    thresholdDb: z.number().min(-60).max(0),
    ratio: z.number().min(1).max(24),
    attackMs: z.number().min(0).max(100),
    releaseMs: z.number().min(5).max(1_500),
    mix: z.number().min(0).max(1),
    timing: DelayTimingSchema,
    feedback: z.number().min(0).max(0.95),
    filter: z.number().min(-1).max(1),
    wetDb: z.number().min(-48).max(0),
    preDelayMs: z.number().min(0).max(1_000),
    decay: z.number().min(0).max(1),
    damping: z.number().min(0).max(1),
    width: z.number().min(-1).max(1)
})

const CodexTrackSoundDesignSchema = z.object({
    instrument: TrackSoundDesignSchema.shape.instrument,
    mixer: TrackMixerSettingsSchema,
    effects: z.array(CodexTrackEffectSchema).max(4)
})

const ProjectTrackSoundSnapshotSchema = z.object({
    instrumentKind: z.string().min(1).max(80),
    instrumentLabel: z.string().max(120),
    synthParameters: SynthSoundParametersSchema.nullable(),
    mixer: TrackMixerSettingsSchema,
    effects: z.array(TrackEffectSchema).max(16),
    unmanagedEffectCount: z.number().int().nonnegative(),
    fingerprint: z.string().max(80).nullable()
})

const ProjectRegionSnapshotSchema = z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(120).optional(),
    position: z.number().nonnegative(),
    duration: z.number().positive(),
    loopOffset: z.number().optional(),
    loopDuration: z.number().positive().optional(),
    mute: z.boolean().optional(),
    noteCount: z.number().int().nonnegative(),
    midiFingerprint: z.string().max(80).nullable()
})

const DawParameterSnapshotSchema = z.object({
    key: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    value: z.union([z.number(), z.boolean()]),
    unitValue: z.number().min(0).max(1),
    displayValue: z.string().max(120),
    automated: z.boolean()
})

const DawDeviceSnapshotSchema = z.object({
    id: z.string().min(1).max(80),
    kind: z.string().min(1).max(80),
    category: z.enum(["channel-strip", "instrument", "midi-effect", "audio-effect"]),
    label: z.string().max(120),
    enabled: z.boolean(),
    index: z.number().int(),
    parameters: z.array(DawParameterSnapshotSchema).max(128)
})

const DawAuxSendSnapshotSchema = z.object({
    id: z.string().min(1).max(80),
    targetBusId: z.string().min(1).max(80),
    gainDb: z.number().min(-96).max(6),
    panning: z.number().min(-1).max(1)
})

const DawBusSnapshotSchema = z.object({
    id: z.string().min(1).max(80),
    name: z.string().max(120),
    volumeDb: z.number().min(-96).max(6),
    panning: z.number().min(-1).max(1),
    mute: z.boolean(),
    solo: z.boolean(),
    channelStrip: DawDeviceSnapshotSchema.optional(),
    effects: z.array(DawDeviceSnapshotSchema).max(64)
})

const DawCapabilitySnapshotSchema = z.object({
    commands: z.array(z.enum([
        "transport", "loop", "track", "region", "midi-transform", "instrument", "effect",
        "device-parameter", "automation", "bus", "send", "routing"
    ])).max(16),
    instruments: z.array(z.object({
        kind: z.string().min(1).max(80),
        requiresAsset: z.boolean(),
        available: z.boolean()
    })).max(16),
    midiEffects: z.array(z.string().min(1).max(80)).max(32),
    audioEffects: z.array(z.string().min(1).max(80)).max(64)
})

export const ProjectSnapshotSchema = z.object({
    hasProject: z.boolean(),
    bpm: z.number().min(30).max(1000),
    tracks: z.array(z.object({
        id: z.string().min(1).max(80),
        name: z.string().max(120),
        trackCount: z.number().int().nonnegative(),
        regionCount: z.number().int().nonnegative(),
        generated: z.boolean(),
        role: MusicRoleSchema.nullable(),
        style: StyleSchema.nullable(),
        midiFingerprint: z.string().max(80).nullable(),
        sound: ProjectTrackSoundSnapshotSchema,
        regions: z.array(ProjectRegionSnapshotSchema).max(64),
        devices: z.array(DawDeviceSnapshotSchema).max(128).optional(),
        sends: z.array(DawAuxSendSnapshotSchema).max(32).optional()
    })).max(128),
    transport: z.object({
        playing: z.boolean(),
        position: z.number().nonnegative(),
        loopEnabled: z.boolean(),
        loopFrom: z.number().nonnegative(),
        loopTo: z.number().nonnegative()
    }).optional(),
    buses: z.array(DawBusSnapshotSchema).max(64).optional(),
    assets: z.array(z.object({
        id: z.string().min(1).max(80),
        kind: z.enum(["audio-file", "soundfont", "playfield", "apparat"]),
        name: z.string().max(120)
    })).max(512).optional(),
    capabilities: DawCapabilitySnapshotSchema.optional()
})

export const RequestSchema = z.object({
    prompt: z.string().min(1).max(300),
    snapshot: ProjectSnapshotSchema
})

const SearchTermsSchema = z.object({
    drums: z.array(z.string().trim().min(1).max(40)).max(12),
    bass: z.array(z.string().trim().min(1).max(40)).max(12),
    keys: z.array(z.string().trim().min(1).max(40)).max(12)
})

export const CreativeBriefSchema = z.object({
    intent: MusicIntentSchema,
    style: StyleSchema,
    styleAlternatives: z.array(StyleSchema).max(4),
    moods: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
    decisionSummary: z.string().trim().min(1).max(320),
    instrumentation: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
    bpm: z.number().min(30).max(240),
    key: z.string().trim().min(1).max(32),
    bars: z.union([z.literal(4), z.literal(8)]),
    energy: z.number().min(0).max(1),
    swing: z.number().min(0).max(1),
    preserveTrackIds: z.array(z.string().min(1).max(80)).max(16),
    targetRoles: z.array(MusicRoleSchema).min(1).max(3),
    searchTerms: SearchTermsSchema
})

const MusicBriefSchema = CreativeBriefSchema.omit({searchTerms: true})

const SetTempoActionSchema = z.object({
    type: z.literal("set-tempo"),
    bpm: z.number().min(30).max(240)
})

const UpsertRoleTrackActionSchema = z.object({
    type: z.literal("upsert-role-track"),
    mode: z.enum(["create", "replace"]),
    targetTrackId: z.string().min(1).max(80).nullable(),
    role: MusicRoleSchema,
    style: StyleSchema,
    startBar: z.number().int().min(1).max(128),
    bars: z.number().int().min(1).max(16),
    rootMidi: z.number().int().min(24).max(84),
    seed: z.number().int().min(0).max(0x7FFFFFFF),
    density: z.number().min(0.1).max(1),
    energy: z.number().min(0.1).max(1),
    midiAssetId: z.string().min(1).max(80),
    midiAssetPath: z.string().min(1).max(512),
    sound: TrackSoundDesignSchema
})

const DawControlParameterSchema = z.object({
    key: z.string().trim().min(1).max(80),
    numberValue: z.number(),
    stringValue: z.string().max(512),
    booleanValue: z.boolean()
})

const DawAutomationPointSchema = z.object({
    bar: z.number().min(1).max(512),
    unitValue: z.number().min(0).max(1)
})

export const DawControlActionSchema = z.object({
    type: z.literal("control"),
    command: z.enum([
        "transport", "loop", "track", "region", "midi-transform", "instrument", "effect",
        "device-parameter", "automation", "bus", "send", "routing"
    ]),
    operation: z.string().trim().min(1).max(40),
    targetTrackId: z.string().min(1).max(80).nullable(),
    targetRegionId: z.string().min(1).max(80).nullable(),
    targetDeviceId: z.string().min(1).max(80).nullable(),
    targetBusId: z.string().min(1).max(80).nullable(),
    kind: z.string().max(80),
    name: z.string().max(120),
    assetId: z.string().max(80),
    index: z.number().int().min(0).max(128),
    enabled: z.boolean(),
    value: z.number(),
    secondaryValue: z.number(),
    seed: z.number().int().min(0).max(0x7FFFFFFF),
    parameters: z.array(DawControlParameterSchema).max(64),
    points: z.array(DawAutomationPointSchema).max(128)
})

export const PlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(200)).min(1).max(6),
    brief: MusicBriefSchema,
    actions: z.array(z.discriminatedUnion("type", [
        SetTempoActionSchema,
        UpsertRoleTrackActionSchema,
        DawControlActionSchema
    ])).min(1).max(20)
})

export const ProducerOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(200)).min(1).max(6),
    brief: MusicBriefSchema,
    actions: z.array(z.discriminatedUnion("type", [
        SetTempoActionSchema,
        UpsertRoleTrackActionSchema
    ])).max(8),
    controls: z.array(DawControlActionSchema).max(12)
})

export const CodexPlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(200)).min(1).max(6),
    brief: MusicBriefSchema,
    actions: z.array(z.object({
        type: z.enum(["set-tempo", "upsert-role-track"]),
        bpm: z.number().min(30).max(240),
        mode: z.enum(["create", "replace"]),
        targetTrackId: z.string().min(1).max(80).nullable(),
        role: MusicRoleSchema,
        style: StyleSchema,
        startBar: z.number().int().min(1).max(128),
        bars: z.number().int().min(1).max(16),
        rootMidi: z.number().int().min(24).max(84),
        seed: z.number().int().min(0).max(0x7FFFFFFF),
        density: z.number().min(0.1).max(1),
        energy: z.number().min(0.1).max(1),
        midiAssetId: z.string().min(1).max(80),
        midiAssetPath: z.string().min(1).max(512),
        sound: CodexTrackSoundDesignSchema
    })).max(8),
    controls: z.array(DawControlActionSchema).max(12)
})

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>
export type PlanOutput = z.infer<typeof PlanOutputSchema>
export type ProducerOutput = z.infer<typeof ProducerOutputSchema>

export const CREATIVE_DIRECTOR_INSTRUCTIONS = `You are the Creative Director of DAWdex.
The user is a music enthusiast who may describe only a feeling, scene, or story. Translate that language into an
open-ended professional music brief. Do not require the user to know a genre.

Creative rules:
- Genre is not a whitelist. Infer any fitting genre or hybrid direction, such as house, neo-soul, cinematic,
  bossa nova, ambient, jazz, pop, hip-hop, funk, or styles not listed here.
- Consider several plausible directions, choose one, and provide a concise user-facing decisionSummary.
- Never expose private chain-of-thought. Report only useful decisions and musical reasons.
- Choose musically coherent BPM, key, groove, energy, swing, instrumentation, and mood tags.
- The current MIDI library is organized into drums, bass, and keys. Map the desired arrangement onto whichever
  of those roles are useful; instrumentation may describe more specific sounds for a future instrument catalog.
- Produce English searchTerms that are likely to appear in MIDI library paths or tags. Include genre synonyms,
  groove terms, and relevant library terms for every role.
- Infer create/add/restyle/modify from the request and current project. Preserve explicit track IDs.
- Use 4 or 8 bars for the current editable loop implementation.
- Respond in the user's language for decisionSummary and instrumentation labels.`

export const PRODUCER_INSTRUCTIONS = `You are the Arranger of DAWdex.
Turn the approved Creative Brief into a small, safe, editable action plan using only the supplied real MIDI
candidates. The Creative Brief has already chosen the musical direction; do not replace it with a different genre.

Arrangement rules:
- Use exact generated track IDs from the snapshot for replace actions.
- Never target a user track or an ID listed in preserveTrackIds.
- Use mode "replace" for an existing generated role and "create" only when no target exists or intent is add.
- Give each role a deterministic non-negative integer seed. Different roles must not share a seed.
- Use rootMidi 36 for drums, 38 for bass, and 62 for keys. Keys must not be placed in the bass register.
- Every upsert action must choose one exact midiAssetId and midiAssetPath from the supplied candidates for the
  same role. Set action.style exactly to the Creative Brief style.
- Every upsert action must include an intentional sound design. The current safe sound engine is Vaporisateur:
  choose a user-facing presetLabel and set its envelope, filter, resonance, voicing, unison, two oscillators,
  and noise parameters. Do not reuse the same patch for drums, bass, and keys.
- Choose mixer volume and panning for each role. Keep mute and solo false unless the user explicitly asks.
- Build a restrained role-appropriate effects chain with at most four effects. Typical choices are compression
  for drums/bass, reverb or delay for keys, stereo widening for pads, and maximizer only when musically justified.
  Effects and parameters must follow the supplied schema; avoid putting wide stereo or reverb on sub bass.
- The Codex effect wire object is intentionally flat: include every effect field even when its kind does not use
  that field. Safe unused values are thresholdDb -12, ratio 2, attackMs 10, releaseMs 100, mix 1,
  timing "quarter", feedback 0.25, filter 0, wetDb -18, preDelayMs 0, decay 0.5, damping 0.5, and width 0.
- The selected MIDI file is the musical source. DAWdex may loop, crop, transpose by octaves, and fit role range,
  but must not synthesize a replacement note pattern.
- Explain the candidate and arrangement choices in concise user-facing rationale entries.

DAW control plane:
- Always return a controls array, even when it is empty. Use controls for requested edits that are not MIDI
  asset replacement. Use exact track, region, device, bus, and asset IDs from the snapshot.
- Supported command/operation pairs are:
  transport play|pause|stop|seek; loop set; track rename|delete|enable|disable;
  region move|resize|rename|mute|unmute|duplicate|delete;
  midi-transform transpose|velocity|quantize|humanize; instrument replace;
  effect add|update|remove|move|enable|disable; device-parameter set;
  automation replace|clear; bus create|update|delete; send upsert|remove; routing set-output.
- Every control object must include every schema field. For unused fields use null target IDs, empty strings,
  index 0, enabled false, value 0, secondaryValue 0, seed 0, and empty parameters/points.
- Device and effect parameters use the exact parameter key exposed in project.tracks[].devices[].parameters.
  numberValue is a normalized 0..1 device value; keep stringValue empty and booleanValue false when unused.
- Effects, parameters, and automation may target either a track or a bus. For a bus, leave targetTrackId null,
  set targetBusId, and use the device ID from project.buses[].channelStrip/effects.
- Automation uses the same targetDeviceId and a parameters entry naming the exact key, plus two or more points
  whose bar is 1-based and unitValue is normalized 0..1.
- For effect add, choose only a kind listed in project.capabilities.midiEffects/audioEffects. For instrument
  replace, choose only an available project capability. Soundfont/Nano/Playfield/Apparat require an exact
  compatible project.assets ID; never invent an asset or create an empty instrument that cannot sound.
- Region positions, loop start, seek, and automation points use 1-based bars. Region resize and loop length use
  bar counts. MIDI transpose uses semitones; velocity uses a multiplier; quantize uses 4, 8, 16, or 32;
  humanize uses timing PPQN in value, velocity variation 0..0.5 in secondaryValue, and a deterministic seed.
- Send value is gain in dB and secondaryValue is pan -1..1. Bus update and arbitrary device parameter changes
  should prefer normalized parameters. Do not delete a bus until its routes and sends have been removed.
- Transport actions are approved like other actions but are not written into Undo history. All project edits
  are applied as one undo step.

Safety rules:
- Never access files, run commands, browse the web, or call tools.
- Never claim that actions have already happened.
- Prefer 1-4 high-level actions and never exceed 8.
- Every action in the Codex schema must include every field. For set-tempo, fill unused fields with safe defaults
  and use "none" for MIDI asset fields; they are ignored.
- Respond in the language used by the user.`

export const createCreativeDirectorInput = (
    prompt: string,
    snapshot: ProjectSnapshot
): string =>
    `${CREATIVE_DIRECTOR_INSTRUCTIONS}

User request and current project snapshot:
${JSON.stringify({prompt, project: snapshot})}`

export const createProducerInput = (
    prompt: string,
    snapshot: ProjectSnapshot,
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>
): string =>
    `${PRODUCER_INSTRUCTIONS}

User request, fixed Creative Brief, current project snapshot, and curated MIDI candidates:
${JSON.stringify({prompt, creativeBrief: brief, project: snapshot, midiCandidates: candidates})}`

export const parseCreativeBrief = (value: unknown): CreativeBrief =>
    CreativeBriefSchema.parse(value)

const parseCodexEffect = (
    effect: z.infer<typeof CodexTrackEffectSchema>
): z.infer<typeof TrackEffectSchema> => {
    switch (effect.kind) {
        case "compressor":
            return {
                kind: effect.kind,
                enabled: effect.enabled,
                thresholdDb: effect.thresholdDb,
                ratio: effect.ratio,
                attackMs: effect.attackMs,
                releaseMs: effect.releaseMs,
                mix: effect.mix
            }
        case "delay":
            return {
                kind: effect.kind,
                enabled: effect.enabled,
                timing: effect.timing,
                feedback: effect.feedback,
                filter: effect.filter,
                wetDb: effect.wetDb
            }
        case "reverb":
            return {
                kind: effect.kind,
                enabled: effect.enabled,
                preDelayMs: effect.preDelayMs,
                decay: effect.decay,
                damping: effect.damping,
                wetDb: effect.wetDb
            }
        case "stereo":
            return {
                kind: effect.kind,
                enabled: effect.enabled,
                width: effect.width
            }
        case "maximizer":
            return {
                kind: effect.kind,
                enabled: effect.enabled,
                thresholdDb: effect.thresholdDb
            }
    }
}

export const parseCodexPlan = (value: unknown): PlanOutput => {
    const raw = CodexPlanOutputSchema.parse(value)
    return PlanOutputSchema.parse({
        title: raw.title,
        summary: raw.summary,
        rationale: raw.rationale,
        brief: raw.brief,
        actions: [
            ...raw.actions.map(action => action.type === "set-tempo"
                ? {type: action.type, bpm: action.bpm}
                : {
                    type: action.type,
                    mode: action.mode,
                    targetTrackId: action.targetTrackId,
                    role: action.role,
                    style: action.style,
                    startBar: action.startBar,
                    bars: action.bars,
                    rootMidi: action.rootMidi,
                    seed: action.seed,
                    density: action.density,
                    energy: action.energy,
                    midiAssetId: action.midiAssetId,
                    midiAssetPath: action.midiAssetPath,
                    sound: {
                        ...action.sound,
                        effects: action.sound.effects.map(parseCodexEffect)
                    }
                }),
            ...raw.controls
        ]
    })
}

export const parseProducerPlan = (value: unknown): PlanOutput => {
    const raw = ProducerOutputSchema.parse(value)
    return PlanOutputSchema.parse({
        title: raw.title,
        summary: raw.summary,
        rationale: raw.rationale,
        brief: raw.brief,
        actions: [
            ...raw.actions,
            ...raw.controls
        ]
    })
}
