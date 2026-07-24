import {isAbsent} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {
    AgentProgress,
    AgentPlan,
    AgentProviderStatus,
    CodexLoginResult,
    DawAction,
    DawProjectSnapshot,
    MusicBrief,
    SetTempoAction,
    UpsertRoleTrackAction
} from "./AgentProtocol"

type UnknownSetTempoAction = {[Key in keyof SetTempoAction]?: unknown}
type UnknownUpsertRoleTrackAction = {[Key in keyof UpsertRoleTrackAction]?: unknown}
type UnknownMusicBrief = {[Key in keyof MusicBrief]?: unknown}
type UnknownAgentPlan = {[Key in keyof AgentPlan]?: unknown}

const offlineProviderStatus = (error: string): AgentProviderStatus => ({
    activeProvider: "local",
    preference: "auto",
    codex: {
        available: false,
        authenticated: false,
        accountType: null,
        email: null,
        planType: null,
        rateLimit: null,
        error
    },
    openai: {configured: false}
})

const isObject = (value: unknown): value is Record<string, unknown> =>
    !isAbsent(value) && typeof value === "object"

const isSetTempoAction = (value: unknown): value is SetTempoAction => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const action = value as UnknownSetTempoAction
    return action.type === "set-tempo" && typeof action.bpm === "number"
}

const isUpsertRoleTrackAction = (value: unknown): value is UpsertRoleTrackAction => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const action = value as UnknownUpsertRoleTrackAction
    return action.type === "upsert-role-track"
        && ["create", "replace"].includes(String(action.mode))
        && (action.targetTrackId === null || typeof action.targetTrackId === "string")
        && ["drums", "bass", "keys"].includes(String(action.role))
        && typeof action.style === "string"
        && action.style.length > 0
        && typeof action.startBar === "number"
        && typeof action.bars === "number"
        && typeof action.rootMidi === "number"
        && typeof action.seed === "number"
        && typeof action.density === "number"
        && typeof action.energy === "number"
        && typeof action.midiAssetId === "string"
        && typeof action.midiAssetPath === "string"
}

const isDawAction = (value: unknown): value is DawAction =>
    isSetTempoAction(value) || isUpsertRoleTrackAction(value)

const isMusicBrief = (value: unknown): value is MusicBrief => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const brief = value as UnknownMusicBrief
    return ["create", "add", "restyle", "modify"].includes(String(brief.intent))
        && typeof brief.style === "string"
        && brief.style.length > 0
        && Array.isArray(brief.styleAlternatives)
        && brief.styleAlternatives.every(entry => typeof entry === "string")
        && Array.isArray(brief.moods)
        && brief.moods.every(entry => typeof entry === "string")
        && typeof brief.decisionSummary === "string"
        && Array.isArray(brief.instrumentation)
        && brief.instrumentation.every(entry => typeof entry === "string")
        && typeof brief.bpm === "number"
        && typeof brief.key === "string"
        && (brief.bars === 4 || brief.bars === 8)
        && typeof brief.energy === "number"
        && typeof brief.swing === "number"
        && Array.isArray(brief.preserveTrackIds)
        && brief.preserveTrackIds.every(entry => typeof entry === "string")
        && Array.isArray(brief.targetRoles)
        && brief.targetRoles.every(entry => ["drums", "bass", "keys"].includes(String(entry)))
}

const isAgentPlan = (value: unknown): value is AgentPlan => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const plan = value as UnknownAgentPlan
    return typeof plan.id === "string"
        && typeof plan.prompt === "string"
        && typeof plan.title === "string"
        && typeof plan.summary === "string"
        && Array.isArray(plan.rationale)
        && plan.rationale.every(entry => typeof entry === "string")
        && isMusicBrief(plan.brief)
        && Array.isArray(plan.actions)
        && plan.actions.every(isDawAction)
        && (plan.source === "codex" || plan.source === "model" || plan.source === "local")
}

const isAgentProviderStatus = (value: unknown): value is AgentProviderStatus => {
    if (!isObject(value) || !isObject(value.codex) || !isObject(value.openai)) {return false}
    const codex = value.codex
    return ["codex", "openai", "local"].includes(String(value.activeProvider))
        && typeof value.preference === "string"
        && typeof codex.available === "boolean"
        && typeof codex.authenticated === "boolean"
        && (codex.accountType === null || typeof codex.accountType === "string")
        && (codex.email === null || typeof codex.email === "string")
        && (codex.planType === null || typeof codex.planType === "string")
        && (codex.error === null || typeof codex.error === "string")
        && typeof value.openai.configured === "boolean"
}

