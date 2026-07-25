import css from "./AgentOverlay.sass?inline"
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Option, Terminable} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {AgentClient} from "./AgentClient"
import {AgentPlan, AgentProviderStatus, DAWDEX_VERSION, DawAction} from "./AgentProtocol"
import {DawProjectAdapter} from "./DawProjectAdapter"
import {RealUiEventBridge} from "./RealUiEventBridge"
import type {
    DanmakuAuthor, InterventionKind, RoleId, RoleState, UiEvent
} from "./ui-contract"
import {playMockTimeline} from "./mock-timeline"

const className = Html.adoptStyleSheet(css, "AgentOverlay")

type Construct = {
    readonly lifecycle: Lifecycle
    readonly service: StudioService
}

/** MVP 启用的舞台角色（契约保留 lead/producer 扩展位） */
const STAGE_ROLES: ReadonlyArray<{id: RoleId, label: string, img: string}> = [
    {id: "drums", label: "鼓手", img: "/dawdex/drummer_v2.png"},
    {id: "bass", label: "贝斯手", img: "/dawdex/bassist_v2.png"},
    {id: "keys", label: "键盘手", img: "/dawdex/keyboardist_v2.png"}
]

const INTERVENTIONS: ReadonlyArray<{kind: InterventionKind, label: string}> = [
    {kind: "keep", label: "保留"},
    {kind: "stronger", label: "更有力量"},
    {kind: "lighter", label: "更轻松"},
    {kind: "swap-instrument", label: "换乐器"},
    {kind: "regenerate", label: "重新生成"},
    {kind: "undo", label: "↩ 撤销"}
]

const AUTHOR_BADGE: Record<DanmakuAuthor, string> = {user: "", "ai-fan": "AI 乐迷", system: ""}

// ── 巡棚房间注册表（§11.1：房间即工程；未绑定事件的物件保持纯装饰） ─────────
type RoomId = "main" | "drums" | "strings" | "keys" | "control" | "lounge"
const ROOMS: ReadonlyArray<{id: RoomId, label: string, bg: string}> = [
    // 演播大厅 = 物件分层底图（吊灯/监视器/吉他已抠出为独立 sprite，§9 Diegetic UI）
    {id: "main", label: "演播大厅", bg: "/dawdex/studio_base.jpg"},
    {id: "drums", label: "鼓棚", bg: "/dawdex/room_drums.jpg"},
    {id: "strings", label: "吉他贝斯棚", bg: "/dawdex/room_guitar_bass.jpg"},
    {id: "keys", label: "键盘阁楼", bg: "/dawdex/room_keyboards.jpg"},
    {id: "control", label: "控制室", bg: "/dawdex/control_room_night.jpg"},
    {id: "lounge", label: "休息室", bg: "/dawdex/room_lounge.jpg"}
]

