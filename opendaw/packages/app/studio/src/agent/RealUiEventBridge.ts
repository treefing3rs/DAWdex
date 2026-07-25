import {PPQN} from "@opendaw/lib-dsp"
import type {
    AgentPlan,
    DawProjectSnapshot,
    MusicRole,
    ProjectTrackSnapshot
} from "./AgentProtocol"
import type {ApplyResult} from "./DawProjectAdapter"
import type {OperationResult, RoleId, UiEvent} from "./ui-contract"

type UiEventPayload = UiEvent extends infer Event
    ? Event extends UiEvent
        ? Omit<Event, "seq" | "at">
        : never
    : never

const STAGE_ROLES: ReadonlyArray<MusicRole> = ["drums", "bass", "keys"]

const isAudibleAt = (
    track: ProjectTrackSnapshot | undefined,
    playing: boolean,
    position: number,
    anotherTrackIsSolo: boolean
): boolean =>
    playing
    && track !== undefined
    && track.sound.instrumentKind !== "none"
    && !track.sound.mixer.mute
    && (!anotherTrackIsSolo || track.sound.mixer.solo)
    && track.regions.some(region =>
        region.mute !== true
        && region.noteCount > 0
        && position >= region.position
        && position < region.position + region.duration)

export class RealUiEventBridge {
    readonly #emit: (event: UiEvent) => void
    readonly #now: () => number
    readonly #startedAt: number
    readonly #audible = new Map<RoleId, boolean>()
    #seq = 0
    #enabled = true
    #key = "Unknown key"
    #lastTransportSignature = ""

    constructor(emit: (event: UiEvent) => void, now: () => number = () => performance.now()) {
        this.#emit = emit
        this.#now = now
        this.#startedAt = now()
    }

    setEnabled(enabled: boolean): void {
        if (this.#enabled === enabled) {return}
        this.#enabled = enabled
        if (enabled) {
            this.#lastTransportSignature = ""
            this.#audible.clear()
        }
    }

    receiveDanmaku(text: string): string {
        const danmakuId = `d-user-${this.#seq + 1}`
        this.#dispatch({type: "DanmakuReceived", danmakuId, text, author: "user"})
        return danmakuId
    }

    acceptPlan(plan: AgentPlan, danmakuId: string | undefined, snapshot: DawProjectSnapshot): void {
        if (danmakuId === undefined) {return}
        const preserve = plan.brief.preserveTrackIds
            .flatMap(trackId => {
                const role = snapshot.tracks.find(track => track.id === trackId)?.role
                return role === null || role === undefined ? [] : [role]
            })
        this.#dispatch({
            type: "ProducerSelected",
            danmakuId,
            adopted: true,
            reason: plan.brief.decisionSummary,
            confidence: 1,
            brief: {
                bpm: plan.brief.bpm,
                key: plan.brief.key,
                bars: plan.brief.bars,
                preserve
            },
            echo: `制作人：${plan.brief.decisionSummary}`
        })
    }

    beginPlan(plan: AgentPlan): void {
        plan.actions.forEach((action, index) => {
            if (action.type !== "upsert-role-track") {return}
            const operationRef = `${plan.id}/op-${index + 1}`
            this.#dispatch({
                type: "RoleTaskAssigned",
                role: action.role,
                summary: `${action.mode === "replace" ? "替换" : "创建"} ${action.style} ${action.role}`,
                audibleResult: `使用 ${action.midiAssetPath.split("/").at(-1) ?? action.midiAssetId}`,
                operationRef
            })
        })
    }

    prepareRole(role: MusicRole, assetPath: string): void {
        this.#dispatch({
            type: "RoleStateChanged",
            role,
            state: "preparing",
            reason: `正在解析 ${assetPath.split(/[\\/]/).at(-1) ?? assetPath}`
        })
    }

    queueRole(role: MusicRole): void {
        this.#audible.delete(role)
        this.#dispatch({
            type: "RoleStateChanged",
            role,
            state: "queued",
            reason: "写入已经验证，等待 openDAW 走带发声"
        })
    }

    finishPlan(
        plan: AgentPlan,
        kind: OperationResult["kind"],
        result: ApplyResult
    ): void {
        const roles = plan.actions.flatMap(action =>
            action.type === "upsert-role-track" ? [action.role] : [])
        if (result.success) {
            this.#key = plan.brief.key
        } else {
            roles.forEach(role => this.#dispatch({
                type: "RoleStateChanged",
                role,
                state: "failed",
                reason: result.message
            }))
        }
        this.#dispatch({
            type: "OperationResult",
            operationRef: plan.id,
            kind,
            ok: result.success,
            fallbackUsed: false,
            message: result.message
        })
    }

    finishUndo(result: ApplyResult): void {
        if (result.success) {
            this.#lastTransportSignature = ""
            this.#audible.clear()
        }
        this.#dispatch({
            type: "OperationResult",
            operationRef: "undo",
            kind: "undo",
            ok: result.success,
            fallbackUsed: false,
            message: result.message
        })
    }

    sync(snapshot: DawProjectSnapshot): void {
        if (!this.#enabled) {return}
        const transport = snapshot.transport ?? {
            playing: false,
            position: 0,
            loopEnabled: false,
            loopFrom: 0,
            loopTo: 4 * PPQN.Bar
        }
        const loopFrom = transport.loopEnabled ? transport.loopFrom : 0
        const loopLength = transport.loopEnabled
            ? Math.max(PPQN.Bar, transport.loopTo - transport.loopFrom)
            : Math.max(
                PPQN.Bar,
                ...snapshot.tracks.flatMap(track =>
                    track.regions.map(region => region.position + region.duration)))
        const barsPerLoop = Math.max(1, Math.round(loopLength / PPQN.Bar))
        const positionInLoop = Math.max(0, transport.position - loopFrom)
        const currentBar = Math.floor(positionInLoop / PPQN.Bar) % barsPerLoop + 1
        const transportSignature = [
            Math.round(snapshot.bpm * 100) / 100,
            this.#key,
            barsPerLoop,
            currentBar,
            transport.playing
        ].join("|")
        if (transportSignature !== this.#lastTransportSignature) {
            this.#lastTransportSignature = transportSignature
            this.#dispatch({
                type: "TransportChanged",
                bpm: snapshot.bpm,
                key: this.#key,
                barsPerLoop,
                currentBar,
                isPlaying: transport.playing
            })
        }

        const anyTrackSolo = snapshot.tracks.some(track => track.sound.mixer.solo)
        STAGE_ROLES.forEach(role => {
            const track = snapshot.tracks.find(candidate =>
                candidate.generated && candidate.role === role)
            const audible = isAudibleAt(track, transport.playing, transport.position, anyTrackSolo)
            const previous = this.#audible.get(role)
            this.#audible.set(role, audible)
            if (previous === undefined && !audible) {return}
            if (previous === audible) {return}
            if (audible && track !== undefined) {
                this.#dispatch({
                    type: "RoleStateChanged",
                    role,
                    state: "performing",
                    trackRef: track.id,
                    reason: "openDAW 走带位置已进入该轨的有效 MIDI Region"
                })
            }
            this.#dispatch({
                type: "TrackAudibleChanged",
                role,
                audible,
                ...(audible ? {enteredAtBar: currentBar} : {})
            })
        })
    }

    #dispatch(payload: UiEventPayload): void {
        if (!this.#enabled) {return}
        this.#emit({
            ...payload,
            seq: ++this.#seq,
            at: Math.max(0, Math.round(this.#now() - this.#startedAt))
        } as UiEvent)
    }
}
