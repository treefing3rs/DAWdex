import {createServer} from "node:http"
import type {IncomingMessage, ServerResponse} from "node:http"
import {z} from "zod"
// import {Agent, run} from "@openai/agents"  // replaced with direct fetch
import {CodexAppServer} from "./CodexAppServer.ts"
import {
    CreativeBriefSchema,
    createCreativeDirectorInput,
    createProducerInput,
    CREATIVE_DIRECTOR_INSTRUCTIONS,
    parseProducerPlan,
    PlanOutputSchema,
    ProducerOutputSchema,
    PRODUCER_INSTRUCTIONS,
    RequestSchema
} from "./MusicPlan.ts"
import type {CreativeBrief, PlanOutput, ProjectSnapshot} from "./MusicPlan.ts"
import {MidiCatalog} from "./MidiCatalog.ts"
import type {MidiCandidate} from "./MidiCatalog.ts"
import {findExactBundle, rankMidiBundles} from "./MidiBundleRanker.ts"
import type {MidiBundle} from "./MidiBundleRanker.ts"

type ProgressStage = "understanding" | "direction" | "searching" | "arranging" | "review"
type ProgressUpdate = {readonly stage: ProgressStage, readonly message: string}
type ProgressSink = (update: ProgressUpdate) => void
type ProviderSource = "codex" | "model"

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4"
const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
const BRIEF_SCHEMA_HINT = `

You MUST respond with ONLY a single valid JSON object matching this exact schema:
{
  "intent": "create" | "add" | "restyle" | "modify",
  "style": "<genre string>",
  "styleAlternatives": ["<alt1>", ...],
  "moods": ["<mood1>", ...],
  "decisionSummary": "<short summary in user language>",
  "instrumentation": ["<instrument1>", ...],
  "bpm": <number 30-240>,
  "key": "<key string like C minor>",
  "bars": 4 | 8,
  "energy": <number 0-1>,
  "swing": <number 0-1>,
  "preserveTrackIds": [],
  "targetRoles": ["drums", "bass", "keys"],
  "searchTerms": { "drums": ["<term>", ...], "bass": ["<term>", ...], "keys": ["<term>", ...] }
}
No markdown, no code fences, no explanation — just the raw JSON.`

const PLAN_SCHEMA_HINT = `

You MUST respond with ONLY a single valid JSON object matching this exact schema:
{
  "title": "<short title>",
  "summary": "<summary in user language>",
  "rationale": ["<reason1>", ...],
  "brief": { <same fields as creative brief minus searchTerms> },
  "actions": [
    {
      "type": "upsert-role-track",
      "mode": "create" | "replace",
      "targetTrackId": null | "<id>",
      "role": "drums" | "bass" | "keys",
      "style": "<genre>",
      "startBar": 1,
      "bars": 4,
      "rootMidi": 36 (drums) | 38 (bass) | 62 (keys),
      "seed": <random int>,
      "density": <0.1-1>,
      "energy": <0.1-1>,
      "midiAssetId": "<from candidates>",
      "midiAssetPath": "<from candidates>"
    }
  ]
}
No markdown, no code fences, no explanation — just the raw JSON.`

const chatCompletion = async (system: string, user: string): Promise<string> => {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                {role: "system", content: system},
                {role: "user", content: user}
            ],
            temperature: 0.7
        })
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status} ${text.slice(0, 200)}`)
    }
    const json = await res.json() as any
    return json.choices[0].message.content
}
const PRODUCER_SCHEMA_HINT = `${PLAN_SCHEMA_HINT}