const isCodexLoginResult = (value: unknown): value is CodexLoginResult => {
    if (!isObject(value)) {return false}
    return typeof value.alreadyAuthenticated === "boolean"
        && (value.authUrl === null || typeof value.authUrl === "string")
        && (value.loginId === null || typeof value.loginId === "string")
}

const isAgentProgress = (value: unknown): value is AgentProgress =>
    isObject(value)
    && ["understanding", "direction", "searching", "arranging", "review"].includes(String(value.stage))
    && typeof value.message === "string"

export class AgentClient {
    readonly #endpoint: string

    constructor(endpoint: string = import.meta.env.VITE_DAWDEX_AGENT_URL ?? "http://localhost:8787/v1/plan") {
        this.#endpoint = endpoint
    }

    async providerStatus(): Promise<AgentProviderStatus> {
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 8_000)
        const result = await Promises.tryCatch(fetch(this.#url("/v1/provider/status"), {
            method: "GET",
            signal: abortController.signal
        }))
        clearTimeout(timeout)
        if (result.status === "rejected" || !result.value.ok) {
            return offlineProviderStatus(
                result.status === "rejected" ? String(result.error) : `Agent server returned ${result.value.status}`
            )
        }
        const jsonResult = await Promises.tryCatch(result.value.json())
        return jsonResult.status === "resolved" && isAgentProviderStatus(jsonResult.value)
            ? jsonResult.value
            : offlineProviderStatus("Agent server returned an invalid provider status")
    }

    async startCodexLogin(): Promise<CodexLoginResult> {
        const response = await fetch(this.#url("/v1/provider/codex/login"), {method: "POST"})
        const value = await response.json() as unknown
        if (!response.ok) {
            const message = isObject(value) && typeof value.error === "string"
                ? value.error
                : `Codex login failed with status ${response.status}`
            throw new Error(message)
        }
        if (!isCodexLoginResult(value)) {
            throw new Error("Agent server returned an invalid Codex login response")
        }
        return value
    }

    async createPlan(
        prompt: string,
        snapshot: DawProjectSnapshot,
        onProgress: (progress: AgentProgress) => void = () => {}
    ): Promise<AgentPlan> {
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 210_000)
        const responseResult = await Promises.tryCatch(fetch(this.#url("/v1/plan/stream"), {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({prompt, snapshot}),
            signal: abortController.signal
        }))
        if (responseResult.status === "rejected") {
            clearTimeout(timeout)
            throw new Error(
                `DAWdex Agent server is unavailable: ${String(responseResult.error)}`
            )
        }
        if (!responseResult.value.ok) {
            clearTimeout(timeout)
            const value = await Promises.tryCatch(responseResult.value.json())
            const message = value.status === "resolved"
                && isObject(value.value)
                && typeof value.value.error === "string"
                ? value.value.error
                : `Agent server returned ${responseResult.value.status}`
            throw new Error(message)
        }
        const reader = responseResult.value.body?.getReader()
        if (reader === undefined) {
            clearTimeout(timeout)
            throw new Error("Agent server did not return a planning event stream")
        }
        const decoder = new TextDecoder()
        let buffer = ""
        let finalPlan: AgentPlan | null = null
        try {
            while (true) {
                const {done, value} = await reader.read()
                buffer += decoder.decode(value, {stream: !done})
                const lines = buffer.split("\n")
                buffer = lines.pop() ?? ""
                for (const line of lines) {
                    if (line.trim().length === 0) {continue}
                    const event = JSON.parse(line) as unknown
                    if (!isObject(event) || typeof event.type !== "string") {continue}
                    if (event.type === "progress" && isAgentProgress(event)) {
                        onProgress(event)
                    } else if (event.type === "plan" && isAgentPlan(event.plan)) {
                        finalPlan = event.plan
                    } else if (event.type === "error" && typeof event.error === "string") {
                        throw new Error(event.error)
                    }
                }
                if (done) {break}
            }
        } finally {
            clearTimeout(timeout)
            reader.releaseLock()
        }
        if (finalPlan === null) {
            throw new Error("Agent server completed without a valid music plan")
        }
        return finalPlan
    }

    #url(pathname: string): string {
        return new URL(pathname, this.#endpoint).toString()
    }
}
