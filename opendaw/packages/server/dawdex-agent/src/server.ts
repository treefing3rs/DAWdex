import {createServer, IncomingMessage, ServerResponse} from "node:http"
import {Agent, run} from "@openai/agents"
import {z} from "zod"

const ProjectSnapshotSchema = z.object({
    hasProject: z.boolean(),
    bpm: z.number().min(30).max(1000),
    tracks: z.array(z.object({
        name: z.string().max(120),
        trackCount: z.number().int().nonnegative(),
        regionCount: z.number().int().nonnegative()
    })).max(128)
})

const RequestSchema = z.object({
    prompt: z.string().min(1).max(300),
    snapshot: ProjectSnapshotSchema
})

const SetTempoActionSchema = z.object({
    type: z.literal("set-tempo"),
    bpm: z.number().min(30).max(240)
})

const CreateInstrumentActionSchema = z.object({
    type: z.literal("create-instrument"),
    name: z.string().min(1).max(48),
    pattern: z.enum(["bass", "chords", "pulse", "lead"]),
    startBar: z.number().int().min(1).max(128),
    bars: z.number().int().min(1).max(16),
    rootMidi: z.number().int().min(24).max(84),
    velocity: z.number().min(0.1).max(1),
    density: z.number().min(0.1).max(1)
})

const PlanOutputSchema = z.object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(320),
    rationale: z.array(z.string().min(1).max(160)).min(1).max(4),
    actions: z.array(z.discriminatedUnion("type", [
        SetTempoActionSchema,
        CreateInstrumentActionSchema
    ])).min(1).max(8)
})

const producerAgent = new Agent({
    name: "DAWdex Producer",
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    instructions: `You are the planning brain of DAWdex, an AI-native music production app built on openDAW.
Translate the user's creative intent into a small, safe, editable plan.

Rules:
- Never claim that an action has already happened.
- Preserve any track the user explicitly asks to preserve.
- Prefer 1-4 high-level actions and never exceed 8.
- Use MIDI note number 38 as D2 for bass, 50 as D3 for chords, and 62 as D4 for lead when no key is known.
- Use bars 9-16 for a requested chorus unless the user specifies another section.
- Reduce density to roughly 0.45 when the user asks for space or says "不要太满".
- Only use the available action schema.
- Respond in the language used by the user.`,
    outputType: PlanOutputSchema
})

const allowedOrigin = process.env.DAWDEX_STUDIO_ORIGIN ?? "http://localhost:8080"
const port = Number(process.env.DAWDEX_AGENT_PORT ?? "8787")

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
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

const handlePlan = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (typeof process.env.OPENAI_API_KEY !== "string" || process.env.OPENAI_API_KEY.length === 0) {
        sendJson(response, 503, {error: "OPENAI_API_KEY is not configured"})
        return
    }
    const bodyResult = await readBody(request).then(
        value => ({status: "resolved", value} as const),
        error => ({status: "rejected", error} as const)
    )
    if (bodyResult.status === "rejected") {
        sendJson(response, 400, {error: String(bodyResult.error)})
        return
    }
    const jsonResult = await Promise.resolve().then(
        () => ({status: "resolved", value: JSON.parse(bodyResult.value) as unknown} as const),
        error => ({status: "rejected", error} as const)
    )
    if (jsonResult.status === "rejected") {
        sendJson(response, 400, {error: "Invalid JSON"})
        return
    }
    const requestResult = RequestSchema.safeParse(jsonResult.value)
    if (!requestResult.success) {
        sendJson(response, 400, {error: requestResult.error.flatten()})
        return
    }
    const {prompt, snapshot} = requestResult.data
    const runResult = await run(producerAgent, JSON.stringify({prompt, project: snapshot}), {maxTurns: 3}).then(
        value => ({status: "resolved", value} as const),
        error => ({status: "rejected", error} as const)
    )
    if (runResult.status === "rejected" || !runResult.value.finalOutput) {
        sendJson(response, 502, {error: runResult.status === "rejected" ? String(runResult.error) : "No plan returned"})
        return
    }
    sendJson(response, 200, {
        id: crypto.randomUUID(),
        prompt,
        ...runResult.value.finalOutput,
        source: "model"
    })
}

createServer((request, response) => {
    if (request.method === "OPTIONS") {
        sendJson(response, 204, {})
        return
    }
    if (request.method === "POST" && request.url === "/v1/plan") {
        handlePlan(request, response).then(undefined, error => sendJson(response, 500, {error: String(error)}))
        return
    }
    sendJson(response, 404, {error: "Not found"})
}).listen(port, "127.0.0.1", () => {
    console.log(`DAWdex Agent listening on http://127.0.0.1:${port}`)
})
