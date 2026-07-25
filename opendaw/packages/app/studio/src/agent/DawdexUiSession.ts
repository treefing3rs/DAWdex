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

const sessions = new WeakMap<StudioService, DawdexUiSession>()

export const getDawdexUiSession = (service: StudioService): DawdexUiSession => {
    const existing = sessions.get(service)
    if (existing !== undefined) {return existing}
    const session = new DawdexUiSession()
    sessions.set(service, session)
    return session
}
