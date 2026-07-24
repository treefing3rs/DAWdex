import {createServer} from "node:http"
import type {IncomingMessage, ServerResponse} from "node:http"
import {Agent, run} from "@openai/agents"
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

type ProgressStage = "understanding" | "direction" | "searching" | "arranging" | "review"
type ProgressUpdate = {readonly stage: ProgressStage, readonly message: string}
type ProgressSink = (update: ProgressUpdate) => void
type ProviderSource = "codex" | "model"

const creativeDirectorAgent = new Agent({
    name: "DAWdex Creative Director",
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    instructions: CREATIVE_DIRECTOR_INSTRUCTIONS,
    outputType: CreativeBriefSchema
})

const producerAgent = new Agent({
    name: "DAWdex Arranger",
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    instructions: PRODUCER_INSTRUCTIONS,
    outputType: ProducerOutputSchema
})

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

const runOpenAiBrief = async (
    prompt: string,
    snapshot: ProjectSnapshot
): Promise<CreativeBrief> => {
    ensureOpenAi()
    const result = await run(
        creativeDirectorAgent,
        createCreativeDirectorInput(prompt, snapshot),
        {maxTurns: 3}
    )
    if (!result.finalOutput) {throw new Error("No Creative Brief returned")}
    return result.finalOutput
}

const runOpenAiPlan = async (
    prompt: string,
    snapshot: ProjectSnapshot,
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>
): Promise<PlanOutput> => {
    ensureOpenAi()
    const result = await run(
        producerAgent,
        createProducerInput(prompt, snapshot, brief, candidates),
        {maxTurns: 3}
    )
    if (!result.finalOutput) {throw new Error("No arrangement plan returned")}
    return parseProducerPlan(result.finalOutput)
}

const planCandidates = async (
    prompt: string,
    brief: CreativeBrief
): Promise<ReadonlyArray<MidiCandidate>> =>
    (await Promise.all(brief.targetRoles.map(role => {
        const terms = brief.searchTerms[role]
        return midiCatalog.candidates(
            brief.style,
            role,
            brief.bpm,
            brief.key,
            `${prompt} ${terms.join(" ")}`,
            8,
            brief.bars,
            terms
        )
    }))).flat()

const validatePlan = (
    plan: PlanOutput,
    brief: CreativeBrief,
    candidates: ReadonlyArray<MidiCandidate>
): PlanOutput => {
    const allowed = new Map(candidates.map(candidate => [candidate.id, candidate]))
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
        return {
            ...action,
            style: brief.style,
            midiAssetId: candidate.id,
            midiAssetPath: candidate.path
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

const planWithProvider = async (
    source: ProviderSource,
    prompt: string,
    snapshot: ProjectSnapshot,
    emit: ProgressSink
): Promise<{source: ProviderSource, output: PlanOutput}> => {
    const brief = source === "codex"
        ? await codex.createCreativeBrief(prompt, snapshot)
        : await runOpenAiBrief(prompt, snapshot)
    emit({
        stage: "direction",
        message: `音乐方向：${brief.style}。${brief.decisionSummary}`
    })
    emit({
        stage: "searching",
        message: `正在按 ${brief.bpm} BPM、${brief.key} 和 ${brief.moods.join(" / ")} 检索真实 MIDI…`
    })
    const candidates = await planCandidates(prompt, brief)
    for (const role of brief.targetRoles) {
        if (!candidates.some(candidate => candidate.role === role)) {
            throw new Error(`No usable ${brief.style} ${role} MIDI candidates were found`)
        }
    }
    emit({
        stage: "searching",
        message: `候选已收敛：${candidateSummary(brief, candidates)}；正在比较节奏、音域和密度。`
    })
    emit({
        stage: "arranging",
        message: `正在把 ${brief.instrumentation.join("、")} 编排成可编辑轨道…`
    })
    const rawPlan = source === "codex"
        ? await codex.createPlan(prompt, snapshot, brief, candidates)
        : await runOpenAiPlan(prompt, snapshot, brief, candidates)
    const output = validatePlan(rawPlan, brief, candidates)
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
