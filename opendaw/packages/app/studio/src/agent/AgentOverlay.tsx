import css from "./AgentOverlay.sass?inline"
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Option, Terminable} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {AgentClient} from "./AgentClient"
import {
    AgentPlan, AgentProviderStatus, AgentRuntimeSnapshot, AgentRuntimeSummary, DAWDEX_VERSION, DawAction
} from "./AgentProtocol"
import {DawProjectAdapter} from "./DawProjectAdapter"
import {RealUiEventBridge} from "./RealUiEventBridge"
import type {
    DanmakuAuthor, InterventionKind, RoleId, RoleState, UiEvent
} from "./ui-contract"
import {playMockTimeline} from "./mock-timeline"
import {DawdexStagePreview} from "@/ui/devices/panel/DawdexStagePreview"
import {
    DAWDEX_PRODUCER, DAWDEX_ROOMS, DAWDEX_STAGE_ROLES, type DawdexRoomId
} from "./DawdexStageAssets"
import {
    DawdexProjectModeController, getDawdexUiSession, shouldPlayDawdexVideo, type DawdexViewMode
} from "./DawdexUiSession"

const className = Html.adoptStyleSheet(css, "AgentOverlay")

type Construct = {
    readonly lifecycle: Lifecycle
    readonly service: StudioService
}

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
type RoomId = DawdexRoomId

// ── 物件功能面板类型（模块级：房间物件注册表引用） ────────────────────────
type PanelKind = "monitor" | "desk" | "guitar" | "lamp" | "art" | "shelf" | "clock" | "settings" | "role-kit" | "cat"

