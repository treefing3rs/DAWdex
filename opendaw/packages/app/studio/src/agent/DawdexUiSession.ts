import {DefaultObservableValue} from "@opendaw/lib-std"
import type {StudioService} from "@/service/StudioService"
import type {DanmakuAuthor, RoleId, RoleState} from "./ui-contract"
import type {DawdexRoomId} from "./DawdexStageAssets"

export type DawdexViewMode = "product" | "workbench"
export type DawdexPreviewAuthor = DanmakuAuthor | "producer" | RoleId

export const shouldPlayDawdexVideo = (
    surface: DawdexViewMode,
    mode: DawdexViewMode,
    isPlaying: boolean
): boolean => isPlaying && surface === mode

export type DawdexPreviewRole = {
    readonly entered: boolean
    readonly state: RoleState
    readonly audible: boolean
}

export type DawdexStageSnapshot = {
    readonly roomId: DawdexRoomId
    readonly isPlaying: boolean
    readonly bpm: number
    readonly key: string
    readonly barsPerLoop: number
    readonly currentBar: number
    readonly roles: Readonly<Record<RoleId, DawdexPreviewRole>>
    readonly danmaku: null | {
        readonly id: number
        readonly text: string
        readonly author: DawdexPreviewAuthor
    }
    readonly latestEvent: string
}

const initialRole = (): DawdexPreviewRole => ({
    entered: false,
    state: "waiting",
    audible: false
})

const initialRoles = (): Record<RoleId, DawdexPreviewRole> => ({
    drums: initialRole(),
    bass: initialRole(),
    keys: initialRole(),
    lead: initialRole(),
    producer: {entered: true, state: "waiting", audible: false}
})

export class DawdexUiSession {
    readonly viewMode = new DefaultObservableValue<DawdexViewMode>("product")
    readonly stage = new DefaultObservableValue<DawdexStageSnapshot>({
        roomId: "main",
        isPlaying: false,
        bpm: 128,
        key: "A minor",
        barsPerLoop: 4,
        currentBar: 1,
        roles: initialRoles(),
        danmaku: null,
        latestEvent: ""
    })

    #danmakuId = 0

    setViewMode(mode: DawdexViewMode): void {
        this.viewMode.setValue(mode)
    }

    setWorkbench(force?: boolean): void {
        const current = this.viewMode.getValue() === "workbench"
        const workbench = force ?? !current
        this.setViewMode(workbench ? "workbench" : "product")
    }

    setRoom(roomId: DawdexRoomId): void {
        this.#patch({roomId})
    }

    setTransport(value: Pick<DawdexStageSnapshot,
        "isPlaying" | "bpm" | "key" | "barsPerLoop" | "currentBar">): void {
        this.#patch(value)
    }

    setRole(role: RoleId, patch: Partial<DawdexPreviewRole>): void {
        const current = this.stage.getValue()
        this.#patch({
            roles: {
                ...current.roles,
                [role]: {...current.roles[role], ...patch}
            }
        })
    }

    resetRoles(): void {
        this.#patch({roles: initialRoles()})
    }

    pushDanmaku(text: string, author: DawdexPreviewAuthor): void {
        this.#patch({danmaku: {id: ++this.#danmakuId, text, author}})
    }

    setLatestEvent(latestEvent: string): void {
        this.#patch({latestEvent})
    }

    #patch(patch: Partial<DawdexStageSnapshot>): void {
        this.stage.setValue({...this.stage.getValue(), ...patch})
    }
}

// 工程打开事件 → 形态策略：新建/打开任何工程都直落 openDAW 工作台，
// 右下角缩略视窗即刻可见（点缩略窗随时回完整演播厅）。
// 只在「无工程 → 有工程」上升沿动作，不触碰舞台状态，也不干扰用户手动切换；
// suppressSwitch 供舞台内 Agent 自动补建工程使用——不打断正在观看的演出。
export class DawdexProjectModeController {
    readonly #session: DawdexUiSession

    #hadProject = false

    constructor(session: DawdexUiSession) {
        this.#session = session
    }

    update(hasProject: boolean, suppressSwitch: boolean = false): void {
        const opened = hasProject && !this.#hadProject
        this.#hadProject = hasProject
        if (!opened || suppressSwitch) {return}
        this.#session.setViewMode("workbench")
    }
}

const sessions = new WeakMap<StudioService, DawdexUiSession>()

export const getDawdexUiSession = (service: StudioService): DawdexUiSession => {
    const existing = sessions.get(service)
    if (existing !== undefined) {return existing}
    const session = new DawdexUiSession()
    sessions.set(service, session)
    return session
}