export const AgentOverlay = ({lifecycle, service}: Construct) => {
    const client = new AgentClient()
    const daw = new DawProjectAdapter(service)
    const demoMode = new URLSearchParams(window.location.search).has("mock")

    // ── DOM 骨架 ────────────────────────────────────────────────────────────
    const danmakuLayer: HTMLElement = (<div className="danmaku-layer"/>)
    const marquee: HTMLElement = (<div className="marquee hidden"><span className="marquee-text"/></div>)
    const noise: HTMLElement = (<div className="noise hidden"/>)
    const transportReadout: HTMLElement = (<span className="readout">-- · -- BPM · --</span>)
    const transportBar: HTMLElement = (<div className="loop-bar-fill"/>)
    const receiptList: HTMLElement = (<div className="receipt-list"/>)
    const activity: HTMLElement = (<div className="activity"/>)
    const providerSlot: HTMLElement = (<div className="provider-slot"/>)
    const planSlot: HTMLElement = (<div className="plan-slot"/>)
    const input: HTMLInputElement = (
        <input type="text" maxLength={120} placeholder="说点什么，指挥乐队… 例如：再炸一点，像最终 Boss 出场"/>)
    const sendButton: HTMLButtonElement = (<button type="button" className="send">发送 ↗</button>)
    const replayButton: HTMLButtonElement = (<button type="button" className="replay" title="重播 90 秒演示">↻</button>)
    // 壳上硬件（§12.3）：ON AIR 灯 + 投屏演示开关 + Provider 状态点
    const onAirLamp: HTMLElement = (<span className="on-air"><i/>ON AIR</span>)
    const statusDot: HTMLElement = (<span className="status-dot checking" title="创作模型状态"/>)
    const presentButton: HTMLButtonElement = (
        <button type="button" className="present-toggle" title="投屏演示模式：隐藏抽屉、放大舞台">⛶ 投屏</button>)
    // 掀开舞台地板：收起外壳露出底下的真实 openDAW（Esc 或 ?workbench=1 深链）
    const collapseButton: HTMLButtonElement = (
        <button type="button" className="collapse-toggle" title="收起演播厅，打开 openDAW 工作台（Esc 往返）">⌄ 工作台</button>)
    // 收起态窄条上的最近事件（收起来也有生命体征）
    const lastEvent: HTMLElement = (<span className="last-event"/>)
    // 屏幕内 REC 灯牌（权威播放指示，与 ON AIR 同源）
    const recBadge: HTMLElement = (<div className="rec-badge standby">STANDBY</div>)
    // 巡棚：全部房间均为静态底图（切台硬切，TV 气质）
    const stageImg: HTMLImageElement = (
        <img className="stage-bg-img" alt="" draggable={false}/>)
    stageImg.src = ROOMS[0].bg
    // 演出态皮肤：走带播放时整棚苏醒（烟雾/时间码/机架灯）；
    // 帧 0 = 静态底图来源，与 sprite 淡出淡入无缝切换，暂停即回到静帧
    const stageVideo: HTMLVideoElement = (
        <video className="stage-bg-video" loop playsInline preload="auto" muted draggable={false}/>)
    stageVideo.src = "/dawdex/studio_night_loop.mp4"
    const channelName: HTMLElement = (<span className="ch-name">{ROOMS[0].label}</span>)
    const chPrev: HTMLButtonElement = (<button type="button" title="上一个房间">‹</button>)
    const chNext: HTMLButtonElement = (<button type="button" title="下一个房间">›</button>)

    // ── 角色舞台 ────────────────────────────────────────────────────────────
    const performerEls = new Map<RoleId, HTMLElement>()
    const performers = STAGE_ROLES.map(({id, label, img}) => {
        const lamp: HTMLElement = (<span className="lamp"/>)
        const el: HTMLElement = (
            <div className="performer" data-state="waiting" data-role={id}>
                <img src={img} alt={label} draggable={false}/>
                {lamp}
                <label>{label}</label>
            </div>)
        performerEls.set(id, el)
        return el
    })
    // 制作人：控制室常驻（非轨道角色，不参与五态机与入场系统）
    const producerEl: HTMLElement = (
        <div className="performer entered" data-state="waiting" data-role="producer">
            <img src="/dawdex/producer_v2.png" alt="制作人" draggable={false}/>
            <span className="lamp"/>
            <label>制作人</label>
        </div>)
    // ── 演播大厅物件分层（§9 Diegetic UI：sprite 视觉层 + clip-path 轮廓命中层） ──
    // 坐标按 1920×1080 帧标定 → cover 换算（舞台 16:9.5）：stage_x% = fx*105.56 - 2.78
    const lampSprite: HTMLImageElement = (
        <img className="obj obj-lamp" src="/dawdex/obj_lamp.png" alt="" draggable={false}/>)
    const monitorSprite: HTMLImageElement = (
        <img className="obj obj-monitor" src="/dawdex/obj_monitor.png" alt="" draggable={false}/>)
    const guitarSprite: HTMLImageElement = (
        <img className="obj obj-guitar" src="/dawdex/obj_guitar.png" alt="" draggable={false}/>)
    // 原位替身 sprite（从底图同像素裁出，叠回原位平时不可见；hover 时物件自身像素变亮 = 无遮罩高亮）
    const artSprite: HTMLImageElement = (
        <img className="obj obj-copy obj-art" src="/dawdex/obj_art.png" alt="" draggable={false}/>)
    const shelfSprite: HTMLImageElement = (
        <img className="obj obj-copy obj-shelf" src="/dawdex/obj_shelf.png" alt="" draggable={false}/>)
    const clockSprite: HTMLImageElement = (
        <img className="obj obj-copy obj-clock" src="/dawdex/obj_clock.png" alt="" draggable={false}/>)
    // 轮廓命中层：clip-path 沿物件真实轮廓；hover 出物件名小标签（data-label）
    const lampHit: HTMLElement = (<div className="obj-hit hit-lamp" data-label="吊灯 · 能量" title="吊灯 · 能量"/>)
    const monitorHit: HTMLElement = (<div className="obj-hit hit-monitor" data-label="REC 监视器 · 走带" title="REC 监视器 · 走带"/>)
    const guitarHit: HTMLElement = (<div className="obj-hit hit-guitar" data-label="沙发旁的吉他 · 换乐器" title="沙发旁的吉他 · 换乐器"/>)
    // 调音台热点（无 sprite：hover 时通道灯增亮 + 轮廓高光）
    const deskHotspot: HTMLElement = (<div className="obj-hit hit-desk" data-label="调音台 · 轨道" title="调音台 · 轨道"/>)
    // 纯命中层物件（无 sprite，hover 只出标签）：挂画 = 工程概览；书架 = 素材架；挂钟 = 循环
    const artHit: HTMLElement = (<div className="obj-hit hit-art" data-label="声波挂画 · 工程概览" title="声波挂画 · 工程概览"/>)
    const shelfHit: HTMLElement = (<div className="obj-hit hit-shelf" data-label="书架 · 素材架" title="书架 · 素材架"/>)
    const clockHit: HTMLElement = (<div className="obj-hit hit-clock" data-label="挂钟 · 循环" title="挂钟 · 循环"/>)
    // 可交互引导：8-bit 闪光点，周期性眨一下提示「这里能点」；hover 过一次即永久熄灭
    const makeGlint = (name: string, hit: HTMLElement): HTMLElement => {
        const glint: HTMLElement = (<span className={`hint-glint glint-${name}`}/>)
        lifecycle.own(Events.subscribe(hit, "mouseenter", () => glint.classList.add("seen")))
        return glint
    }
    const glints = [
        makeGlint("lamp", lampHit), makeGlint("monitor", monitorHit),
        makeGlint("guitar", guitarHit), makeGlint("desk", deskHotspot),
        makeGlint("art", artHit), makeGlint("shelf", shelfHit), makeGlint("clock", clockHit)
    ]
    const ledDrums: HTMLElement = (<span className="rack-led" data-role="drums" title="鼓轨道 · 发声确认灯"/>)
    const ledBass: HTMLElement = (<span className="rack-led" data-role="bass" title="贝斯轨道 · 发声确认灯"/>)
    const ledKeys: HTMLElement = (<span className="rack-led" data-role="keys" title="键盘轨道 · 发声确认灯"/>)
    const lampGlow: HTMLElement = (<div className="lamp-glow"/>)
    const clockHand: HTMLElement = (<div className="clock-hand"/>)
    const rackLeds = new Map<RoleId, HTMLElement>([
        ["drums", ledDrums], ["bass", ledBass], ["keys", ledKeys]])
    // 物件功能面板（落在下方键盘屏上：点击物件 → 屏幕亮起显示内容）
    const panelEl: HTMLElement = (<div className="object-panel"/>)
    const panelReadout: HTMLElement = (<span className="panel-readout"/>)
    const deckReadout: HTMLElement = (<span className="deck-readout"/>)
    // 舞台容器（巡棚切换作用于此）
    const stageEl: HTMLElement = (
        <div className="stage" data-room="main">
            {stageImg}
            {stageVideo}
            {marquee}
            <div className="performers">{performers}{producerEl}</div>
            {noise}
            {danmakuLayer}
            <div className="hotspots">
                {lampGlow}
                {lampSprite}{monitorSprite}{guitarSprite}
                {artSprite}{shelfSprite}{clockSprite}
                {lampHit}{monitorHit}{guitarHit}{deskHotspot}
                {artHit}{shelfHit}{clockHit}
                {glints}
                {ledDrums}{ledBass}{ledKeys}
                {clockHand}
            </div>
            {recBadge}
            <div className="transport">
                {transportReadout}
                <div className="loop-bar">{transportBar}</div>
            </div>
        </div>)
    // 巡棚切台
    let roomIndex = 0
    // ── 演出态皮肤：仅演播大厅；播放时视频淡入整棚苏醒，暂停回到静帧 ──
    const setVideoLive = (live: boolean) => {
        const on = live && ROOMS[roomIndex].id === "main"
        stageEl.classList.toggle("video-live", on)
        if (on) {
            stageVideo.play().catch(() => {})
        } else {
            stageVideo.pause()
            stageVideo.currentTime = 0
        }
    }
    const setRoom = (index: number) => {
        roomIndex = ((index % ROOMS.length) + ROOMS.length) % ROOMS.length
        const room = ROOMS[roomIndex]
        channelName.textContent = room.label
        stageEl.dataset.room = room.id
        stageImg.src = room.bg
        setVideoLive(isPlaying)
    }
    const roleStates = new Map<RoleId, RoleState>()
    const audibleRoles = new Set<RoleId>()
    const pendingPerforming = new Map<RoleId, string | undefined>()
    const setRoleState = (role: RoleId, state: RoleState, reason?: string) => {
        const el = performerEls.get(role)
        if (el === undefined) {return}
        roleStates.set(role, state)
        el.dataset.state = state
        el.title = reason ?? state
        if (state === "failed") {flashNoise()}
    }

    // ── 入场系统：角色首次收到事件时从右侧门口步进式走入（游戏感系统 ①） ────
    const enteredRoles = new Set<RoleId>()
    const enterRole = (role: RoleId) => {
        if (enteredRoles.has(role)) {return}
        enteredRoles.add(role)
        performerEls.get(role)?.classList.add("entered")
    }

    // ── 播放状态（TransportChanged.isPlaying → ON AIR 灯 + REC 灯牌） ────────
    const setPlaying = (playing: boolean) => {
        onAirLamp.classList.toggle("lit", playing)
        recBadge.classList.toggle("standby", !playing)
        recBadge.textContent = playing ? "● REC" : "STANDBY"
        // 吊灯 = 能量指示灯：播放时亮起（Diegetic 绑定）
        lampGlow.classList.toggle("lit", playing)
        // 演出态皮肤：播放 = 整棚苏醒（视频淡入），暂停 = 回到静帧
        setVideoLive(playing)
        // 走带暂停 = 角色动画冻结（诚实状态：没有声音就没有演奏）
        root.classList.toggle("transport-paused", !playing)
        // 角色演奏动画的一拍时长由权威 BPM 驱动，不写死
        root.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`)
    }

    // ── 弹幕层 ──────────────────────────────────────────────────────────────
    let danmakuLane = 0
    const launchDanmaku = (text: string, author: DanmakuAuthor | "producer" | RoleId = "user") => {
        const badge = AUTHOR_BADGE[author as DanmakuAuthor]
        const item: HTMLElement = badge !== undefined && badge.length > 0
            ? (<div className={`danmaku ${author}`}><em>{badge}</em>{text}</div>)
            : (<div className={`danmaku ${author}`}>{text}</div>)
        if (author === "system") {
            item.classList.add("system-stay")
            danmakuLayer.appendChild(item)
            setTimeout(() => item.remove(), 4200)
            return
        }
        item.style.top = `${6 + danmakuLane * 13}%`
        danmakuLane = (danmakuLane + 1) % 6
        danmakuLayer.appendChild(item)
        item.addEventListener("animationend", () => item.remove(), {once: true})
    }
    const flashNoise = () => {
        noise.classList.remove("hidden")
        setTimeout(() => noise.classList.add("hidden"), 480)
    }

    // ── AI 乐迷附和（氛围弹幕层，与真实反馈分层） ─────────────────────────
    // 乐迷弹幕 = 模板池 + 揉入用户关键词，纯本地、零延迟、可调侃；
    // 制作人/角色回复仍严格从真实事件派生（echo 字段），不伪造反馈。
    const FAN_TEMPLATES: ReadonlyArray<string> = [
        "前排围观",
        "炸起来炸起来",
        "这 loop 有点上头",
        "制作人搞快点",
        "蹲一个 drop",
        "贝斯进来我就起飞",
        "已截图，等一个神级现场",
        "{text} +1",
        "复议：{text}",
        "{text} 说得好",
        "为「{text}」打 call",
        "{text}，双手赞成"
    ]
    const fanTimers: Array<number> = []
    lifecycle.own(Terminable.create(() => fanTimers.forEach(t => window.clearTimeout(t))))
    const spawnFanReactions = (userText: string) => {
        const keyword = userText.trim().slice(0, 10)
        const pool = keyword.length > 0
            ? FAN_TEMPLATES
            : FAN_TEMPLATES.filter(t => t.indexOf("{text}") < 0)
        const count = 2 + Math.floor(Math.random() * 3) // 每次 2-4 条附和
        for (let i = 0; i < count; i++) {
            const timer = window.setTimeout(() => {
                const tpl = pool[Math.floor(Math.random() * pool.length)]
                launchDanmaku(tpl.replace(/\{text\}/g, keyword), "ai-fan")
            }, 700 + Math.random() * 2600) // 0.7-3.3s 内陆续飘过
            fanTimers.push(timer)
        }
    }

    // ── 权威时钟 + 循环进度（以最近一次 TransportChanged 校准，暂停时冻结） ──
    let bpm = 128, barsPerLoop = 4, keySig = "A minor", currentBar = 1
    let isPlaying = false, transportSynced = false
    let clockStopped = false
    lifecycle.own({terminate: () => {clockStopped = true}})
    const loopSeconds = () => barsPerLoop * 4 * 60 / bpm
    let syncedAt = performance.now()
    let syncedLoopPos = 0
    const resyncClock = () => {
        syncedAt = performance.now()
        syncedLoopPos = ((currentBar - 1) % barsPerLoop) / barsPerLoop
    }
    const tick = () => {
        if (clockStopped) {return}
        const loopPos = isPlaying
            ? (syncedLoopPos + (performance.now() - syncedAt) / 1000 / loopSeconds()) % 1
            : syncedLoopPos
        const bar = Math.floor(loopPos * barsPerLoop) + 1
        transportReadout.textContent = !transportSynced
            ? "STANDBY · 等待走带同步"
            : isPlaying
                ? `BAR ${bar}/${barsPerLoop} · ${Math.round(bpm)} BPM · ${keySig}`
                : `⏸ 已暂停 · BAR ${bar}/${barsPerLoop} · ${Math.round(bpm)} BPM · ${keySig}`
        transportBar.style.width = `${(loopPos * 100).toFixed(1)}%`
        // 墙上时钟 = 循环进度（指针随 loopPos 旋转，暂停即冻结）
        clockHand.style.transform = `rotate(${(loopPos * 360).toFixed(1)}deg)`
        // 监视器面板的走带读数与壳内读数同源
        panelReadout.textContent = transportReadout.textContent
        deckReadout.textContent = transportReadout.textContent
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // ── 证据抽屉（回执 / 计划审批 / 活动日志） ───────────────────────────────
    const appendEvent = (message: string, style: "normal" | "working" | "success" = "normal") => {
        activity.prepend(<div className={`event ${style}`}><span className="event-dot"/><span>{message}</span></div>)
        while (activity.childElementCount > 8) {activity.lastElementChild?.remove()}
        lastEvent.textContent = message
    }
    const appendReceipt = (role: RoleId, summary: string, audible: string, ref: string) => {
        const label = STAGE_ROLES.find(r => r.id === role)?.label ?? role
        receiptList.prepend(
            <div className={`receipt role-${role}`}>
                <strong>{label} · 工作回执</strong>
                <span>将做什么：{summary}</span>
                <span>听起来：{audible}</span>
                <code>{ref}</code>
            </div>)
        while (receiptList.childElementCount > 6) {receiptList.lastElementChild?.remove()}
    }

    // ── Mock 事件引擎（与真实接口同一签名，联调时直接替换来源） ─────────────
    const danmakuText = new Map<string, string>()
    let lastEventSeq = -1
    const emit = (event: UiEvent) => {
        if (event.seq <= lastEventSeq) {return}
        lastEventSeq = event.seq
        switch (event.type) {
            case "DanmakuReceived":
                danmakuText.set(event.danmakuId, event.text)
                launchDanmaku(event.text, event.author)
                break
            case "ProducerSelected": {
                if (event.echo !== undefined) {launchDanmaku(event.echo, "producer")}
                const original = danmakuText.get(event.danmakuId)
                if (event.adopted && original !== undefined) {showMarquee(original)}
                appendEvent(`制作人${event.adopted ? "采纳" : "拒绝"}：${event.reason}`,
                    event.adopted ? "success" : "normal")
                break
            }
            case "RoleTaskAssigned":
                enterRole(event.role)
                if (event.echo !== undefined) {launchDanmaku(event.echo, event.role)}
                appendReceipt(event.role, event.summary, event.audibleResult, event.operationRef)
                break
            case "RoleStateChanged":
                enterRole(event.role)
                if (event.state === "performing" && !audibleRoles.has(event.role)) {
                    // 契约铁律：performing 以 openDAW 真实发声为唯一依据（TrackAudibleChanged 闸门）
                    pendingPerforming.set(event.role, event.reason)
                    setRoleState(event.role, "queued", "已就绪，等待轨道发声确认")
                } else {
                    if (event.state !== "performing") {pendingPerforming.delete(event.role)}
                    setRoleState(event.role, event.state, event.reason)
                }
                break
            case "TransportChanged":
                bpm = event.bpm; barsPerLoop = event.barsPerLoop; keySig = event.key
                currentBar = event.currentBar
                isPlaying = event.isPlaying
                transportSynced = true
                resyncClock()
                setPlaying(event.isPlaying)
                break
            case "TrackAudibleChanged":
                enterRole(event.role)
                // 调音台角色色通道灯 = 轨道发声确认（Diegetic 绑定）
                rackLeds.get(event.role)?.classList.toggle("on", event.audible)
                if (event.audible) {
                    audibleRoles.add(event.role)
                    const pendingReason = pendingPerforming.get(event.role)
                    if (pendingPerforming.delete(event.role)) {
                        setRoleState(event.role, "performing", pendingReason)
                    }
                } else {
                    audibleRoles.delete(event.role)
                    pendingPerforming.delete(event.role)
                    if (roleStates.get(event.role) === "performing") {
                        setRoleState(event.role, "waiting", "轨道已静音")
                    }
                }
                appendEvent(event.audible ? `${event.role} 轨道确认发声（BAR ${event.enteredAtBar ?? "?"}）` : `${event.role} 静音`,
                    event.audible ? "success" : "normal")
                break
            case "OperationResult":
                appendEvent(`${event.kind} ${event.ok ? "成功" : "失败"}${event.fallbackUsed ? "（本地回退）" : ""}`,
                    event.ok ? "success" : "normal")
                if (event.fallbackUsed) {
                    flashNoise()
                    launchDanmaku("模型暂不可用，已切换本地安全方案", "system")
                }
                break
        }
    }
    const realBridge = new RealUiEventBridge(emit)
    const showMarquee = (text: string) => {
        const span = marquee.querySelector(".marquee-text")
        if (span !== null) {span.textContent = `★ 已采纳：${text} ★`}
        marquee.classList.remove("hidden")
        setTimeout(() => marquee.classList.add("hidden"), 11000)
    }
    // Mock 只在显式演示模式（?mock=1）或手动点 ↻ 时播放——绝不默认启动，避免与真实 Agent 并行
    let cancelMock: (() => void) | null = null
    const stopMock = () => {
        cancelMock?.()
        cancelMock = null
        lastEventSeq = -1
        realBridge.setEnabled(true)
        realBridge.sync(daw.snapshot())
    }
    const startMock = () => {
        cancelMock?.()
        realBridge.setEnabled(false)
        lastEventSeq = -1
        danmakuText.clear()
        Html.empty(receiptList)
        audibleRoles.clear()
        rackLeds.forEach(led => led.classList.remove("on"))
        pendingPerforming.clear()
        enteredRoles.clear()
        STAGE_ROLES.forEach(({id}) => {
            setRoleState(id, "waiting")
            performerEls.get(id)?.classList.remove("entered")
        })
        cancelMock = playMockTimeline(emit, {onDone: stopMock})
    }
    if (demoMode) {startMock()}
    lifecycle.own({terminate: () => cancelMock?.()})

    // ── Provider 状态（Codex 连接，v0.2.0 链路） ────────────────────────────
    let providerStatus = Option.None as Option<AgentProviderStatus>
    let providerBusy = false
    let loginPoll: number | null = null
    const stopLoginPolling = () => {
        if (loginPoll === null) {return}
        window.clearInterval(loginPoll)
        loginPoll = null
    }
    const renderProviderSlot = () => {
        Html.empty(providerSlot)
        providerStatus.match({
            none: () => {
                statusDot.className = "status-dot checking"
                providerSlot.appendChild(<div className="provider-card checking">检查创作模型…</div>)
            },
            some: status => {
                const {codex} = status
                if (codex.authenticated) {
                    statusDot.className = "status-dot connected"
                    const remaining = codex.rateLimit === null
                        ? "用量充足"
                        : `当前窗口剩余 ${Math.max(0, 100 - Math.round(codex.rateLimit.usedPercent))}%`
                    providerSlot.appendChild(
                        <div className="provider-card connected">
                            <strong>已连接 Codex</strong><span>{codex.planType ?? "ChatGPT"} · {remaining}</span>
                        </div>)
                    return
                }
                if (codex.available) {
                    statusDot.className = status.activeProvider === "openai" ? "status-dot connected" : "status-dot local"
                    const connectButton: HTMLButtonElement = (
                        <button type="button" disabled={providerBusy}>{providerBusy ? "打开中…" : "连接 Codex"}</button>)
                    lifecycle.own(Events.subscribe(connectButton, "click", connectCodex))
                    providerSlot.appendChild(
                        <div className="provider-card">
                            <strong>{status.activeProvider === "openai" ? "OpenAI API 已激活" : "连接 ChatGPT 以启用创作模型"}</strong>
                            {connectButton}
                        </div>)
                    return
                }
                statusDot.className = "status-dot local"
                providerSlot.appendChild(
                    <div className="provider-card unavailable">
                        <strong>创作模型不可用</strong><span>{codex.error ?? "连接 Codex 或配置 OpenAI API"}</span>
                    </div>)
            }
        })
    }
    const refreshProviderStatus = (announce: boolean = false): Promise<AgentProviderStatus> =>
        client.providerStatus().then(status => {
            const wasConnected = providerStatus.match({none: () => false, some: previous => previous.codex.authenticated})
            providerStatus = Option.wrap(status)
            if (status.codex.authenticated) {stopLoginPolling()}
            if (announce && status.codex.authenticated && !wasConnected) {
                appendEvent("Codex 账号已连接，创作规划将使用你的 Codex 额度", "success")
            }
            renderProviderSlot()
            return status
        })
    const beginLoginPolling = () => {
        stopLoginPolling()
        let attempts = 0
        loginPoll = window.setInterval(() => {
            attempts++
            refreshProviderStatus(true).then(status => {
                if (status.codex.authenticated || attempts >= 60) {stopLoginPolling()}
            })
        }, 2_000)
    }
    const connectCodex = () => {
        if (providerBusy) {return}
        providerBusy = true
        renderProviderSlot()
        const authWindow = window.open("about:blank", "dawdex-codex-login")
        if (authWindow !== null) {
            authWindow.document.title = "Connect Codex"
            authWindow.document.body.textContent = "Preparing secure ChatGPT sign-in…"
        }
        client.startCodexLogin().then(result => {
            providerBusy = false
            if (result.alreadyAuthenticated) {
                authWindow?.close()
                refreshProviderStatus(true).catch(reason => appendEvent(`模型状态检查失败：${String(reason)}`))
                return
            }
            if (result.authUrl === null) {throw new Error("Codex 未返回登录链接")}
            if (authWindow !== null) {
                authWindow.location.href = result.authUrl
            } else {
                window.open(result.authUrl, "_blank", "noopener,noreferrer")
            }
            appendEvent("请在浏览器窗口中完成 ChatGPT 登录", "working")
            beginLoginPolling()
            renderProviderSlot()
        }).catch(reason => {
            providerBusy = false
            authWindow?.close()
            appendEvent(`Codex 登录失败：${String(reason)}`)
            renderProviderSlot()
        })
    }

    // ── 上行命令（联调时接到 B/C；MVP 本地回显） ────────────────────────────
    const submitDanmaku = () => {
        const text = input.value.trim()
        if (text.length === 0) {return}
        if (cancelMock !== null) {stopMock()}
        input.value = ""
        const danmakuId = realBridge.receiveDanmaku(text)
        spawnFanReactions(text) // 乐迷附和（氛围层）；制作人/角色的真实回执仍走事件链
        requestPlan(text, danmakuId)
    }
    const intervene = (kind: InterventionKind) => {
        if (kind === "undo") {
            const result = daw.undo()
            realBridge.finishUndo(result)
            realBridge.sync(daw.snapshot())
            if (result.success) {launchDanmaku("↩ 已撤销上一次 DAWdex 修改", "system")}
            return
        }
        const label = INTERVENTIONS.find(i => i.kind === kind)?.label ?? kind
        if (kind === "keep") {
            // 保留 = 放弃待批准的修改计划，确认当前版本
            if (currentPlan.nonEmpty()) {
                currentPlan = Option.None
                renderPlanSlot()
                appendEvent("已放弃待批准的修改，保留当前版本", "success")
            } else {
                appendEvent("已确认保留当前版本", "success")
            }
            launchDanmaku("制作人：收到，保持现在的样子", "producer")
            return
        }
        // FR-09 干预 → 真实链路：翻译成新的计划请求，批准后真实改音乐
        //（契约 UserIntervention 的前端映射；B 的 /v1/intervention 就绪后改为直发）
        if (isBusy) {
            appendEvent(`「${label}」请稍后：上一个计划仍在生成中`, "working")
            return
        }
        appendEvent(`用户干预：${label} — 正在生成修改计划…`, "working")
        requestPlan(`【干预】${label}（在保留当前工程结构的前提下调整音乐）`,
            undefined, "intervention")
    }

    // ── plan/apply 链路（v0.2.0 真实链路，收入证据抽屉） ─────────────────────
    let currentPlan = Option.None as Option<AgentPlan>
    let currentPlanKind: "apply" | "intervention" = "apply"
    let isBusy = false
    const requestPlan = (
        prompt: string,
        danmakuId?: string,
        operationKind: "apply" | "intervention" = "apply"
    ) => {
        if (isBusy) {return}
        isBusy = true
        appendEvent("制作人正在把你的想法翻译成音乐计划…", "working")
        client.createPlan(prompt, daw.snapshot(), progress => {
            appendEvent(progress.message, "working")
        }).then(plan => {
            isBusy = false
            currentPlan = Option.wrap(plan)
            currentPlanKind = operationKind
            realBridge.acceptPlan(plan, danmakuId, daw.snapshot())
            appendEvent(`${plan.actions.length} 个安全动作待批准`, "success")
            renderPlanSlot()
        }, reason => {
            isBusy = false
            appendEvent(`规划失败：${String(reason)}`)
        })
    }
    const renderPlanSlot = () => {
        Html.empty(planSlot)
        currentPlan.ifSome(plan => {
            const applyButton: HTMLButtonElement = (<button type="button" className="apply">批准并执行</button>)
            const dismissButton: HTMLButtonElement = (<button type="button">放弃</button>)
            const actions: HTMLElement = (<div className="actions"/>)
            plan.actions.forEach((action, index) => appendChildren(actions, (
                <div className="action"><span className="index">{index + 1}</span><span>{DawAction.describe(action)}</span></div>)))
            Events.subscribe(applyButton, "click", () => {
                if (isBusy) {return}
                isBusy = true
                applyButton.disabled = true
                appendEvent("正在把批准的计划写入 openDAW…", "working")
                realBridge.beginPlan(plan)
                daw.apply(plan).then(result => {
                    isBusy = false
                    applyButton.disabled = false
                    realBridge.finishPlan(plan, currentPlanKind, result)
                    realBridge.sync(daw.snapshot())
                    if (result.success) {
                        appendEvent(result.message, "success")
                        launchDanmaku(`✓ ${plan.title}`, "producer")
                        currentPlan = Option.None
                    } else {
                        appendEvent(result.message)
                    }
                    renderPlanSlot()
                }, reason => {
                    isBusy = false
                    applyButton.disabled = false
                    const message = `执行失败：${String(reason)}`
                    realBridge.finishPlan(plan, currentPlanKind, {success: false, message})
                    appendEvent(message)
                })
            })
            Events.subscribe(dismissButton, "click", () => {
                currentPlan = Option.None
                appendEvent("计划已放弃")
                renderPlanSlot()
            })
            const source = plan.source === "codex" ? "Codex 账号" : plan.source === "model" ? "OpenAI API" : "本地回退"
            const rationale: HTMLElement = (<div className="reasoning"/>)
            appendChildren(
                rationale,
                <strong>AI 创作方向</strong>,
                <span>{plan.brief.decisionSummary}</span>,
                ...plan.rationale.map(item => <span className="reason">{`· ${item}`}</span>)
            )
            appendChildren(planSlot, (
                <div className="plan-card">
                    <div className="plan-kicker">
                        <span>{`待批准 · ${plan.brief.intent} · ${plan.brief.style}`}</span>
                        <span className="source">{source}</span>
                    </div>
                    <h3>{plan.title}</h3>
                    <p>{plan.summary}</p>
                    <p>{`${plan.brief.key} · ${plan.brief.bars} 小节 · ${Math.round(plan.brief.bpm)} BPM · 保留 ${plan.brief.preserveTrackIds.length} 轨`}</p>
                    {rationale}
                    {actions}
                    <div className="plan-buttons">{dismissButton}{applyButton}</div>
                </div>))
        })
    }

    const interventionButtons = INTERVENTIONS.map(({kind, label}) => {
        const btn: HTMLButtonElement = (<button type="button" data-kind={kind}>{label}</button>)
        lifecycle.own(Events.subscribe(btn, "click", () => intervene(kind)))
        return btn
    })

    // ── 键盘左翼：系统按键（L 形甲板的竖起一边） ────────────────────────
    const wingSettings: HTMLButtonElement = (<button type="button" className="wing-key" title="设置">⚙<span>设置</span></button>)
    const wingPresent: HTMLButtonElement = (<button type="button" className="wing-key" title="投屏模式">⛶<span>投屏</span></button>)
    const wingWorkbench: HTMLButtonElement = (<button type="button" className="wing-key" title="打开 openDAW 工作台">⌄<span>工作台</span></button>)

    // ── 伪 3D 桌面场景（运镜作用层）：CRT + 底座 + L 形键盘甲板 ─────────
    const deskSceneEl: HTMLElement = (
        <div className="desk-scene">
            <div className="stage-bezel">
                {stageEl}
            </div>
            <div className="crt-stand"/>
            <div className="keyboard-deck">
                <div className="deck-wing">
                    {wingSettings}{wingPresent}{wingWorkbench}
                </div>
                <div className="deck-main">
                    <div className="deck-screen">
                        <div className="deck-idle">
                            {deckReadout}
                            <span className="deck-hint">点场景里的物件 · 内容在这块屏上打开</span>
                        </div>
                        {panelEl}
                    </div>
                    <div className="interventions">{interventionButtons}</div>
                </div>
            </div>
        </div>)

    // ── 物件功能面板（舞台内二级页面：点击物件从右缘滑出，§9.4） ─────────────
    type PanelKind = "monitor" | "desk" | "guitar" | "lamp" | "art" | "shelf" | "clock" | "settings"
    const PANEL_TITLES: Record<PanelKind, string> = {
        monitor: "REC 监视器 · 走带",
        desk: "调音台 · 轨道",
        guitar: "沙发旁的吉他",
        lamp: "吊灯 · 能量",
        art: "声波挂画 · 工程概览",
        shelf: "书架 · 素材架",
        clock: "挂钟 · 循环",
        settings: "设置 · 系统"
    }
    let openPanelKind: PanelKind | null = null
    const closePanel = () => {
        openPanelKind = null
        Html.empty(panelEl) // CSS 以 :empty 判定关闭态（屏幕熄灭）
        deskSceneEl.classList.remove("deck-focus") // 运镜回位：视角从键盘屏拉回正式机位
    }
    // 轨道列表（监视器/调音台面板共用；发声点 = 真实 TrackAudibleChanged 状态）
    const buildTrackRows = (): HTMLElement => {
        const rows: HTMLElement = (<div className="panel-tracks"/>)
        const snap = daw.snapshot()
        if (!snap.hasProject || snap.tracks.length === 0) {
            appendChildren(rows, (<div className="panel-note">当前工程还没有轨道 — 发送弹幕让乐队开始创作</div>))
            return rows
        }
        snap.tracks.forEach(track => {
            const role = track.role as RoleId | null
            const audible = role !== null && audibleRoles.has(role)
            appendChildren(rows, (
                <div className="panel-track" data-role={role ?? ""}>
                    <span className={`track-dot${audible ? " on" : ""}`}/>
                    <span className="track-name">{track.name}</span>
                    <span className="track-meta">{track.regionCount} Region</span>
                </div>))
        })
        return rows
    }
    const openPanel = (kind: PanelKind) => {
        openPanelKind = kind
        Html.empty(panelEl)
        deskSceneEl.classList.add("deck-focus") // 运镜：视角转向并俯视键盘屏
        const closeBtn: HTMLButtonElement = (<button type="button" className="panel-close" title="关闭（Esc）">✕</button>)
        closeBtn.onclick = () => closePanel()
        const openInDaw: HTMLButtonElement = (<button type="button" className="panel-daw-link">在 openDAW 中打开 →</button>)
        openInDaw.onclick = () => {
            closePanel()
            setCollapsed(true)
        }
        const body: HTMLElement = (<div className="panel-body"/>)
        if (kind === "monitor") {
            const toggleBtn: HTMLButtonElement = (
                <button type="button" className="panel-primary">{isPlaying ? "⏸ 暂停走带" : "▶ 播放走带"}</button>)
            toggleBtn.onclick = () => {
                const result = daw.setTransport(!isPlaying)
                appendEvent(`REC 监视器：${result.message}`, result.success ? "success" : "normal")
                toggleBtn.textContent = isPlaying ? "⏸ 暂停走带" : "▶ 播放走带"
            }
            appendChildren(body,
                (<div className="panel-row big">{panelReadout}</div>),
                toggleBtn,
                (<div className="panel-sub">工程轨道</div>),
                buildTrackRows())
        } else if (kind === "desk") {
            appendChildren(body,
                buildTrackRows(),
                (<div className="panel-note">每轨静音 / 音量映射待引擎侧能力开放，当前为只读状态</div>))
        } else if (kind === "guitar") {
            const swapBtn: HTMLButtonElement = (<button type="button" className="panel-primary">换一把音色（换乐器干预）</button>)
            swapBtn.onclick = () => {
                appendEvent("拿起了沙发旁的吉他…", "working")
                intervene("swap-instrument")
            }
            appendChildren(body,
                (<div className="panel-note">触发一次「换乐器」干预：制作人会生成新的音色计划，批准后真实改写工程</div>),
                swapBtn)
        } else if (kind === "art") {
            // 声波挂画 = 工程概览：当前工程状态 + 轨道清单（只读）
            appendChildren(body,
                (<div className="panel-row big">{`${Math.round(bpm)} BPM · ${keySig} · ${barsPerLoop} 小节循环`}</div>),
                (<div className="panel-sub">工程轨道</div>),
                buildTrackRows())
        } else if (kind === "shelf") {
            // 书架 = 素材架：openDAW 工程里的真实素材（音频/SoundFont/Playfield 等）
            const assets = daw.snapshot().assets ?? []
            if (assets.length === 0) {
                appendChildren(body,
                    (<div className="panel-note">素材架空着 — 生成或导入的 MIDI、音频素材会摆到这里</div>))
            } else {
                const rows: HTMLElement = (<div className="panel-tracks"/>)
                assets.forEach(asset => appendChildren(rows, (
                    <div className="panel-track">
                        <span className="track-dot on"/>
                        <span className="track-name">{asset.name}</span>
                        <span className="track-meta">{asset.kind}</span>
                    </div>)))
                appendChildren(body, rows)
            }
        } else if (kind === "clock") {
            // 挂钟 = 循环：指针已是 loopPos 的 Diegetic 绑定，面板给出读数
            appendChildren(body,
                (<div className="panel-row big">{`${barsPerLoop} 小节循环 · ${Math.round(bpm)} BPM · ${keySig}`}</div>),
                (<div className="panel-note">{`指针转一圈 = 一个循环（约 ${(barsPerLoop * 4 * 60 / bpm).toFixed(1)} 秒），暂停时指针冻结`}</div>))
        } else if (kind === "settings") {
            // 左翼设置键 = 系统功能（与顶栏同源）
            const presentBtn: HTMLButtonElement = (<button type="button" className="panel-primary">投屏模式</button>)
            presentBtn.onclick = () => {
                closePanel()
                presentButton.click()
            }
            const workbenchBtn: HTMLButtonElement = (<button type="button" className="panel-primary">打开 openDAW 工作台</button>)
            workbenchBtn.onclick = () => {
                closePanel()
                setCollapsed(true)
            }
            const replayBtn: HTMLButtonElement = (<button type="button" className="panel-primary">回放 90 秒演示</button>)
            replayBtn.onclick = () => {
                closePanel()
                startMock()
            }
            appendChildren(body,
                (<div className="panel-note">系统功能与顶栏按钮同源，投屏/工作台/回放随时可用</div>),
                presentBtn, workbenchBtn, replayBtn)
        } else {
            const strongerBtn: HTMLButtonElement = (<button type="button" className="panel-primary">更有力量</button>)
            const lighterBtn: HTMLButtonElement = (<button type="button" className="panel-primary">更轻松</button>)
            strongerBtn.onclick = () => intervene("stronger")
            lighterBtn.onclick = () => intervene("lighter")
            appendChildren(body,
                (<div className="panel-note">调整整体能量：制作人在保留当前结构的前提下改写音乐</div>),
                (<div className="panel-row">{strongerBtn}{lighterBtn}</div>))
        }
        appendChildren(panelEl, (
            <div className="panel-inner">
                <div className="panel-head"><strong>{PANEL_TITLES[kind]}</strong>{closeBtn}</div>
                {body}
                <div className="panel-foot">{openInDaw}</div>
            </div>))
    }

    // ── 进棚过场（首次挂载的氛围过场，2.6s 或点击跳过；引擎加载发生在本组件挂载前） ──
    const introSplash: HTMLElement = (
        <div className="intro-splash">
            <span className="intro-caption">上楼进棚 · DAWDEX</span>
        </div>)
    const dismissIntro = () => {
        if (introSplash.classList.contains("gone")) {return}
        introSplash.classList.add("gone")
        setTimeout(() => introSplash.remove(), 700)
    }
    lifecycle.own(Events.subscribe(introSplash, "click", dismissIntro))
    const introTimer = window.setTimeout(dismissIntro, 2600)
    lifecycle.own(Terminable.create(() => window.clearTimeout(introTimer)))

    // ── 根节点（投屏演示模式作用于此） ───────────────────────────────────────
    const root: HTMLElement = (
        <div className={className}>
            {introSplash}
            <div className="shell-header">
                <span className="brand">{`DAWDEX v${DAWDEX_VERSION}`}</span>
                {onAirLamp}
                {statusDot}
                <span className="channel">CH{chPrev}{channelName}{chNext}</span>
                {lastEvent}
                <span className="header-spacer"/>
                {collapseButton}
                {presentButton}
                {replayButton}
            </div>
            {deskSceneEl}
            <div className="composer">
                {input}
                {sendButton}
            </div>
            <details className="drawer">
                <summary>乐队会议 · 工作回执 · 证据</summary>
                {providerSlot}
                {receiptList}
                {planSlot}
                {activity}
            </details>
        </div>
    )

    root.classList.add("transport-paused")
    root.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`)

    // ── 收起外壳 = 掀开舞台地板，露出底下真实 openDAW（事件桥持续同步，回来即最新） ──
    const setCollapsed = (force?: boolean) => {
        const on = force ?? !root.classList.contains("collapsed")
        root.classList.toggle("collapsed", on)
        collapseButton.classList.toggle("active", on)
        collapseButton.textContent = on ? "⌃ 演播厅" : "⌄ 工作台"
        collapseButton.title = on ? "回到 DAWdex 演播厅（Esc 往返）" : "收起演播厅，打开 openDAW 工作台（Esc 往返）"
        if (on && root.classList.contains("presentation")) {
            root.classList.remove("presentation")
            presentButton.classList.remove("active")
        }
    }
    lifecycle.own(Events.subscribe(window, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
            if (openPanelKind !== null) {closePanel()} else {setCollapsed()}
        }
    }))

    lifecycle.ownAll(
        Events.subscribe(sendButton, "click", submitDanmaku),
        Events.subscribe(input, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter") {event.preventDefault(); submitDanmaku()}
        }),
        Events.subscribe(presentButton, "click", () => {
            const on = root.classList.toggle("presentation")
            presentButton.classList.toggle("active", on)
            if (on) {setCollapsed(false)} // 投屏与收起互斥
        }),
        Events.subscribe(collapseButton, "click", () => setCollapsed()),
        Events.subscribe(replayButton, "click", () => {
            appendEvent("回放 90 秒演示（Mock 驱动）", "working")
            startMock()
        }),
        Events.subscribe(chPrev, "click", () => setRoom(roomIndex - 1)),
        Events.subscribe(chNext, "click", () => setRoom(roomIndex + 1)),
        // ── 物件交互：hover 动画纯 CSS；点击轮廓命中层 → 打开对应功能面板 ──
        Events.subscribe(lampHit, "click", event => {
            event.stopPropagation()
            openPanel("lamp")
        }),
        Events.subscribe(monitorHit, "click", event => {
            event.stopPropagation()
            openPanel("monitor")
        }),
        Events.subscribe(guitarHit, "click", event => {
            event.stopPropagation()
            openPanel("guitar")
        }),
        Events.subscribe(deskHotspot, "click", event => {
            event.stopPropagation()
            openPanel("desk")
        }),
        // ── 键盘左翼系统键 ──
        Events.subscribe(wingSettings, "click", () => openPanel("settings")),
        Events.subscribe(wingPresent, "click", () => presentButton.click()),
        Events.subscribe(wingWorkbench, "click", () => setCollapsed(true)),
        Events.subscribe(artHit, "click", event => {
            event.stopPropagation()
            openPanel("art")
        }),
        Events.subscribe(shelfHit, "click", event => {
            event.stopPropagation()
            openPanel("shelf")
        }),
        Events.subscribe(clockHit, "click", event => {
            event.stopPropagation()
            openPanel("clock")
        }),
        // 面板外点击舞台 = 关闭面板；面板内点击不冒泡
        Events.subscribe(stageEl, "click", () => {
            if (openPanelKind !== null) {closePanel()}
        }),
        Events.subscribe(panelEl, "click", event => event.stopPropagation()),
        Terminable.create(stopLoginPolling)
    )

    // 支持 ?room=<id> 深链（演示导航用）
    const initialRoom = new URLSearchParams(window.location.search).get("room")
    if (initialRoom !== null) {
        const idx = ROOMS.findIndex(r => r.id === initialRoom)
        if (idx >= 0) {setRoom(idx)}
    }
    // 支持 ?workbench=1 深链：直接以收起态（openDAW 工作台）启动
    if (new URLSearchParams(window.location.search).has("workbench")) {setCollapsed(true)}
    // 支持 ?panel=monitor|desk|guitar|lamp|art|shelf|clock|settings 深链：直接打开物件功能面板（演示导航用）
    const initialPanel = new URLSearchParams(window.location.search).get("panel")
    if (initialPanel === "monitor" || initialPanel === "desk"
        || initialPanel === "guitar" || initialPanel === "lamp"
        || initialPanel === "art" || initialPanel === "shelf"
        || initialPanel === "clock" || initialPanel === "settings") {openPanel(initialPanel)}

    // 巡棚房间背景 + 物件 sprite 预载（避免首次切台白闪）
    const preloadImage = (src: string) => {
        const img = new Image()
        img.src = src
    }
    ROOMS.forEach(room => preloadImage(room.bg))
    const SPRITE_SRCS = [
        "/dawdex/obj_lamp.png", "/dawdex/obj_monitor.png", "/dawdex/obj_guitar.png",
        "/dawdex/obj_art.png", "/dawdex/obj_shelf.png", "/dawdex/obj_clock.png"
    ]
    SPRITE_SRCS.forEach(preloadImage)

    renderProviderSlot()
    refreshProviderStatus(true).catch(reason => appendEvent(`模型状态检查失败：${String(reason)}`))
    const realSyncTimer = window.setInterval(() => realBridge.sync(daw.snapshot()), 500)
    lifecycle.own(Terminable.create(() => window.clearInterval(realSyncTimer)))
    if (!demoMode) {realBridge.sync(daw.snapshot())}
    appendEvent(demoMode
        ? "DAWdex 舞台就绪（演示模式 · Mock 驱动）"
        : "DAWdex 舞台就绪 — 发送弹幕开始创作，或点 ↻ 回放 90 秒演示", "success")
    if (!demoMode) {launchDanmaku("发送弹幕指挥乐队 · 点 ↻ 可回放 90 秒演示", "system")}
    return root
}
