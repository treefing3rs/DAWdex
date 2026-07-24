import {z} from "zod"

const MusicIntentSchema = z.enum(["create", "add", "restyle", "modify"])
const MusicRoleSchema = z.enum(["drums", "bass", "keys"])
const SupportedStyleSchema = z.enum(["dubstep", "rnb"])

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
        style: SupportedStyleSchema.nullable(),
        midiFingerprint: z.string().max(80).nullable(),
        regions: z.array(ProjectRegionSnapshotSchema).max(64)
    })).max(128)
})

export const RequestSchema = z.object({
    prompt: z.string().min(1).max(300),
    snapshot: ProjectSnapshotSchema
})

const MusicBriefSchema = z.object({
    intent: MusicIntentSchema,
    style: SupportedStyleSchema,
    bpm: z.number().min(30).max(240),
    key: z.string().min(1).max(32),
    bars: z.union([z.literal(4), z.literal(8)]),
    energy: z.number().min(0).max(1),
    swing: z.number().min(0).max(1),
    preserveTrackIds: z.array(z.string().min(1).max(80)).max(16),
    targetRoles: z.array(MusicRoleSchema).min(1).max(3)
})

const SetTempoActionSchema = z.object({
    type: z.literal("set-tempo"),
    bpm: z.number().min(30).max(240)
})

const UpsertRoleTrackActionSchema = z.object({
    type: z.literal("upsert-role-track"),
    mode: z.enum(["create", "replace"]),
    targetTrackId: z.string().min(1).max(80).nullable(),
    role: MusicRoleSchema,
    style: SupportedStyleSchema,
    startBar: z.number().int().min(1).max(128),
    bars: z.number().int().min(1).max(16),
    rootMidi: z.number().int().min(24).max(84),
    seed: z.number().int().min(0).max(0x7FFFFFFF),
    density: z.number().min(0.1).max(1),
    energy: z.number().min(0.1).max(1)
})

export const PlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(160)).min(1).max(4),
    brief: MusicBriefSchema,
    actions: z.array(z.discriminatedUnion("type", [
        SetTempoActionSchema,
        UpsertRoleTrackActionSchema
    ])).min(1).max(8)
})

export const CodexPlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(160)).min(1).max(4),
    brief: MusicBriefSchema,
    actions: z.array(z.object({
        type: z.enum(["set-tempo", "upsert-role-track"]),
        bpm: z.number().min(30).max(240),
        mode: z.enum(["create", "replace"]),
        targetTrackId: z.string().min(1).max(80).nullable(),
        role: MusicRoleSchema,
        style: SupportedStyleSchema,
        startBar: z.number().int().min(1).max(128),
        bars: z.number().int().min(1).max(16),
        rootMidi: z.number().int().min(24).max(84),
        seed: z.number().int().min(0).max(0x7FFFFFFF),
        density: z.number().min(0.1).max(1),
        energy: z.number().min(0.1).max(1)
    })).min(1).max(8)
})

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
export type PlanOutput = z.infer<typeof PlanOutputSchema>

export const PRODUCER_INSTRUCTIONS = `You are the planning brain of DAWdex, an AI-native music production app built on openDAW.
Translate the user's creative intent into a small, safe, editable MusicBrief and action plan.

Intent rules:
- create: build a new arrangement or upsert the main DAWdex roles. A general style request targets drums, bass, and keys.
- add: preserve existing material and create only the requested extra role or layer.
- restyle: when the user says "改成", "换成", "restyle", or "change to", replace every existing generated DAWdex role unless explicitly preserved.
- modify: replace only the requested role. Preserve every non-target role.

Music rules:
- Only styles "dubstep" and "rnb" are supported.
- Dubstep defaults to 140 BPM, D minor, half-time drums, syncopated sub bass, and sparse keys.
- R&B defaults to 82 BPM, D minor, swung drums, conversational bass, and seventh/ninth keys.
- Use exact generated track ids from the snapshot as targetTrackId for replace actions.
- Never target a user track or an id listed in preserveTrackIds.
- Use mode "replace" for an existing generated role and mode "create" only when no target exists or intent is add.
- Give each role a deterministic non-negative integer seed. Different roles must not share a seed.
- Use rootMidi 36 for drums, 38 for bass, and 50 for keys unless the requested key requires a transposition.

Safety rules:
- Never access files, run commands, browse the web, or call tools. You only produce the requested structured plan.
- Never claim that an action has already happened.
- Prefer 1-4 high-level actions and never exceed 8.
- Preserve any track the user explicitly asks to preserve.
- Only use the available action schema.
- Every action in the Codex schema must include every field. For set-tempo, fill unused role fields with safe defaults; they are ignored.
- Respond in the language used by the user.`

export const createProducerInput = (prompt: string, snapshot: ProjectSnapshot): string =>
    `${PRODUCER_INSTRUCTIONS}

User request and current project snapshot:
${JSON.stringify({prompt, project: snapshot})}`

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
                energy: action.energy
            })
    })
}
