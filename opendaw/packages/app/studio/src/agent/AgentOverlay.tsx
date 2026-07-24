import css from "./AgentOverlay.sass?inline"
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Option, Terminable} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {AgentClient} from "./AgentClient"
import {AgentPlan, AgentProviderStatus, DawAction} from "./AgentProtocol"
import {DawProjectAdapter} from "./DawProjectAdapter"

const className = Html.adoptStyleSheet(css, "AgentOverlay")

type Construct = {
    readonly lifecycle: Lifecycle
    readonly service: StudioService
}

export const AgentOverlay = ({lifecycle, service}: Construct) => {
    const client = new AgentClient()
    const daw = new DawProjectAdapter(service)
    const content: HTMLElement = (<div className="agent-content"/>)
    const activity: HTMLElement = (<div className="activity"/>)
    const danmakuLayer: HTMLElement = (<div className="danmaku-layer"/>)
    const statusDot: HTMLElement = (<span className="status-dot checking"/>)
    const textArea: HTMLTextAreaElement = (
        <textarea maxLength={300} placeholder="例如：给我一段浪漫、温暖、适合夜晚的音乐"/>
    )
    const sendButton: HTMLButtonElement = (<button type="button" className="send">Plan edit →</button>)
    const undoButton: HTMLButtonElement = (<button type="button">Undo</button>)
    let currentPlan = Option.None as Option<AgentPlan>
    let providerStatus = Option.None as Option<AgentProviderStatus>
    let isBusy = false
    let providerBusy = false
    let danmakuLane = 0
    let loginPoll: number | null = null

    const appendEvent = (message: string, style: "normal" | "working" | "success" = "normal") => {
        const event = (
            <div className={`event ${style}`}>
                <span className="event-dot"/>
                <span>{message}</span>
            </div>
        )
        activity.prepend(event)
        while (activity.childElementCount > 8) {activity.lastElementChild?.remove()}
    }

    const launchDanmaku = (text: string) => {
        const item: HTMLElement = (<div className="danmaku">{text}</div>)
        item.style.top = `${8 + danmakuLane * 14}%`
        danmakuLane = (danmakuLane + 1) % 6
        danmakuLayer.appendChild(item)
        lifecycle.own(Events.subscribe(item, "animationend", () => item.remove()))
    }

    const renderContext = () => {
        const snapshot = daw.snapshot()
        return (
            <div className="context-card">
                <div>Tempo<strong>{Math.round(snapshot.bpm)} BPM</strong></div>
                <div>Project<strong>{snapshot.hasProject ? `${snapshot.tracks.length} instruments` : "New project"}</strong></div>
            </div>
        )
    }

    const stopLoginPolling = () => {
        if (loginPoll === null) {return}
        window.clearInterval(loginPoll)
        loginPoll = null
    }

    const refreshProviderStatus = (announce: boolean = false): Promise<AgentProviderStatus> =>
        client.providerStatus().then(status => {
            const wasConnected = providerStatus.match({
                none: () => false,
                some: previous => previous.codex.authenticated
            })
            providerStatus = Option.wrap(status)
            if (status.codex.authenticated) {stopLoginPolling()}
            if (announce && status.codex.authenticated && !wasConnected) {
                appendEvent("Codex account connected. Music planning will use your Codex allowance.", "success")
            }
            refresh()
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
        refresh()
        const authWindow = window.open("about:blank", "dawdex-codex-login")
        if (authWindow !== null) {
            authWindow.document.title = "Connect Codex"
            authWindow.document.body.textContent = "Preparing secure ChatGPT sign-in…"
        }
        client.startCodexLogin().then(result => {
            providerBusy = false
            if (result.alreadyAuthenticated) {
                authWindow?.close()
                refreshProviderStatus(true).catch(reason =>
                    appendEvent(`Provider check failed: ${String(reason)}`))
                return
            }
            if (result.authUrl === null) {throw new Error("Codex did not return a sign-in URL")}
            if (authWindow !== null) {
                authWindow.location.href = result.authUrl
            } else {
                window.open(result.authUrl, "_blank", "noopener,noreferrer")
            }
            appendEvent("Complete ChatGPT sign-in in the browser window.", "working")
            beginLoginPolling()
            refresh()
        }).catch(reason => {
            providerBusy = false
            authWindow?.close()
            appendEvent(`Codex sign-in failed: ${String(reason)}`)
            refresh()
        })
    }

    const renderProvider = () => providerStatus.match({
        none: () => {
            statusDot.className = "status-dot checking"
            return (
                <div className="provider-card checking">
                    <span className="provider-icon">C</span>
                    <div><strong>Checking Codex…</strong><span>Looking for a local account session</span></div>
                </div>
            )
        },
        some: status => {
            const {codex} = status
            if (codex.authenticated) {
                statusDot.className = "status-dot connected"
                const remaining = codex.rateLimit === null
                    ? "Usage available"
                    : `${Math.max(0, 100 - Math.round(codex.rateLimit.usedPercent))}% of current window left`
                return (
                    <div className="provider-card connected">
                        <span className="provider-icon">C</span>
                        <div>
                            <strong>Codex account connected</strong>
                            <span>{codex.planType ?? "ChatGPT"} · {remaining}</span>
                        </div>
                        <span className="provider-active">Active</span>
                    </div>
                )
            }
            if (codex.available) {
                statusDot.className = status.activeProvider === "openai"
                    ? "status-dot connected"
                    : "status-dot local"
                const connectButton: HTMLButtonElement = (
                    <button type="button" disabled={providerBusy}>
                        {providerBusy ? "Opening…" : "Connect"}
                    </button>
                )
                lifecycle.own(Events.subscribe(connectButton, "click", connectCodex))
                return (
                    <div className="provider-card">
                        <span className="provider-icon">C</span>
                        <div>
                            <strong>Connect ChatGPT to Codex</strong>
                            <span>{status.activeProvider === "openai" ? "OpenAI API is active" : "No API key required"}</span>
                        </div>
                        {connectButton}
                    </div>
                )
            }
            statusDot.className = "status-dot local"
            return (
                <div className="provider-card unavailable">
                    <span className="provider-icon">!</span>
                    <div>
                        <strong>Creative model unavailable</strong>
                        <span>{codex.error ?? "Connect Codex or configure the OpenAI API"}</span>
                    </div>
                </div>
            )
        }
    })

    const renderEmpty = () => (
        <div className="empty-state">
            <strong>Producer Agent is ready</strong>
            <span>Describe the musical result you want. DAWdex will inspect the project, propose an editable plan, and wait for approval.</span>
        </div>
    )

    const renderPlan = (plan: AgentPlan) => {
        const applyButton: HTMLButtonElement = (<button type="button" className="apply">Apply plan</button>)
        const dismissButton: HTMLButtonElement = (<button type="button">Dismiss</button>)
        const actions: HTMLElement = (<div className="actions"/>)
        plan.actions.forEach((action, index) => appendChildren(actions, (
            <div className="action">
                <span className="index">{index + 1}</span>
                <span>{DawAction.describe(action)}</span>
            </div>
        )))
        lifecycle.ownAll(
            Events.subscribe(applyButton, "click", () => {
                if (isBusy) {return}
                isBusy = true
                applyButton.disabled = true
                appendEvent("Applying the approved plan to openDAW…", "working")
                daw.apply(plan).then(result => {
                    isBusy = false
                    applyButton.disabled = false
                    if (result.success) {
                        appendEvent(result.message, "success")
                        launchDanmaku(`✓ ${plan.title}`)
                        currentPlan = Option.None
                        refresh()
                    } else {
                        appendEvent(result.message)
                    }
                }, reason => {
                    isBusy = false
                    applyButton.disabled = false
                    appendEvent(`Apply failed: ${String(reason)}`)
                })
            }),
            Events.subscribe(dismissButton, "click", () => {
                currentPlan = Option.None
                appendEvent("Plan dismissed.")
                refresh()
            })
        )
        const source = plan.source === "codex"
            ? "Codex account"
            : plan.source === "model"
                ? "OpenAI API"
                : "Legacy local plan"
        const rationale: HTMLElement = (<div className="reasoning"/>)
        appendChildren(
            rationale,
            <strong>AI creative direction</strong>,
            <span>{plan.brief.decisionSummary}</span>,
            ...plan.rationale.map(item => <span className="reason">{`• ${item}`}</span>)
        )
        return (
            <div className="plan-card">
                <div className="plan-kicker">
                    <span>{`Approval required · ${plan.brief.intent} · ${plan.brief.style}`}</span>
                    <span className="source">{source}</span>
                </div>
                <h3>{plan.title}</h3>
                <p>{plan.summary}</p>
                <p>{`${plan.brief.key} · ${plan.brief.bars} bars · ${Math.round(plan.brief.bpm)} BPM · ${plan.brief.preserveTrackIds.length} kept`}</p>
                {rationale}
                {actions}
                <div className="plan-buttons">{dismissButton}{applyButton}</div>
            </div>
        )
    }

    const refresh = () => {
        Html.empty(content)
        appendChildren(content, renderContext(), renderProvider())
        currentPlan.match({
            none: () => appendChildren(content, renderEmpty()),
            some: plan => appendChildren(content, renderPlan(plan))
        })
        appendChildren(content, activity)
    }

    const submit = () => {
        const prompt = textArea.value.trim()
        if (prompt.length === 0 || isBusy) {return}
        isBusy = true
        sendButton.disabled = true
        textArea.disabled = true
        launchDanmaku(prompt)
        appendEvent("Producer is translating your idea into a music plan…", "working")
        client.createPlan(prompt, daw.snapshot(), progress => {
            appendEvent(progress.message, "working")
        }).then(plan => {
            currentPlan = Option.wrap(plan)
            isBusy = false
            sendButton.disabled = false
            textArea.disabled = false
            textArea.value = ""
            appendEvent(`${plan.actions.length} safe actions are ready for approval.`, "success")
            refresh()
        }, reason => {
            isBusy = false
            sendButton.disabled = false
            textArea.disabled = false
            appendEvent(`Planning failed: ${String(reason)}`)
        })
    }

    lifecycle.ownAll(
        Events.subscribe(sendButton, "click", submit),
        Events.subscribe(undoButton, "click", () => {
            const result = daw.undo()
            appendEvent(result.message, result.success ? "success" : "normal")
            if (result.success) {launchDanmaku("↩ Reverted last DAWdex edit")}
            refresh()
        }),
        Events.subscribe(textArea, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
            }
        }),
        Terminable.create(stopLoginPolling)
    )
    appendEvent("DAWdex Agent initialized.", "success")
    refresh()
    refreshProviderStatus(true).catch(reason => appendEvent(`Provider check failed: ${String(reason)}`))
    return (
        <div className={className}>
            {danmakuLayer}
            <aside className="agent-shell">
                <header className="agent-header">
                    <div className="mark">D</div>
                    <div className="identity">
                        <strong>DAWdex · Producer Agent</strong>
                        <span>Plans first · edits after approval</span>
                    </div>
                    {statusDot}
                </header>
                {content}
                <div className="composer">
                    {textArea}
                    <div className="composer-row">
                        <span>Enter to plan · Shift+Enter newline</span>
                        <div className="composer-actions">{undoButton}{sendButton}</div>
                    </div>
                </div>
            </aside>
        </div>
    )
}
