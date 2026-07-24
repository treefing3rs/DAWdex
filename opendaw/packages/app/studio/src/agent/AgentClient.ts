import {isAbsent} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {AgentPlan, CreateInstrumentAction, DawAction, DawProjectSnapshot, SetTempoAction} from "./AgentProtocol"
import {LocalMusicPlanner} from "./LocalMusicPlanner"

type UnknownSetTempoAction = {[Key in keyof SetTempoAction]?: unknown}
type UnknownCreateInstrumentAction = {[Key in keyof CreateInstrumentAction]?: unknown}
type UnknownAgentPlan = {[Key in keyof AgentPlan]?: unknown}

const isSetTempoAction = (value: unknown): value is SetTempoAction => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const action = value as UnknownSetTempoAction
    return action.type === "set-tempo" && typeof action.bpm === "number"
}

const isCreateInstrumentAction = (value: unknown): value is CreateInstrumentAction => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const action = value as UnknownCreateInstrumentAction
    return action.type === "create-instrument"
        && typeof action.name === "string"
        && ["bass", "chords", "pulse", "lead"].includes(String(action.pattern))
        && typeof action.startBar === "number"
        && typeof action.bars === "number"
        && typeof action.rootMidi === "number"
        && typeof action.velocity === "number"
        && typeof action.density === "number"
}

const isDawAction = (value: unknown): value is DawAction =>
    isSetTempoAction(value) || isCreateInstrumentAction(value)

const isAgentPlan = (value: unknown): value is AgentPlan => {
    if (isAbsent(value) || typeof value !== "object") {return false}
    const plan = value as UnknownAgentPlan
    return typeof plan.id === "string"
        && typeof plan.prompt === "string"
        && typeof plan.title === "string"
        && typeof plan.summary === "string"
        && Array.isArray(plan.rationale)
        && plan.rationale.every(entry => typeof entry === "string")
        && Array.isArray(plan.actions)
        && plan.actions.every(isDawAction)
        && (plan.source === "model" || plan.source === "local")
}

export class AgentClient {
    readonly #endpoint: string

    constructor(endpoint: string = import.meta.env.VITE_DAWDEX_AGENT_URL ?? "http://localhost:8787/v1/plan") {
        this.#endpoint = endpoint
    }

    async createPlan(prompt: string, snapshot: DawProjectSnapshot): Promise<AgentPlan> {
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 12_000)
        const responseResult = await Promises.tryCatch(fetch(this.#endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({prompt, snapshot}),
            signal: abortController.signal
        }))
        clearTimeout(timeout)
        if (responseResult.status === "rejected" || !responseResult.value.ok) {
            return LocalMusicPlanner.create(prompt, snapshot)
        }
        const jsonResult = await Promises.tryCatch(responseResult.value.json())
        if (jsonResult.status === "rejected" || !isAgentPlan(jsonResult.value)) {
            return LocalMusicPlanner.create(prompt, snapshot)
        }
        return jsonResult.value
    }
}