// ── 冒险游戏管线 · 房间物件注册表（§13：替身零像素差 + 轮廓命中 + :has 联动） ──
// box = 舞台百分比 [left, top, width, height]（1600 宽帧、cover 可视高 950px 标定）；
// sprite 为底图同像素矩形裁剪（原位盖回零差异），clip 沿物件真实轮廓；
// bind = Diegetic 绑定："playing" 走带播放亮起，drums/bass/keys 该角色 TrackAudibleChanged 亮起
type RoomObject = {
    readonly room: Exclude<RoomId, "main">
    readonly id: string
    readonly label: string
    readonly box: readonly [number, number, number, number]
    readonly clip?: string
    readonly panel?: PanelKind
    readonly bind?: "playing" | RoleId
    readonly align?: "left" | "right"
    readonly anim?: "sway" | "rock" | "bob" // hover 动画绑定：sway 悬挂摆动 / rock 立地摇晃 / bob 轻弹跳
}
const LAMP_CLIP = "polygon(46% 0%, 54% 0%, 54% 52%, 88% 74%, 97% 88%, 62% 88%, 62% 97%, 38% 97%, 38% 88%, 3% 88%, 12% 74%, 46% 52%)"
const ROOM_OBJECTS: ReadonlyArray<RoomObject> = [
    // 鼓棚：监视器=轨道，鼓组=音色，节拍器=BPM/循环，吊灯=能量，REC 灯牌=鼓发声确认
    {room: "drums", id: "monitor", label: "DRUM PREAMPS · 轨道", box: [18.75, 50.26, 10.94, 17.89],
        clip: "polygon(2% 2%, 98% 2%, 98% 72%, 60% 72%, 60% 98%, 40% 98%, 40% 72%, 2% 72%)", panel: "desk"},
    {room: "drums", id: "kit", label: "鼓组 · 鼓音色", box: [33.12, 51.84, 39.06, 52.11], anim: "bob",
        clip: "polygon(0% 5%, 32% 0%, 34% 10%, 40% 19%, 60% 19%, 63% 10%, 66% 2%, 91% 0%, 96% 9%, 87% 15%, 85% 22%, 93% 32%, 98% 58%, 100% 98%, 0% 98%, 2% 58%, 15% 30%, 22% 22%, 10% 16%)", panel: "role-kit"},
    {room: "drums", id: "metro", label: "节拍器 · BPM / 循环", box: [93.12, 61.32, 5.00, 11.58], clip: "polygon(50% 2%, 92% 98%, 8% 98%)", panel: "clock", align: "right", anim: "sway"},
    {room: "drums", id: "lamp", label: "吊灯 · 能量", box: [62.81, 3.95, 9.69, 27.37], clip: LAMP_CLIP, panel: "lamp", anim: "sway"},
    {room: "drums", id: "sign", label: "REC DRUMS · 发声确认", box: [92.50, 21.84, 7.50, 10.53], bind: "drums", align: "right"},
    // 吉他贝斯棚：信号链屏=轨道，三把吉他=音色，效果器板=换乐器，吊灯=能量，REC 灯牌=贝斯发声确认
    {room: "strings", id: "screen", label: "信号链屏 · 轨道", box: [42.19, 30.79, 17.19, 18.42], panel: "desk"},
    {room: "strings", id: "guitars", label: "三把吉他 · 音色", box: [39.38, 49.74, 23.12, 38.95], anim: "rock",
        clip: "polygon(2% 14%, 10% 3%, 90% 3%, 98% 14%, 96% 45%, 99% 65%, 97% 97%, 3% 97%, 1% 65%, 4% 45%)", panel: "role-kit"},
    {room: "strings", id: "pedals", label: "效果器板 · 换乐器", box: [36.88, 88.16, 27.81, 13.16], clip: "polygon(2% 15%, 98% 2%, 100% 95%, 0% 100%)", panel: "guitar"},
    {room: "strings", id: "lamp", label: "吊灯 · 能量", box: [64.69, 1.32, 6.25, 29.47], clip: LAMP_CLIP, panel: "lamp", anim: "sway"},
    {room: "strings", id: "sign", label: "REC GUITAR/BASS · 发声确认", box: [24.69, 16.05, 11.56, 10.53], bind: "bass"},
    // 键盘阁楼：走带监视器=transport，上排键盘/Rhodes=音色，红琴=换乐器，合成器墙=轨道，吊灯=能量，REC 灯牌=键盘发声确认
    {room: "keys", id: "screen", label: "走带监视器 · 播放", box: [42.19, 31.32, 17.19, 18.42], panel: "monitor"},
    {room: "keys", id: "synthwall", label: "合成器墙 · 轨道", box: [18.75, 47.11, 22.50, 20.00], clip: "polygon(2% 25%, 15% 5%, 96% 2%, 100% 30%, 98% 95%, 3% 98%)", panel: "desk"},
    {room: "keys", id: "top", label: "上排键盘 · 音色", box: [41.88, 52.37, 47.81, 15.79], panel: "role-kit", anim: "bob",
        clip: "polygon(1% 15%, 5% 2%, 36% 5%, 38% 20%, 42% 15%, 45% 3%, 97% 5%, 99% 25%, 97% 90%, 44% 95%, 42% 85%, 38% 92%, 3% 95%, 0% 60%)"},
    {room: "keys", id: "rhodes", label: "Rhodes · 音色", box: [36.56, 70.26, 30.19, 29.68], panel: "role-kit", anim: "bob",
        clip: "polygon(1% 2%, 99% 0%, 100% 4%, 100% 34%, 98.5% 35%, 98.5% 99%, 90% 100%, 89.5% 35%, 13.5% 35%, 13.5% 100%, 3.5% 100%, 3.5% 35%, 0% 34%, 0% 4%)"},
    {room: "keys", id: "redkey", label: "红色电钢 · 换乐器", box: [14.69, 72.37, 16.88, 12.11], clip: "polygon(2% 20%, 95% 2%, 100% 90%, 5% 100%)", panel: "guitar", anim: "rock"},
    {room: "keys", id: "lamp", label: "吊灯 · 能量", box: [64.38, 1.32, 6.56, 30.00], clip: LAMP_CLIP, panel: "lamp", anim: "sway"},
    {room: "keys", id: "sign", label: "REC KEYBOARDS · 发声确认", box: [25.31, 37.63, 8.75, 10.00], bind: "keys"},
    // 控制室：调音台=轨道，机架=系统设置，时间码屏=transport，三联屏=工程概览，吊灯=能量（大件在前，小件在后优先命中）
    {room: "control", id: "desk", label: "调音台 · 轨道", box: [17.19, 61.21, 70.31, 20.53], clip: "polygon(0% 6%, 99% 1%, 100% 55%, 98% 100%, 2% 100%, 0% 55%)", panel: "desk"},
    {room: "control", id: "rack", label: "机架 · 系统", box: [2.50, 41.21, 15.31, 56.32], panel: "settings", align: "left"},
    {room: "control", id: "recscreen", label: "REC 时间码 · 走带", box: [18.75, 42.79, 10.31, 18.42],
        clip: "polygon(3% 2%, 97% 2%, 97% 68%, 62% 68%, 62% 98%, 38% 98%, 38% 68%, 3% 68%)", panel: "monitor"},
    {room: "control", id: "triple", label: "三联屏 · 工程概览", box: [37.19, 43.84, 23.44, 17.37],
        clip: "polygon(0% 3%, 33% 0%, 35% 6%, 65% 4%, 67% 0%, 100% 3%, 100% 88%, 82% 88%, 80% 99%, 70% 99%, 70% 88%, 30% 88%, 28% 99%, 18% 99%, 16% 88%, 0% 88%)", panel: "art"},
    {room: "control", id: "lamp", label: "吊灯 · 能量", box: [63.12, 5.42, 7.81, 26.32], clip: LAMP_CLIP, panel: "lamp", anim: "sway"},
    // 休息室：沙发=走带（休息一下），咖啡桌=能量，零食柜=素材架，店猫=彩蛋，海报=工程概览，REC 灯牌=播放绑定
    {room: "lounge", id: "poster", label: "TASCAM 海报 · 工程概览", box: [25.31, 17.11, 15.62, 41.05], panel: "art"},
    {room: "lounge", id: "sofa", label: "沙发 · 休息一下", box: [0.94, 58.68, 33.44, 40.00],
        clip: "polygon(3% 12%, 10% 2%, 88% 2%, 97% 10%, 100% 85%, 96% 99%, 4% 99%, 0% 85%)", panel: "monitor"},
    {room: "lounge", id: "coffee", label: "咖啡桌 · 续杯能量", box: [36.88, 68.16, 21.56, 32.63],
        clip: "polygon(8% 2%, 92% 0%, 100% 25%, 96% 98%, 88% 100%, 85% 60%, 15% 60%, 12% 100%, 4% 98%, 0% 25%)", panel: "lamp"},
    {room: "lounge", id: "snacks", label: "零食柜 · 素材架", box: [73.44, 46.58, 26.56, 58.95],
        clip: "polygon(5% 3%, 70% 0%, 73% 14%, 99% 26%, 100% 99%, 0% 99%, 0% 30%, 10% 28%)", panel: "shelf"},
    {room: "lounge", id: "sign", label: "REC IN PROGRESS · 播放中", box: [60.31, 15.53, 14.37, 14.21], bind: "playing"},
    {room: "lounge", id: "cat", label: "店猫 · 彩蛋", box: [26.25, 89.74, 8.12, 8.95], anim: "bob",
        clip: "polygon(15% 35%, 30% 8%, 45% 20%, 60% 5%, 75% 25%, 95% 45%, 90% 90%, 10% 95%, 0% 60%)", panel: "cat"}
]

