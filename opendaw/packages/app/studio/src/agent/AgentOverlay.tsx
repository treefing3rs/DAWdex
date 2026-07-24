import css from "./AgentOverlay.sass?inline"
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Option, Terminable} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {AgentClient} from "./AgentClient"
import {AgentPlan, AgentProviderStatus, DAWDEX_VERSION, DawAction} from "./AgentProtocol"
import {DawProjectAdapter} from "./DawProjectAdapter"
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
    {id: "drums", label: "鼓手", img: "/dawdex/drummer_V3.png"},
    {id: "bass", label: "贝斯手", img: "/dawdex/bassist_V3.png"},
    {id: "keys", label: "键盘手", img: "/dawdex/keyboardist_V3.png"}
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

export const AgentOverlay = ({lifecycle, service}: Construct) => {
    const client = new AgentClient()
    const daw = new DawProjectAdapter(service)

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
    // 屏幕内 REC 灯牌（权威播放指示，与 ON AIR 同源）
    const recBadge: HTMLElement = (<div className="rec-badge standby">STANDBY</div>)
    // 舞台背景：夜晚棚内循环视频（唯一皮肤，无昼夜切换）
    const stageVideo: HTMLVideoElement = (
        <video className="stage-bg-video" loop playsInline poster="/dawdex/studio_night.jpg" draggable={false}/>)
    stageVideo.src = "/dawdex/studio_night_loop.mp4"
    stageVideo.muted = true
    stageVideo.autoplay = true
    stageVideo.play().catch(() => {
        // 自动播放被拒时保持 poster 静帧，首次点击页面后补播
        const resume = () => stageVideo.play().catch(() => {})
        window.addEventListener("click", resume, {once: true})
    })

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
    const setRoleState = (role: RoleId, state: RoleState, reason?: string) => {
        const el = performerEls.get(role)
        if (el === undefined) {return}
        el.dataset.state = state
        el.title = reason ?? state
        if (state === "failed") {flashNoise()}
    }

    // ── 播放状态（TransportChanged.isPlaying → ON AIR 灯 + REC 灯牌） ────────
    const setPlaying = (playing: boolean) => {
        onAirLamp.classList.toggle("lit", playing)
        recBadge.classList.toggle("standby", !playing)
        recBadge.textContent = playing ? "● REC" : "STANDBY"
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

    // ── 权威时钟 + 循环进度（本地时钟，TransportChanged 校准） ────────────────
    let bpm = 128, barsPerLoop = 4, keySig = "A minor"
    let clockStopped = false
    lifecycle.own({terminate: () => {clockStopped = true}})
    const loopSeconds = () => barsPerLoop * 4 * 60 / bpm
    const clockStart = performance.now()
    const tick = () => {
        if (clockStopped) {return}
        const loopPos = ((performance.now() - clockStart) / 1000 / loopSeconds()) % 1
        const bar = Math.floor(loopPos * barsPerLoop) + 1
        transportReadout.textContent = `BAR ${bar}/${barsPerLoop} · ${Math.round(bpm)} BPM · ${keySig}`
        transportBar.style.width = `${(loopPos * 100).toFixed(1)}%`
        requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // ── 证据抽屉（回执 / 计划审批 / 活动日志） ───────────────────────────────
    const appendEvent = (message: string, style: "normal" | "working" | "success" = "normal") => {
        activity.prepend(<div className={`event ${style}`}><span className="event-dot"/><span>{message}</span></div>)
        while (activity.childElementCount > 8) {activity.lastElementChild?.remove()}
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
    const emit = (event: UiEvent) => {
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
                if (event.echo !== undefined) {launchDanmaku(event.echo, event.role)}
                appendReceipt(event.role, event.summary, event.audibleResult, event.operationRef)
                break
            case "RoleStateChanged":
                setRoleState(event.role, event.state, event.reason)
                break
            case "TransportChanged":
                bpm = event.bpm; barsPerLoop = event.barsPerLoop; keySig = event.key
                setPlaying(event.isPlaying)
                break
            case "TrackAudibleChanged":
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
    const showMarquee = (text: string) => {
        const span = marquee.querySelector(".marquee-text")
        if (span !== null) {span.textContent = `★ 已采纳：${text} ★`}
        marquee.classList.remove("hidden")
        setTimeout(() => marquee.classList.add("hidden"), 11000)
    }
    let cancelMock = playMockTimeline(emit)
    lifecycle.own({terminate: () => cancelMock()})

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
        input.value = ""
        launchDanmaku(text, "user")
        requestPlan(text)
    }
    const intervene = (kind: InterventionKind) => {
        if (kind === "undo") {
            const result = daw.undo()
            appendEvent(result.message, result.success ? "success" : "normal")
            if (result.success) {launchDanmaku("↩ 已撤销上一次 DAWdex 修改", "system")}
            return
        }
        const label = INTERVENTIONS.find(i => i.kind === kind)?.label ?? kind
        launchDanmaku(`制作人：「${label}」收到，下一循环生效`, "producer")
        appendEvent(`用户干预：${label}`, "working")
    }

    // ── plan/apply 链路（v0.2.0 真实链路，收入证据抽屉） ─────────────────────
    let currentPlan = Option.None as Option<AgentPlan>
    let isBusy = false
    const requestPlan = (prompt: string) => {
        if (isBusy) {return}
        isBusy = true
        appendEvent("制作人正在把你的想法翻译成音乐计划…", "working")
        client.createPlan(prompt, daw.snapshot(), progress => {
            appendEvent(progress.message, "working")
        }).then(plan => {
            isBusy = false
            currentPlan = Option.wrap(plan)
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
                daw.apply(plan).then(result => {
                    isBusy = false
                    applyButton.disabled = false
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
                    appendEvent(`执行失败：${String(reason)}`)
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

    // ── 根节点（投屏演示模式作用于此） ───────────────────────────────────────
    const root: HTMLElement = (
        <div className={className}>
            <div className="shell-header">
                <span className="brand">{`DAWDEX v${DAWDEX_VERSION}`}</span>
                {onAirLamp}
                {statusDot}
                <span className="header-spacer"/>
                {presentButton}
                {replayButton}
            </div>
            <div className="stage-bezel">
                <div className="stage">
                    {stageVideo}
                    {marquee}
                    <div className="performers">{performers}</div>
                    {noise}
                    {danmakuLayer}
                    {recBadge}
                    <div className="transport">
                        {transportReadout}
                        <div className="loop-bar">{transportBar}</div>
                    </div>
                </div>
            </div>
            <div className="composer">
                {input}
                {sendButton}
            </div>
            <div className="interventions">{interventionButtons}</div>
            <details className="drawer">
                <summary>乐队会议 · 工作回执 · 证据</summary>
                {providerSlot}
                {receiptList}
                {planSlot}
                {activity}
            </details>
        </div>
    )

    lifecycle.ownAll(
        Events.subscribe(sendButton, "click", submitDanmaku),
        Events.subscribe(input, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter") {event.preventDefault(); submitDanmaku()}
        }),
        Events.subscribe(presentButton, "click", () => {
            const on = root.classList.toggle("presentation")
            presentButton.classList.toggle("active", on)
        }),
        Events.subscribe(replayButton, "click", () => {
            cancelMock()
            danmakuText.clear()
            Html.empty(receiptList)
            STAGE_ROLES.forEach(({id}) => setRoleState(id, "waiting"))
            cancelMock = playMockTimeline(emit)
        }),
        Terminable.create(stopLoginPolling)
    )

    renderProviderSlot()
    refreshProviderStatus(true).catch(reason => appendEvent(`模型状态检查失败：${String(reason)}`))
    appendEvent("DAWdex 舞台就绪（Mock 驱动）", "success")
    return root
}
