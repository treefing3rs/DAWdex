import {createServer} from "node:http"
import type {IncomingMessage, ServerResponse} from "node:http"
import {Agent, run} from "@openai/agents"
import {CodexAppServer} from "./CodexAppServer.ts"
import {
    createProducerInput,
    PlanOutputSchema,
    PRODUCER_INSTRUCTIONS,
    RequestSchema
} from "./MusicPlan.ts"
import type {PlanOutput, ProjectSnapshot} from "./MusicPlan.ts"

const producerAgent = new Agent({
    name: "DAWdex Producer",
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    instructions: PRODUCER_INSTRUCTIONS,
    outputType: PlanOutputSchema
})

const codex = new CodexAppServer()
const allowedOrigin = process.env.DAWDEX_STUDIO_ORIGIN ?? "http://localhost:8080"
const port = Number(process.env.DAWDEX_AGENT_PORT ?? "8787")
const providerPreference = process.env.DAWDEX_AGENT_PROVIDER ?? "auto"

const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
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

const runOpenAiPlan = async (prompt: string, snapshot: ProjectSnapshot): Promise<PlanOutput> => {
    if (typeof process.env.OPENAI_API_KEY !== "string" || process.env.OPENAI_API_KEY.length === 0) {
        throw new Error("OPENAI_API_KEY is not configured")
    }
    const result = await run(producerAgent, createProducerInput(prompt, snapshot), {maxTurns: 3})
    if (!result.finalOutput) {throw new Error("No plan returned")}
    return result.finalOutput
}

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
    let codexError: unknown = null
    if (providerPreference !== "openai") {
        const codexStatus = await codex.status()
        if (codexStatus.authenticated) {
            try {
                const output = await codex.createPlan(prompt, snapshot)
                sendJson(response, 200, {
                    id: crypto.randomUUID(),
                    prompt,
                    ...output,
                    source: "codex"
                })
                return
            } catch (error) {
                codexError = error
                if (providerPreference === "codex") {
                    sendJson(response, 502, {error: String(error)})
                    return
                }
            }
        } else if (providerPreference === "codex") {
            sendJson(response, 503, {error: codexStatus.error ?? "Codex is not signed in with ChatGPT"})
            return
        }
    }
    try {
        const output = await runOpenAiPlan(prompt, snapshot)
        sendJson(response, 200, {
            id: crypto.randomUUID(),
            prompt,
            ...output,
            source: "model"
        })
    } catch (openaiError) {
        sendJson(response, 503, {
            error: codexError === null
                ? String(openaiError)
                : `Codex failed: ${String(codexError)}; OpenAI fallback failed: ${String(openaiError)}`
        })
    }
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
    if (request.method === "POST" && request.url === "/v1/plan") {
        handlePlan(request, response).catch(error => sendJson(response, 500, {error: String(error)}))
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