Ignore the abbreviated example above when it differs from this exact required JSON Schema:
${JSON.stringify(z.toJSONSchema(ProducerOutputSchema), null, 2)}`

const codex = new CodexAppServer()
const midiCatalog = new MidiCatalog()
const allowedOrigin = process.env.DAWDEX_STUDIO_ORIGIN ?? "http://localhost:8080"
const port = Number(process.env.DAWDEX_AGENT_PORT ?? "8787")
const providerPreference = process.env.DAWDEX_AGENT_PROVIDER ?? "auto"

const corsHeaders = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
}

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8"
    })
    response.end(JSON.stringify(value))
}

const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 64 * 1024) {
            reject(new Error("Request body is too large"))
            request.destroy()
            return
        }
        chunks.push(chunk)
    })
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
})

const parsePlanRequest = async (
    request: IncomingMessage
): Promise<{prompt: string, snapshot: ProjectSnapshot}> => {
    const body = await readBody(request)
    let value: unknown
    try {
        value = JSON.parse(body) as unknown
    } catch {
        throw new Error("Invalid JSON")
    }
    const parsed = RequestSchema.safeParse(value)
    if (!parsed.success) {
        throw new Error(`Invalid planning request: ${JSON.stringify(parsed.error.flatten())}`)
    }
    return parsed.data
}

const ensureOpenAi = (): void => {
    if (typeof process.env.OPENAI_API_KEY !== "string" || process.env.OPENAI_API_KEY.length === 0) {
        throw new Error("OPENAI_API_KEY is not configured")
    }
}

/** Extract JSON from model output (strips markdown fences if present) */
const extractJson = (text: string): unknown => {
    let cleaned = text.trim()
    // Strip ```json ... ``` fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) cleaned = fenceMatch[1].trim()
    return JSON.parse(cleaned)
}

const runOpenAiBrief = async (
    prompt: string,
    snapshot: ProjectSnapshot
): Promise<CreativeBrief> => {
    ensureOpenAi()
    const text = await chatCompletion(
        CREATIVE_DIRECTOR_INSTRUCTIONS + BRIEF_SCHEMA_HINT,
        createCreativeDirectorInput(prompt, snapshot)
    )
    const parsed = extractJson(text)
    return CreativeBriefSchema.parse(parsed)
}

const runOpenAiPlan = async (
    prompt: string,
    snapshot: ProjectSnapshot,
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>,
    bundles: ReadonlyArray<MidiBundle>
): Promise<PlanOutput> => {
    ensureOpenAi()
    const text = await chatCompletion(
        PRODUCER_INSTRUCTIONS + PRODUCER_SCHEMA_HINT,
        createProducerInput(prompt, snapshot, brief, candidates, bundles)
    )
    const parsed = extractJson(text)
    return parseProducerPlan(parsed, {prompt, snapshot})
}

const planCandidates = async (
    prompt: string,
    brief: CreativeBrief,
    emit: ProgressSink
): Promise<{candidates: ReadonlyArray<MidiCandidate>, bundles: ReadonlyArray<MidiBundle>}> => {
    const byRole = await Promise.all(brief.targetRoles.map(async role => {
        const terms = brief.searchTerms[role]
        const candidates = await midiCatalog.candidates(
            brief.style,
            role,
            brief.bpm,
            brief.key,
            `${prompt} ${terms.join(" ")}`,
            12,
            brief.bars,
            terms
        )
        emit({
            stage: "searching",
            message: `${role} 检索完成：从本地 MIDI 索引筛出 ${candidates.length} 个候选。`
        })
        return candidates
    }))
    const candidates = byRole.flat()
    return {candidates, bundles: rankMidiBundles(brief, candidates)}
}

const validatePlan = (
    plan: PlanOutput,
    brief: CreativeBrief,
    snapshot: ProjectSnapshot,
    candidates: ReadonlyArray<MidiCandidate>,
    bundles: ReadonlyArray<MidiBundle>
): PlanOutput => {
    const allowed = new Map(candidates.map(candidate => [candidate.id, candidate]))
    const upserts = plan.actions.filter(action => action.type === "upsert-role-track")
    const selectedByRole = new Map(upserts.map(action => [action.role, action.midiAssetId]))
    if (selectedByRole.size !== upserts.length) {
        throw new Error("Arranger returned more than one MIDI action for the same role")
    }
    const bundle = upserts.length === 0
        ? null
        : findExactBundle(bundles, upserts.map(action => ({
            role: action.role,
            assetId: action.midiAssetId
        })))
    if (upserts.length > 0 && bundle === null) {
        throw new Error("Arranger mixed MIDI assets from incompatible bundles")
    }
    const assets = new Map((snapshot.assets ?? []).map(asset => [asset.id, asset]))
    const instruments = new Map((snapshot.capabilities?.instruments ?? [])
        .map(instrument => [instrument.kind.toLowerCase(), instrument]))
    const actions = plan.actions.map(action => {
        if (action.type === "set-tempo") {return action}
        if (action.type === "control") {return action}
        const candidate = allowed.get(action.midiAssetId)
        if (candidate === undefined || candidate.role !== action.role) {
            throw new Error(`Arranger selected an invalid ${action.role} MIDI asset`)
        }
        if (!brief.targetRoles.includes(action.role)) {
            throw new Error(`Arranger targeted ${action.role}, which is not in the Creative Brief`)
        }
        const instrument = action.sound.instrument
        if (action.role === "drums") {
            if (instrument.kind !== "playfield"
                || (instrument.drumKit !== "TR-808" && instrument.drumKit !== "TR-909")
                || instrument.assetId.length > 0) {
                throw new Error("Drums must use the approved Playfield TR-808 or TR-909 kit")
            }
        } else if (instrument.kind === "playfield") {
            throw new Error(`${action.role} cannot use a drum-kit Playfield`)
        } else if (instrument.kind === "soundfont" || instrument.kind === "nano") {
            const expectedAssetKind = instrument.kind === "soundfont" ? "soundfont" : "audio-file"
            if (assets.get(instrument.assetId)?.kind !== expectedAssetKind) {
                throw new Error(`${action.role} selected an unavailable ${instrument.kind} asset`)
            }
            if (instruments.get(instrument.kind)?.available !== true) {
                throw new Error(`${instrument.kind} is not available in the current project`)
            }
        } else if (instrument.assetId.length > 0) {
            throw new Error("Vaporisateur must not reference an external asset")
        }
        return {
            ...action,
            style: brief.style,
            midiAssetPath: candidate.path,
            transposeSemitones: bundle?.transposeByAssetId[candidate.id] ?? 0
        }
    })
    const {searchTerms: _searchTerms, ...fixedBrief} = brief
    return PlanOutputSchema.parse({...plan, brief: fixedBrief, actions})
}

const candidateSummary = (
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>
): string =>
    brief.targetRoles
        .map(role => `${role} ${candidates.filter(candidate => candidate.role === role).length}`)
        .join(" · ")

const withProgressPulse = async <T>(
    promise: Promise<T>,
    emit: ProgressSink,
    updates: ReadonlyArray<ProgressUpdate>
): Promise<T> => {
    let index = 0
    const timer = setInterval(() => {
        const update = updates[index++ % updates.length]
        if (update !== undefined) {emit(update)}
    }, 2_500)
    try {
        return await promise
    } finally {
        clearInterval(timer)
    }
}

const planWithProvider = async (
    source: ProviderSource,
    prompt: string,
    snapshot: ProjectSnapshot,
    emit: ProgressSink
): Promise<{source: ProviderSource, output: PlanOutput}> => {
    const brief = await withProgressPulse(
        source === "codex"
            ? codex.createCreativeBrief(prompt, snapshot)
            : runOpenAiBrief(prompt, snapshot),
        emit,
        [
            {stage: "understanding", message: "正在把场景描述翻译成情绪、律动和可听见的角色分工…"},
            {stage: "understanding", message: "正在比较几种可能的风格、速度与调性方向…"},
            {stage: "understanding", message: "正在检查现有轨道，判断哪些内容应保留或局部替换…"}
        ]
    )
    emit({
        stage: "direction",
        message: `音乐方向：${brief.style}。${brief.decisionSummary}`
    })
    emit({
        stage: "searching",
        message: `正在按 ${brief.bpm} BPM、${brief.key} 和 ${brief.moods.join(" / ")} 检索真实 MIDI…`
    })
    const {candidates, bundles} = await planCandidates(prompt, brief, emit)
    for (const role of brief.targetRoles) {
        if (!candidates.some(candidate => candidate.role === role)) {
            throw new Error(`No usable ${brief.style} ${role} MIDI candidates were found`)
        }
    }
    emit({
        stage: "searching",
        message: `候选已收敛：${candidateSummary(brief, candidates)}；正在比较节奏、音域和密度。`
    })
    if (bundles.length === 0) {throw new Error("No compatible MIDI bundles were found")}
    emit({
        stage: "searching",
        message: `已组成 ${bundles.length} 组跨轨 Bundle；将统一到 ${brief.key}，避免三轨互相跑调。`
    })
    emit({
        stage: "arranging",
        message: `正在把 ${brief.instrumentation.join("、")} 编排成可编辑轨道…`
    })
    const rawPlan = await withProgressPulse(
        source === "codex"
            ? codex.createPlan(prompt, snapshot, brief, candidates, bundles)
            : runOpenAiPlan(prompt, snapshot, brief, candidates, bundles),
        emit,
        [
            {stage: "arranging", message: "正在比较 Bundle 的律动、段落长度与素材家族关系…"},
            {stage: "arranging", message: `正在检查 Bass 与 Keys 的调性，并计算到 ${brief.key} 的最短移调…`},
            {stage: "arranging", message: "正在检查鼓、贝斯、键盘的音域、密度与进入顺序…"}
        ]
    )
    const output = validatePlan(rawPlan, brief, snapshot, candidates, bundles)
    const selected = output.actions
        .filter(action => action.type === "upsert-role-track")
        .map(action => `${action.role}: ${action.midiAssetPath.split(/[\\/]/).pop()}`
            + (action.transposeSemitones === 0
                ? ""
                : ` (${action.transposeSemitones > 0 ? "+" : ""}${action.transposeSemitones} 半音)`))
        .join("；")
    if (selected.length > 0) {
        emit({stage: "review", message: `已锁定同一组合：${selected}。`})
    }
    emit({
        stage: "review",
        message: `${output.actions.length} 个 DAW 动作已完成校验，等待你的批准。`
    })
    return {source, output}
}

const createPlan = async (
    prompt: string,
    snapshot: ProjectSnapshot,
    emit: ProgressSink
): Promise<{source: ProviderSource, output: PlanOutput}> => {
    emit({
        stage: "understanding",
        message: "正在理解情绪、场景和音乐目标，并比较可能的创作方向…"
    })
    let codexError: unknown = null
    if (providerPreference !== "openai") {
        const status = await codex.status()
        if (status.authenticated) {
            try {
                return await planWithProvider("codex", prompt, snapshot, emit)
            } catch (error) {
                codexError = error
                if (providerPreference === "codex") {throw error}
            }
        } else if (providerPreference === "codex") {
            throw new Error(status.error ?? "Codex is not signed in with ChatGPT")
        }
    }
    try {
        return await planWithProvider("model", prompt, snapshot, emit)
    } catch (openaiError) {
        throw new Error(codexError === null
            ? String(openaiError)
            : `Codex failed: ${String(codexError)}; OpenAI fallback failed: ${String(openaiError)}`)
    }
}

const planResponse = (
    prompt: string,
    result: {source: ProviderSource, output: PlanOutput}
) => ({
    id: crypto.randomUUID(),
    prompt,
    ...result.output,
    source: result.source
})

const handleStatus = async (response: ServerResponse): Promise<void> => {
    const codexStatus = await codex.status()
    const openaiConfigured = typeof process.env.OPENAI_API_KEY === "string"
        && process.env.OPENAI_API_KEY.length > 0
    const activeProvider = providerPreference === "openai" && openaiConfigured
        ? "openai"
        : codexStatus.authenticated && providerPreference !== "openai"
            ? "codex"
            : openaiConfigured && providerPreference !== "codex"
                ? "openai"
                : "local"
    sendJson(response, 200, {
        activeProvider,
        preference: providerPreference,
        codex: codexStatus,
        openai: {configured: openaiConfigured}
    })
}

const handleLogin = async (response: ServerResponse): Promise<void> => {
    const result = await codex.startLogin()
    sendJson(response, 200, result)
}

const handlePlan = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const {prompt, snapshot} = await parsePlanRequest(request)
    const result = await createPlan(prompt, snapshot, () => {})
    sendJson(response, 200, planResponse(prompt, result))
}

const handlePlanStream = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const {prompt, snapshot} = await parsePlanRequest(request)
    response.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
    })
    const write = (value: unknown): void => {
        if (!response.writableEnded) {response.write(`${JSON.stringify(value)}\n`)}
    }
    try {
        const result = await createPlan(prompt, snapshot, update => write({type: "progress", ...update}))
        write({type: "plan", plan: planResponse(prompt, result)})
    } catch (error) {
        write({type: "error", error: String(error)})
    } finally {
        response.end()
    }
}

const handleMidiAsset = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const prefix = "/v1/midi-assets/"
    const rawId = request.url?.startsWith(prefix) ? request.url.slice(prefix.length) : ""
    const id = decodeURIComponent(rawId)
    const asset = await midiCatalog.read(id)
    if (asset === null) {
        sendJson(response, 404, {error: "MIDI asset not found"})
        return
    }
    response.writeHead(200, {
        "Content-Type": "audio/midi",
        "Content-Length": asset.bytes.length,
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Allow-Origin": allowedOrigin
    })
    response.end(asset.bytes)
}

const server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
        sendJson(response, 204, {})
        return
    }
    if (request.method === "GET" && request.url === "/v1/provider/status") {
        handleStatus(response).catch(error => sendJson(response, 500, {error: String(error)}))
        return
    }
    if (request.method === "POST" && request.url === "/v1/provider/codex/login") {
        handleLogin(response).catch(error => sendJson(response, 500, {error: String(error)}))
        return
    }
    if (request.method === "POST" && request.url === "/v1/plan/stream") {
        handlePlanStream(request, response).catch(error => sendJson(response, 500, {error: String(error)}))
        return
    }
    if (request.method === "POST" && request.url === "/v1/plan") {
        handlePlan(request, response).catch(error => sendJson(response, 503, {error: String(error)}))
        return
    }
    if (request.method === "GET" && request.url?.startsWith("/v1/midi-assets/")) {
        handleMidiAsset(request, response).catch(error => sendJson(response, 500, {error: String(error)}))
        return
    }
    sendJson(response, 404, {error: "Not found"})
})

server.listen(port, "127.0.0.1", () => {
    console.log(`DAWdex Agent listening on http://127.0.0.1:${port}`)
})

const shutdown = (): void => {
    codex.dispose()
    server.close()
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