export const AgentOverlay = ({lifecycle, service}: Construct) => {
    const client = new AgentClient()
    const daw = new DawProjectAdapter(service)
    const uiSession = getDawdexUiSession(service)
    const initialSearchParams = new URLSearchParams(window.location.search)
    const demoMode = initialSearchParams.has("mock")

    // ── DOM 骨架 ────────────────────────────────────────────────────────────
    const danmakuLayer: HTMLElement = (<div className="danmaku-layer"/>)
    const marquee: HTMLElement = (<div className="marquee hidden"><span className="marquee-text"/></div>)
    const noise: HTMLElement = (<div className="noise hidden"/>)
    const transportReadout: HTMLElement = (<span className="readout">-- · -- BPM · --</span>)
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
    // 显示器上的「新建工程」键：产品页出发的建工程入口——点击后仍停留完整演播厅
    const newProjectButton: HTMLButtonElement = (
        <button type="button" className="new-project" title="新建 openDAW 工程">＋ 新建工程</button>)
    // 巡棚：全部房间均为静态底图（切台硬切，TV 气质）
    const stageImg: HTMLImageElement = (
        <img className="stage-bg-img" alt="" draggable={false}/>)
    stageImg.src = DAWDEX_ROOMS[0].bg
    // 演出态皮肤：走带播放时整棚苏醒（烟雾/时间码/机架灯）；
    // 帧 0 = 静态底图来源，与 sprite 淡出淡入无缝切换，暂停即回到静帧
    const stageVideo: HTMLVideoElement = (
        <video className="stage-bg-video" loop playsInline preload="auto" muted draggable={false}/>)
    stageVideo.src = DAWDEX_ROOMS[0].video
    const channelName: HTMLElement = (<span className="ch-name">{DAWDEX_ROOMS[0].label}</span>)
    const chPrev: HTMLButtonElement = (<button type="button" title="上一个房间">‹</button>)
    const chNext: HTMLButtonElement = (<button type="button" title="下一个房间">›</button>)

    // ── 角色舞台 ────────────────────────────────────────────────────────────
    const performerEls = new Map<RoleId, HTMLElement>()
    const performers = DAWDEX_STAGE_ROLES.map(({id, label, img}) => {
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
            <img src={DAWDEX_PRODUCER.img} alt={DAWDEX_PRODUCER.label} draggable={false}/>
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
    // ── 巡棚房间物件 slot（§13：全部房间一次建好，CSS 按 data-room 显隐） ──
    const roomSlotsEl: HTMLElement = (<div className="room-slots"/>)
    const slotHits: Array<{hit: HTMLElement, panel: PanelKind}> = []
    const slotLeds: Array<{bind: "playing" | RoleId, el: HTMLElement}> = []
    ROOM_OBJECTS.forEach(obj => {
        const [left, top, width, height] = obj.box
        const img: HTMLImageElement = (
            <img className={`obj-copy${obj.anim !== undefined ? ` anim-${obj.anim}` : ""}`}
                 src={`/dawdex/ro_${obj.room}_${obj.id}.png`} alt="" draggable={false}/>)
        if (obj.clip !== undefined) {img.style.clipPath = obj.clip}
        const hit: HTMLElement = (
            <div className={`obj-hit slot-hit${obj.align !== undefined ? ` align-${obj.align}` : ""}`}
                 data-label={obj.label} title={obj.label}/>)
        if (obj.clip !== undefined) {hit.style.clipPath = obj.clip}
        const glint: HTMLElement = (<span className="hint-glint slot-glint"/>)
        lifecycle.own(Events.subscribe(hit, "mouseenter", () => glint.classList.add("seen")))
        const slot: HTMLElement = (
            <div className="obj-slot" data-room={obj.room}
                 style={`left:${left}%;top:${top}%;width:${width}%;height:${height}%`}>
                {img}{hit}{glint}
            </div>)
        roomSlotsEl.appendChild(slot)
        if (obj.panel !== undefined) {slotHits.push({hit, panel: obj.panel})}
        if (obj.bind !== undefined) {slotLeds.push({bind: obj.bind, el: slot})}
    })
    // 巡棚换台箭头：悬停舞台浮现，用过一次后常驻；左右循环切台 + 老电视频闪
    const navPrev: HTMLElement = (<button className="room-nav prev" title="上一个房间（←）">‹</button>)
    const navNext: HTMLElement = (<button className="room-nav next" title="下一个房间（→）">›</button>)
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
            {roomSlotsEl}
            {recBadge}
            {newProjectButton}
            {navPrev}
            {navNext}
            <div className="transport">
                {transportReadout}
            </div>
        </div>)
    // 巡棚切台
    let roomIndex = 0
    // ── 演出态皮肤：每个房间各有循环视频；播放时视频淡入整棚苏醒，暂停回到静帧 ──
    const setVideoLive = (playing: boolean) => {
        const src = DAWDEX_ROOMS[roomIndex].video
        const on = shouldPlayDawdexVideo("product", uiSession.viewMode.getValue(), playing)
        stageEl.classList.toggle("video-live", on)
        if (on) {
            if (!stageVideo.src.endsWith(src)) {stageVideo.src = src}
            stageVideo.play().catch(() => {})
        } else {
            stageVideo.pause()
            stageVideo.currentTime = 0
        }
    }
    // 老电视换台频闪：白闪 + 场抖 + 噪点一闪
    const zapChannel = () => {
        stageEl.classList.remove("zapping")
        void stageEl.offsetWidth // 重启动画
        stageEl.classList.add("zapping")
        flashNoise()
    }
    const setRoom = (index: number, zap = true) => {
        roomIndex = ((index % DAWDEX_ROOMS.length) + DAWDEX_ROOMS.length) % DAWDEX_ROOMS.length
        const room = DAWDEX_ROOMS[roomIndex]
        channelName.textContent = room.label
        stageEl.dataset.room = room.id
        stageImg.src = room.bg
        uiSession.setRoom(room.id)
        if (zap) {zapChannel()}
        setVideoLive(isPlaying)
    }
    // 换台箭头：点击切台后箭头常驻（已被发现的交互）
    const navTo = (delta: number) => {
        stageEl.classList.add("nav-used")
        setRoom(roomIndex + delta)
    }
    lifecycle.own(Events.subscribe(navPrev, "click", () => navTo(-1)))
    lifecycle.own(Events.subscribe(navNext, "click", () => navTo(1)))
    // 键盘 ←/→ 同样可以巡棚（输入框聚焦时不抢按键）
    lifecycle.own(Events.subscribe(document, "keydown", (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null
        if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {return}
        if (event.key === "ArrowLeft") {navTo(-1)}
        else if (event.key === "ArrowRight") {navTo(1)}
    }))
    const roleStates = new Map<RoleId, RoleState>()
    const audibleRoles = new Set<RoleId>()
    const pendingPerforming = new Map<RoleId, string | undefined>()
    const setRoleState = (role: RoleId, state: RoleState, reason?: string) => {
        const el = performerEls.get(role)
        if (el === undefined) {return}
        roleStates.set(role, state)
        el.dataset.state = state
        el.title = reason ?? state
        uiSession.setRole(role, {state})
        if (state === "failed") {flashNoise()}
    }

    // ── 入场系统：角色首次收到事件时从右侧门口步进式走入（游戏感系统 ①） ────
    const enteredRoles = new Set<RoleId>()
    const enterRole = (role: RoleId) => {
        if (enteredRoles.has(role)) {return}
        enteredRoles.add(role)
        performerEls.get(role)?.classList.add("entered")
        uiSession.setRole(role, {entered: true})
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
        uiSession.setTransport({
            isPlaying: playing,
            bpm,
            key: keySig,
            barsPerLoop,
            currentBar
        })
        updateSlotLeds()
    }

    // ── 房间灯牌 Diegetic 绑定：REC 灯牌 = 对应角色发声确认 / 走带播放 ──
    const updateSlotLeds = () => {
        slotLeds.forEach(({bind, el}) => {
            const on = bind === "playing" ? isPlaying : audibleRoles.has(bind)
            el.classList.toggle("lit", on)
        })
    }

    // ── 弹幕层 ──────────────────────────────────────────────────────────────
    let danmakuLane = 0
    const launchDanmaku = (text: string, author: DanmakuAuthor | "producer" | RoleId = "user") => {
        uiSession.pushDanmaku(text, author)
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
        while (activity.childElementCount > 18) {activity.lastElementChild?.remove()}
        lastEvent.textContent = message
        uiSession.setLatestEvent(message)
    }
    const appendReceipt = (role: RoleId, summary: string, audible: string, ref: string) => {
        const label = DAWDEX_STAGE_ROLES.find(r => r.id === role)?.label ?? role
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
                uiSession.setRole(event.role, {audible: event.audible})
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
                updateSlotLeds()
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
        updateSlotLeds()
        pendingPerforming.clear()
        enteredRoles.clear()
        uiSession.resetRoles()
        DAWDEX_STAGE_ROLES.forEach(({id}) => {
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
                const roleLabels = {drums: "鼓", bass: "贝斯", keys: "键盘"} as const
                daw.apply(plan, {
                    progressive: true,
                    autoPlayAfterFirstRole: true,
                    configureLoop: true,
                    onRoleProgress: progress => {
                        const label = roleLabels[progress.role]
                        if (progress.phase === "preparing") {
                            realBridge.prepareRole(progress.role, progress.assetPath)
                            appendEvent(
                                `正在准备第 ${progress.index + 1}/${progress.total} 轨：${label}，解析真实 MIDI…`,
                                "working"
                            )
                        } else if (progress.phase === "applied") {
                            realBridge.queueRole(progress.role)
                            appendEvent(
                                `第 ${progress.index + 1}/${progress.total} 轨已加入：${label}`,
                                "success"
                            )
                        } else {
                            appendEvent(`${label} 与当前工程重复，已保留现有轨道`, "success")
                        }
                    },
                    waitForNextRole: async progress => {
                        const label = roleLabels[progress.role]
                        appendEvent(`正在试听当前层；${label}将在 2 小节后加入…`, "working")
                        const twoBarsMs = Math.min(
                            8_000,
                            Math.max(2_500, 8 * 60_000 / plan.brief.bpm)
                        )
                        await new Promise(resolve => setTimeout(resolve, twoBarsMs))
                    }
                }).then(result => {
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
            const source = plan.source === "codex" ? "Codex 账号"
                : plan.source === "kimi" ? "Kimi CLI"
                : plan.source === "qoder" ? "Qoder CLI"
                : plan.source === "model" ? "OpenAI API" : "本地回退"
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
    // 设置系统键：键列收尾的小键，在键盘屏上打开设置面板（与物件面板同一位置）
    const settingsKey: HTMLButtonElement = (<button type="button" className="sys-key" data-kind="settings">⚙ 设置</button>)
    lifecycle.own(Events.subscribe(settingsKey, "click", () => openPanel("settings")))

    // ── 伪 3D 桌面场景（运镜作用层）：CRT + 底座 + 键盘甲板 ─────────
    // 甲板布局：屏上键下，左侧无按钮（Fig Mint 式独立键盘矮板）
    const deskSceneEl: HTMLElement = (
        <div className="desk-scene">
            <div className="stage-bezel">
                {stageEl}
            </div>
            <div className="crt-stand"/>
            <div className="keyboard-deck">
                <div className="deck-riser">
                    <div className="deck-screen">
                        <div className="deck-idle">
                            {deckReadout}
                            <span className="deck-hint">点场景里的物件 · 内容在这块屏上打开</span>
                        </div>
                        {panelEl}
                    </div>
                </div>
                <div className="interventions">{interventionButtons}{settingsKey}</div>
            </div>
        </div>)

    // ── 物件功能面板（舞台内二级页面：点击物件从右缘滑出，§9.4） ─────────────
    const PANEL_TITLES: Record<PanelKind, string> = {
        monitor: "REC 监视器 · 走带",
        desk: "调音台 · 轨道",
        guitar: "沙发旁的吉他",
        lamp: "吊灯 · 能量",
        art: "声波挂画 · 工程概览",
        shelf: "书架 · 素材架",
        clock: "挂钟 · 循环",
        settings: "设置 · 系统",
        "role-kit": "乐器 · 音色计划",
        cat: "店猫"
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
    // ── 运行时设置（Open Design 式行列表：读快照 / 增量重扫 / 提交选择，契约 §6） ──
    const renderRuntimeSettings = (container: HTMLElement): void => {
        let snapshot: AgentRuntimeSnapshot | null = null
        let busy = false
        const statusLine: HTMLElement = (<div className="panel-note rt-status">正在扫描本机 CLI…</div>)
        const rows: HTMLElement = (<div className="runtime-rows"/>)
        const rescanBtn: HTMLButtonElement = (<button type="button" className="panel-primary rt-rescan">↻ 重新扫描</button>)
        const mergeRuntime = (runtime: AgentRuntimeSummary): void => {
            if (snapshot === null) {return}
            const list = snapshot.runtimes.slice()
            const index = list.findIndex(entry => entry.id === runtime.id)
            if (index >= 0) {list[index] = runtime} else {list.push(runtime)}
            snapshot = {...snapshot, runtimes: list}
        }
        const buildRow = (options: {
            title: string, meta: string, selected: boolean, disabled: boolean,
            badge: string | null, stateText: string, stateOk: boolean,
            onSelect: () => void
        }): HTMLElement => {
            const row: HTMLButtonElement = (
                <button type="button" className="runtime-row" data-selected={String(options.selected)}
                        disabled={options.disabled}>
                    <span className="rt-radio"/>
                    <span className="rt-main">
                        <span className="rt-name">
                            {options.title}
                            {options.badge !== null && <em className="rt-badge">{options.badge}</em>}
                        </span>
                        <span className="rt-meta">{options.meta}</span>
                    </span>
                    <span className={`rt-state ${options.stateOk ? "ok" : "bad"}`}>{options.stateText}</span>
                </button>)
            row.onclick = () => {
                if (!options.disabled && !busy) {options.onSelect()}
            }
            return row
        }
        const renderRows = (): void => {
            Html.empty(rows)
            if (snapshot === null) {return}
            const selection = snapshot.selection
            const locked = selection.lockedByEnvironment
            const choose = (input: {mode: "auto" | "local-cli" | "api-key", runtimeId?: string | null, model?: string | null}) => {
                busy = true
                statusLine.textContent = "正在保存选择…"
                client.selectRuntime(input)
                    .then(next => {
                        snapshot = next
                        statusLine.textContent = "选择已保存，下一次弹幕创作即走新运行时"
                    })
                    .catch(error => {
                        statusLine.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`
                    })
                    .finally(() => {
                        busy = false
                        if (container.isConnected) {renderRows()}
                    })
            }
            rows.appendChild(buildRow({
                title: "自动（推荐）",
                meta: "Codex 账号 → OpenAI API → 本地回退",
                selected: selection.mode === "auto",
                disabled: locked,
                badge: null,
                stateText: "默认",
                stateOk: true,
                onSelect: () => choose({mode: "auto"})
            }))
            for (const runtime of snapshot.runtimes) {
                const selected = selection.mode === "local-cli" && selection.runtimeId === runtime.id
                const meta = runtime.available
                    ? `${runtime.version ?? "版本未知"} · ${runtime.displayPath ?? ""}`
                    : (runtime.diagnostic ?? "本机未安装")
                rows.appendChild(buildRow({
                    title: runtime.name,
                    meta,
                    selected,
                    disabled: locked || !runtime.selectable,
                    badge: selected ? "当前" : null,
                    stateText: runtime.available ? "可用" : "不可用",
                    stateOk: runtime.available,
                    onSelect: () => choose({mode: "local-cli", runtimeId: runtime.id, model: null})
                }))
                // 选中且提供多模型的运行时：行内模型下拉（Qoder 实时/回退档）
                if (selected && runtime.models.length > 1) {
                    const modelSelect: HTMLSelectElement = (<select className="rt-model"/>)
                    modelSelect.appendChild(<option value="">默认（CLI 配置）</option>)
                    for (const model of runtime.models) {
                        if (model.id === "default") {continue}
                        const option: HTMLOptionElement = (<option value={model.id}>{model.label}</option>)
                        option.selected = selection.model === model.id
                        modelSelect.appendChild(option)
                    }
                    modelSelect.onchange = () => {
                        const model = modelSelect.value
                        choose({mode: "local-cli", runtimeId: runtime.id, model: model.length === 0 ? null : model})
                    }
                    rows.appendChild((<div className="rt-model-row"><span>模型</span>{modelSelect}</div>))
                }
            }
            rows.appendChild(buildRow({
                title: "OpenAI API Key",
                meta: "使用服务器环境变量里的 OPENAI_API_KEY，严格不回退",
                selected: selection.mode === "api-key",
                disabled: locked,
                badge: null,
                stateText: "严格",
                stateOk: true,
                onSelect: () => choose({mode: "api-key"})
            }))
            if (locked) {
                statusLine.textContent = "运行时选择已被环境变量 DAWDEX_AGENT_PROVIDER 锁定（运维覆盖）"
            }
        }
        rescanBtn.onclick = () => {
            if (busy) {return}
            busy = true
            statusLine.textContent = "正在重新扫描本机 CLI…"
            client.scanRuntimes(runtime => {
                mergeRuntime(runtime)
                if (container.isConnected) {renderRows()}
            })
                .then(next => {
                    snapshot = next
                    statusLine.textContent = "扫描完成"
                })
                .catch(error => {
                    statusLine.textContent = `扫描失败：${error instanceof Error ? error.message : String(error)}`
                })
                .finally(() => {
                    busy = false
                    if (container.isConnected) {renderRows()}
                })
        }
        appendChildren(container, rows, (<div className="rt-actions">{rescanBtn}</div>), statusLine)
        client.runtimes()
            .then(next => {
                snapshot = next
                statusLine.textContent = ""
            })
            .catch(error => {
                statusLine.textContent = `无法连接 Agent Server：${error instanceof Error ? error.message : String(error)}`
            })
            .finally(() => {
                if (container.isConnected) {renderRows()}
            })
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
            // 设置 = 执行模式（本地 CLI 运行时）+ 系统功能（与顶栏同源）
            const runtimeSection: HTMLElement = (<div className="runtime-section"/>)
            renderRuntimeSettings(runtimeSection)
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
                (<div className="panel-sub">执行模式 · 本地 CLI 运行时</div>),
                runtimeSection,
                (<div className="panel-sub">系统功能</div>),
                presentBtn, workbenchBtn, replayBtn)
        } else if (kind === "role-kit") {
            // 乐器阵 = 音色计划：换音色（保结构）或重新生成（推翻重来），批准后真实改写工程
            const swapBtn: HTMLButtonElement = (<button type="button" className="panel-primary">换一把音色</button>)
            const regenBtn: HTMLButtonElement = (<button type="button" className="panel-primary">重新生成</button>)
            swapBtn.onclick = () => intervene("swap-instrument")
            regenBtn.onclick = () => intervene("regenerate")
            appendChildren(body,
                (<div className="panel-note">制作人改写这条乐器轨：换音色保留结构，重新生成推翻重来 — 批准后真实落到工程</div>),
                (<div className="panel-row">{swapBtn}{regenBtn}</div>))
        } else if (kind === "cat") {
            // 店猫 = 彩蛋：不参与创作，但见证了一切
            const patBtn: HTMLButtonElement = (<button type="button" className="panel-primary">撸一下</button>)
            patBtn.onclick = () => {
                launchDanmaku("喵 ——", "ai-fan")
                appendEvent("店猫翻了个身", "normal")
            }
            appendChildren(body,
                (<div className="panel-note">棚里的店猫在睡觉。它不参与创作，但它见证了一切。</div>),
                patBtn)
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

    // ── 工作台缩略视窗停靠层：收起态常驻右下角，不依赖 Devices 面板 ─────────
    const previewDock: HTMLElement = (
        <div className="preview-dock">
            <DawdexStagePreview lifecycle={lifecycle} service={service}/>
        </div>)

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
            {previewDock}
        </div>
    )

    root.classList.add("transport-paused")
    root.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`)

    // ── 双形态切换：产品形态 ↔ openDAW 工作台；工作台预览与完整舞台共享同一会话 ──
    const applyViewMode = (mode: DawdexViewMode) => {
        const workbench = mode === "workbench"
        root.classList.toggle("collapsed", workbench)
        collapseButton.classList.toggle("active", workbench)
        collapseButton.textContent = workbench ? "⌃ 演播厅" : "⌄ 工作台"
        collapseButton.title = workbench
            ? "回到 DAWdex 演播厅（Esc 往返）"
            : "收起演播厅，打开 openDAW 工作台（Esc 往返）"
        if (workbench && root.classList.contains("presentation")) {
            root.classList.remove("presentation")
            presentButton.classList.remove("active")
        }
        setVideoLive(isPlaying)
    }
    const setCollapsed = (force?: boolean) => uiSession.setWorkbench(force)
    lifecycle.own(uiSession.viewMode.catchupAndSubscribe(owner => applyViewMode(owner.getValue())))
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
        // 巡棚房间物件：点击开对应功能面板（§13）
        ...slotHits.map(({hit, panel}) => Events.subscribe(hit, "click", event => {
            event.stopPropagation()
            openPanel(panel)
        })),
        // 面板外点击舞台 = 关闭面板；面板内点击不冒泡
        Events.subscribe(stageEl, "click", () => {
            if (openPanelKind !== null) {closePanel()}
        }),
        Events.subscribe(panelEl, "click", event => event.stopPropagation()),
        Terminable.create(stopLoginPolling)
    )

    // 支持 ?room=<id> 深链（演示导航用）
    const initialRoom = initialSearchParams.get("room")
    if (initialRoom !== null) {
        const idx = DAWDEX_ROOMS.findIndex(r => r.id === initialRoom)
        if (idx >= 0) {setRoom(idx, false)}
    }
    // 打开/新建任何工程 ⇒ 回到完整演播厅；显式 ?workbench=1 只作用于首次工程打开。
    // Agent 在舞台内自动补建工程（isBusy）时不切形态，不打断正在观看的演出。
    // 同一订阅维护：显示器「新建工程」键只在无工程时亮起；缩略窗停靠层只在有工程时可用。
    const projectMode = new DawdexProjectModeController(uiSession, initialSearchParams.has("workbench"))
    lifecycle.own(service.projectProfileService.catchupAndSubscribe(option => {
        const hasProject = option.nonEmpty()
        newProjectButton.classList.toggle("hidden", hasProject)
        previewDock.classList.toggle("available", hasProject)
        projectMode.update(hasProject, isBusy)
    }))
    lifecycle.own(Events.subscribe(newProjectButton, "click", event => {
        event.stopPropagation()
        newProjectButton.disabled = true
        service.newProject().finally(() => newProjectButton.disabled = false)
    }))
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
    DAWDEX_ROOMS.forEach(room => preloadImage(room.bg))
    const SPRITE_SRCS = [
        "/dawdex/obj_lamp.png", "/dawdex/obj_monitor.png", "/dawdex/obj_guitar.png",
        "/dawdex/obj_art.png", "/dawdex/obj_shelf.png", "/dawdex/obj_clock.png",
        ...ROOM_OBJECTS.map(obj => `/dawdex/ro_${obj.room}_${obj.id}.png`)
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
