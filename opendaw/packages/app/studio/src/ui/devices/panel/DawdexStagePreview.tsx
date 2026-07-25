import css from "./DawdexStagePreview.sass?inline"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle} from "@opendaw/lib-std"
import {DAWDEX_PRODUCER, DAWDEX_STAGE_ROLES} from "@/agent/DawdexStageAssets"
import {
    getDawdexUiSession,
    type DawdexStageSnapshot,
    type DawdexViewMode
} from "@/agent/DawdexUiSession"
import type {RoleId} from "@/agent/ui-contract"
import {StudioService} from "@/service/StudioService"
import {
    createDawdexStagePreviewModel,
    isDawdexStagePreviewActivationKey
} from "./DawdexStagePreviewModel"

const className = Html.adoptStyleSheet(css, "DawdexStagePreview")

type Construct = {
    readonly lifecycle: Lifecycle
    readonly service: StudioService
}

export const DawdexStagePreview = ({lifecycle, service}: Construct) => {
    const session = getDawdexUiSession(service)
    const roomImage: HTMLImageElement = (<img className="room-bg" alt="" draggable={false}/>)
    const roomVideo: HTMLVideoElement = (
        <video className="room-video" muted loop playsInline preload="metadata"/>)
    const rec: HTMLElement = (<span className="rec"/>)
    const roomLabel: HTMLElement = (<span className="room-label"/>)
    const transport: HTMLElement = (<span className="transport"/>)
    const danmaku: HTMLElement = (<span className="preview-danmaku"/>)
    const roleEls = new Map<RoleId, HTMLElement>()
    const performers = [...DAWDEX_STAGE_ROLES, DAWDEX_PRODUCER].map(role => {
        const element: HTMLElement = (
            <span className="performer" data-role={role.id}>
                <img src={role.img} alt="" draggable={false}/>
            </span>)
        roleEls.set(role.id, element)
        return element
    })
    let mode: DawdexViewMode = session.viewMode.getValue()
    let snapshot: DawdexStageSnapshot = session.stage.getValue()
    let lastDanmakuId = 0

    const root: HTMLButtonElement = (
        <button type="button" className={className} aria-label="打开 DAWdex 演播厅">
            {roomImage}
            {roomVideo}
            <span className="preview-shade"/>
            <span className="performers">{performers}</span>
            {danmaku}
            <span className="hud">
                {rec}
                {roomLabel}
                {transport}
            </span>
            <span className="enter-hint">打开演播厅 ↗</span>
        </button>)

    const render = () => {
        const model = createDawdexStagePreviewModel(snapshot, mode)
        root.dataset.room = snapshot.roomId
        root.dataset.playing = String(snapshot.isPlaying)
        root.classList.toggle("workbench-active", mode === "workbench")
        roomImage.src = model.room.bg
        if (!roomVideo.src.endsWith(model.room.video)) {roomVideo.src = model.room.video}
        rec.textContent = model.recLabel
        roomLabel.textContent = model.roomLabel
        transport.textContent = model.transportLabel
        Object.entries(snapshot.roles).forEach(([role, state]) => {
            const element = roleEls.get(role as RoleId)
            if (element === undefined) {return}
            element.dataset.state = state.state
            element.dataset.entered = String(state.entered)
            element.dataset.audible = String(state.audible)
        })
        if (snapshot.danmaku !== null && snapshot.danmaku.id !== lastDanmakuId) {
            lastDanmakuId = snapshot.danmaku.id
            danmaku.textContent = snapshot.danmaku.text
            danmaku.dataset.author = snapshot.danmaku.author
            danmaku.classList.remove("show")
            requestAnimationFrame(() => danmaku.classList.add("show"))
        }
        if (model.playVideo) {
            roomVideo.play().catch(() => {})
        } else {
            roomVideo.pause()
            if (roomVideo.readyState > 0) {roomVideo.currentTime = 0}
        }
    }

    lifecycle.ownAll(
        session.stage.catchupAndSubscribe(owner => {
            snapshot = owner.getValue()
            render()
        }),
        session.viewMode.catchupAndSubscribe(owner => {
            mode = owner.getValue()
            render()
        }),
        Events.subscribe(root, "keydown", (event: KeyboardEvent) => {
            if (!isDawdexStagePreviewActivationKey(event.key)) {return}
            event.preventDefault()
            event.stopPropagation()
            session.setViewMode("product")
        }),
        Events.subscribe(root, "click", () => session.setViewMode("product"))
    )
    return root
}
