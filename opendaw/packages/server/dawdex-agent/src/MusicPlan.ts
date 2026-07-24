import {z} from "zod"
import type {MidiCandidate} from "./MidiCatalog.ts"

const MusicIntentSchema = z.enum(["create", "add", "restyle", "modify"])
const MusicRoleSchema = z.enum(["drums", "bass", "keys"])
const StyleSchema = z.string().trim().min(1).max(80)

const ProjectRegionSnapshotSchema = z.object({
    id: z.string().min(1).max(80),
    position: z.number().nonnegative(),
    duration: z.number().positive(),
    noteCount: z.number().int().nonnegative(),
    midiFingerprint: z.string().max(80).nullable()
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
        regions: z.array(ProjectRegionSnapshotSchema).max(64)
    })).max(128)
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
    midiAssetPath: z.string().min(1).max(512)
})

export const PlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(200)).min(1).max(6),
    brief: MusicBriefSchema,
    actions: z.array(z.discriminatedUnion("type", [
        SetTempoActionSchema,
        UpsertRoleTrackActionSchema
    ])).min(1).max(8)
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
        midiAssetPath: z.string().min(1).max(512)
    })).min(1).max(8)
})

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>
export type PlanOutput = z.infer<typeof PlanOutputSchema>

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
- The selected MIDI file is the musical source. DAWdex may loop, crop, transpose by octaves, and fit role range,
  but must not synthesize a replacement note pattern.
- Explain the candidate and arrangement choices in concise user-facing rationale entries.

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

export const parseCodexPlan = (value: unknown): PlanOutput => {
    const raw = CodexPlanOutputSchema.parse(value)
    return PlanOutputSchema.parse({
        title: raw.title,
        summary: raw.summary,
        rationale: raw.rationale,
        brief: raw.brief,
        actions: raw.actions.map(action => action.type === "set-tempo"
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
                midiAssetPath: action.midiAssetPath
            })
    })
}
