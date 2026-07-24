import {spawn} from "node:child_process"
import type {ChildProcessWithoutNullStreams} from "node:child_process"
import {constants} from "node:fs"
import {access, mkdir} from "node:fs/promises"
import {homedir, tmpdir} from "node:os"
import {join} from "node:path"
import {createInterface} from "node:readline"
import {z} from "zod"
import {
    CreativeBriefSchema,
    createCreativeDirectorInput,
    CodexPlanOutputSchema,
    createProducerInput,
    CREATIVE_DIRECTOR_INSTRUCTIONS,
    parseCreativeBrief,
    parseCodexPlan,
    PRODUCER_INSTRUCTIONS
} from "./MusicPlan.ts"
import type {CreativeBrief, PlanOutput, ProjectSnapshot} from "./MusicPlan.ts"
import type {MidiCandidate} from "./MidiCatalog.ts"

type JsonObject = Record<string, unknown>

type PendingRequest = {
    readonly resolve: (value: unknown) => void
    readonly reject: (reason: Error) => void
    readonly timeout: ReturnType<typeof setTimeout>
}

type PendingTurn = {
    output: string | null
    readonly resolve: (value: string) => void
    readonly reject: (reason: Error) => void
    readonly timeout: ReturnType<typeof setTimeout>
}

type CodexAccount = {
    readonly type: string
    readonly email?: string | null
    readonly planType?: string | null
}

type RateLimitWindow = {
    readonly usedPercent: number
    readonly windowDurationMins: number | null
    readonly resetsAt: number | null
}

type RateLimitSnapshot = {
    readonly primary?: RateLimitWindow | null
}

export type CodexProviderStatus = {
    readonly available: boolean
    readonly authenticated: boolean
    readonly accountType: string | null
    readonly email: string | null
    readonly planType: string | null
    readonly rateLimit: RateLimitWindow | null
    readonly error: string | null
}

export type CodexLoginResult = {
    readonly alreadyAuthenticated: boolean
    readonly authUrl: string | null
    readonly loginId: string | null
}

const isObject = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null

const errorMessage = (value: unknown): string =>
    value instanceof Error ? value.message : String(value)

const requestTimeoutMs = 15_000
const turnTimeoutMs = Number(process.env.DAWDEX_CODEX_TIMEOUT_MS ?? "90000")

export class CodexAppServer {
    readonly #pendingRequests = new Map<number, PendingRequest>()
    readonly #pendingTurns = new Map<string, PendingTurn>()
    #process: ChildProcessWithoutNullStreams | null = null
    #starting: Promise<void> | null = null
    #nextRequestId = 1
    #stderrTail = ""

    async status(): Promise<CodexProviderStatus> {
        try {
            await this.#ensureStarted()
            const result = await this.#request("account/read", {refreshToken: false})
            const account = isObject(result) && isObject(result.account)
                ? result.account as CodexAccount
                : null
            const authenticated = account?.type === "chatgpt"
            let rateLimit: RateLimitWindow | null = null
            if (authenticated) {
                const rateLimitResult = await this.#request("account/rateLimits/read", {}, 20_000)
                    .catch(() => null)
                if (isObject(rateLimitResult) && isObject(rateLimitResult.rateLimits)) {
                    const snapshot = rateLimitResult.rateLimits as RateLimitSnapshot
                    if (isObject(snapshot.primary) && typeof snapshot.primary.usedPercent === "number") {
                        rateLimit = snapshot.primary
                    }
                }
            }
            return {
                available: true,
                authenticated,
                accountType: account?.type ?? null,
                email: account?.email ?? null,
                planType: account?.planType ?? null,
                rateLimit,
                error: null
            }
        } catch (error) {
            return {
                available: false,
                authenticated: false,
                accountType: null,
                email: null,
                planType: null,
                rateLimit: null,
                error: errorMessage(error)
            }
        }
    }

