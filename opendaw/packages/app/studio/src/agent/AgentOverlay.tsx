import css from "./AgentOverlay.sass?inline"
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Lifecycle, Option} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {AgentClient} from "./AgentClient"
import {AgentPlan, DawAction} from "./AgentProtocol"
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
    const textArea: HTMLTextAreaElement = (
        <textarea maxLength={300} placeholder="例如：副歌更炸一点，但不要太满，保留 Lead"/>
    )
    const sendButton: HTMLButtonElement = (<button type="button" className="send">Plan edit ↗</button>)
    const undoButton: HTMLButtonElement = (<button type="button">Undo</button>)
    let currentPlan = Option.None as Option<AgentPlan>
    let isBusy = false
    let danmakuLane = 0
    const appendEvent = (message: string, style: "normal" | "working" | "success" = "normal") => {
        const event = (
            <div className={`event ${style}`}>
                <span className="event-dot"/>
                <span>{message}</span>
            </div>
        )
        activity.prepend(event)
        while (activity.childElementCount > 5) {activity.lastElementChild?.remove()}
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
        return (
            <div className="plan-card">
                <div className="plan-kicker">
                    <span>Approval required</span>
                    <span className="source">{plan.source === "model" ? "AI model" : "Local fallback"}</span>
                </div>
                <h3>{plan.title}</h3>
                <p>{plan.summary}</p>
                {actions}
                <div className="plan-buttons">{dismissButton}{applyButton}</div>
            </div>
        )
    }
    const refresh = () => {
        Html.empty(content)
        appendChildren(content, renderContext())
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
        appendEvent("Reading the openDAW project and planning an edit…", "working")
        client.createPlan(prompt, daw.snapshot()).then(plan => {
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
            if (result.success) {launchDanmaku("↶ Reverted last DAWdex edit")}
            refresh()
        }),
        Events.subscribe(textArea, "keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
            }
        })
    )
    appendEvent("DAWdex Agent initialized.", "success")
    refresh()
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
                    <span className="status-dot"/>
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