    async startLogin(): Promise<CodexLoginResult> {
        await this.#ensureStarted()
        const current = await this.status()
        if (current.authenticated) {
            return {alreadyAuthenticated: true, authUrl: null, loginId: null}
        }
        const result = await this.#request("account/login/start", {
            type: "chatgpt",
            useHostedLoginSuccessPage: true,
            appBrand: "codex"
        })
        if (!isObject(result)
            || result.type !== "chatgpt"
            || typeof result.authUrl !== "string"
            || typeof result.loginId !== "string") {
            throw new Error("Codex returned an invalid ChatGPT login response")
        }
        return {
            alreadyAuthenticated: false,
            authUrl: result.authUrl,
            loginId: result.loginId
        }
    }

    async createCreativeBrief(
        prompt: string,
        snapshot: ProjectSnapshot
    ): Promise<CreativeBrief> {
        return this.#runStructured(
            createCreativeDirectorInput(prompt, snapshot),
            CREATIVE_DIRECTOR_INSTRUCTIONS,
            CreativeBriefSchema,
            parseCreativeBrief
        )
    }

    async createPlan(
        prompt: string,
        snapshot: ProjectSnapshot,
        brief: CreativeBrief,
        candidates: ReadonlyArray<MidiCandidate>
    ): Promise<PlanOutput> {
        return this.#runStructured(
            createProducerInput(prompt, snapshot, brief, candidates),
            PRODUCER_INSTRUCTIONS,
            CodexPlanOutputSchema,
            parseCodexPlan
        )
    }

    async #runStructured<T>(
        input: string,
        instructions: string,
        schema: z.ZodType<T>,
        parse: (value: unknown) => T
    ): Promise<T> {
        await this.#ensureStarted()
        const status = await this.status()
        if (!status.authenticated) {
            throw new Error("Codex is not signed in with a ChatGPT account")
        }
        const workdir = process.env.DAWDEX_CODEX_CWD ?? join(tmpdir(), "dawdex-codex")
        await mkdir(workdir, {recursive: true})
        const threadResult = await this.#request("thread/start", {
            cwd: workdir,
            approvalPolicy: "never",
            sandbox: "read-only",
            baseInstructions: instructions,
            developerInstructions: "Return only the requested structured data. Do not use tools or inspect the filesystem.",
            ephemeral: true,
            serviceName: "dawdex"
        }, 30_000)
        const threadId = isObject(threadResult)
            && isObject(threadResult.thread)
            && typeof threadResult.thread.id === "string"
            ? threadResult.thread.id
            : null
        if (threadId === null) {
            throw new Error("Codex did not return a thread id")
        }
        const completion = new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pendingTurns.delete(threadId)
                reject(new Error(`Codex planning timed out after ${turnTimeoutMs}ms`))
            }, turnTimeoutMs)
            this.#pendingTurns.set(threadId, {output: null, resolve, reject, timeout})
        })
        const turnParams: JsonObject = {
            threadId,
            input: [{type: "text", text: input}],
            approvalPolicy: "never",
            sandboxPolicy: {type: "readOnly", networkAccess: false},
            outputSchema: z.toJSONSchema(schema)
        }
        const configuredModel = process.env.DAWDEX_CODEX_MODEL?.trim()
        if (configuredModel) {turnParams.model = configuredModel}
        try {
            await this.#request("turn/start", turnParams, 30_000)
            const output = await completion
            return parse(JSON.parse(output) as unknown)
        } catch (error) {
            const pending = this.#pendingTurns.get(threadId)
            if (pending) {
                clearTimeout(pending.timeout)
                this.#pendingTurns.delete(threadId)
            }
            throw error
        }
    }

    dispose(): void {
        this.#process?.kill()
        this.#process = null
        this.#starting = null
        this.#rejectAll(new Error("Codex app-server stopped"))
    }

    async #ensureStarted(): Promise<void> {
        if (this.#process !== null) {return}
        if (this.#starting === null) {
            this.#starting = this.#start().finally(() => {
                this.#starting = null
            })
        }
        await this.#starting
    }

    async #start(): Promise<void> {
        const executable = await this.#resolveExecutable()
        const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
        })
        this.#process = child
        child.stderr.setEncoding("utf8")
        child.stderr.on("data", (chunk: string) => {
            this.#stderrTail = `${this.#stderrTail}${chunk}`.slice(-4_000)
        })
        createInterface({input: child.stdout}).on("line", line => this.#handleLine(line))
        child.once("exit", (code, signal) => {
            if (this.#process !== child) {return}
            this.#process = null
            const suffix = this.#stderrTail.trim()
            this.#rejectAll(new Error(
                `Codex app-server exited (${code ?? signal ?? "unknown"})${suffix ? `: ${suffix}` : ""}`
            ))
        })
        await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve)
            child.once("error", reject)
        })
        await this.#requestRaw("initialize", {
            clientInfo: {
                name: "dawdex",
                title: "DAWdex",
                version: "0.1.0"
            },
            capabilities: {
                optOutNotificationMethods: [
                    "item/agentMessage/delta",
                    "item/reasoning/summaryTextDelta",
                    "item/reasoning/textDelta"
                ]
            }
        })
        this.#notify("initialized", {})
    }

    async #resolveExecutable(): Promise<string> {
        const configured = process.env.DAWDEX_CODEX_PATH?.trim()
        if (configured) {
            await access(configured, constants.F_OK)
            return configured
        }
        if (process.platform === "win32") {
            const bundled = join(homedir(), ".codex", ".sandbox-bin", "codex.exe")
            if (await access(bundled, constants.F_OK).then(() => true, () => false)) {
                return bundled
            }
            return "codex.exe"
        }
        return "codex"
    }

    async #request(method: string, params: unknown, timeoutMs: number = requestTimeoutMs): Promise<unknown> {
        await this.#ensureStarted()
        return this.#requestRaw(method, params, timeoutMs)
    }

    #requestRaw(method: string, params: unknown, timeoutMs: number = requestTimeoutMs): Promise<unknown> {
        const id = this.#nextRequestId++
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.#pendingRequests.delete(id)
                reject(new Error(`Codex request "${method}" timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            this.#pendingRequests.set(id, {resolve, reject, timeout})
            try {
                this.#write({id, method, params})
            } catch (error) {
                clearTimeout(timeout)
                this.#pendingRequests.delete(id)
                reject(error instanceof Error ? error : new Error(String(error)))
            }
        })
    }

    #notify(method: string, params: unknown): void {
        this.#write({method, params})
    }

    #write(message: unknown): void {
        if (this.#process === null || this.#process.stdin.destroyed) {
            throw new Error("Codex app-server is not running")
        }
        this.#process.stdin.write(`${JSON.stringify(message)}\n`)
    }

    #handleLine(line: string): void {
        let message: unknown
        try {
            message = JSON.parse(line) as unknown
        } catch {
            return
        }
        if (!isObject(message)) {return}
        if (typeof message.id === "number" && !("method" in message)) {
            const pending = this.#pendingRequests.get(message.id)
            if (!pending) {return}
            clearTimeout(pending.timeout)
            this.#pendingRequests.delete(message.id)
            if (isObject(message.error)) {
                pending.reject(new Error(
                    typeof message.error.message === "string"
                        ? message.error.message
                        : JSON.stringify(message.error)
                ))
            } else {
                pending.resolve(message.result)
            }
            return
        }
        if (typeof message.method !== "string") {return}
        if (typeof message.id === "number") {
            this.#write({
                id: message.id,
                error: {code: -32601, message: `DAWdex does not handle "${message.method}"`}
            })
            return
        }
        if (message.method === "item/completed" && isObject(message.params)) {
            const threadId = typeof message.params.threadId === "string" ? message.params.threadId : null
            const item = isObject(message.params.item) ? message.params.item : null
            const pending = threadId === null ? undefined : this.#pendingTurns.get(threadId)
            if (pending && item?.type === "agentMessage" && typeof item.text === "string") {
                if (item.phase === "final_answer" || pending.output === null) {
                    pending.output = item.text
                }
            }
            return
        }
        if (message.method === "turn/completed" && isObject(message.params)) {
            const threadId = typeof message.params.threadId === "string" ? message.params.threadId : null
            if (threadId === null) {return}
            const pending = this.#pendingTurns.get(threadId)
            if (!pending) {return}
            clearTimeout(pending.timeout)
            this.#pendingTurns.delete(threadId)
            const turn = isObject(message.params.turn) ? message.params.turn : null
            if (turn?.status === "completed" && pending.output !== null) {
                pending.resolve(pending.output)
            } else {
                const detail = isObject(turn?.error) && typeof turn.error.message === "string"
                    ? turn.error.message
                    : `Codex turn ended with status ${String(turn?.status ?? "unknown")}`
                pending.reject(new Error(detail))
            }
        }
    }

    #rejectAll(error: Error): void {
        for (const pending of this.#pendingRequests.values()) {
            clearTimeout(pending.timeout)
            pending.reject(error)
        }
        this.#pendingRequests.clear()
        for (const pending of this.#pendingTurns.values()) {
            clearTimeout(pending.timeout)
            pending.reject(error)
        }
        this.#pendingTurns.clear()
    }
}
