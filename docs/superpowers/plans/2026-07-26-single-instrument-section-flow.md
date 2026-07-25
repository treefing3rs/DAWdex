# Single-Instrument Section Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-only DAWdex flow where the keyboard sub-screen selects Drums, Bass, or Keys and advances one fixed single-track journey through Intro, Verse, Chorus, and Bridge.

**Architecture:** Keep the fixed journey in a pure `SingleInstrumentFlow` state machine and derive all visible copy/actions from a pure view-model module. Mount one DOM view into the existing keyboard sub-screen, use callbacks to synchronize the existing room/video/performer surface, and leave `AgentClient`, MIDI retrieval, `DawProjectAdapter`, and openDAW execution untouched.

**Tech Stack:** TypeScript, openDAW JSX DOM helpers, Sass, Vitest in Node mode, Vite, static authorized MIDI assets.

---

## File Map

- Create `opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.ts`
  - Pure state machine, fixed section order, instrument-to-room mapping, navigation helper.
- Create `opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.test.ts`
  - State-transition, reset, navigation, and copy-boundary tests.
- Create `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.ts`
  - Pure screen/key view model; no DOM and no timers.
- Create `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts`
  - Exact screen copy, icon, progress, and key-label tests.
- Create `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.tsx`
  - DOM renderer, deterministic Mock timers, prompt draft, download, keyboard access.
- Modify `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx`
  - Replace the initial deck content and legacy keyboard action row with the new flow mount; synchronize room and stage playback.
- Modify `opendaw/packages/app/studio/src/agent/AgentOverlay.sass`
  - Pixel screen, instrument selector, section progress, prompt, confirmation, completion, and physical-key states.
- Create `opendaw/packages/app/studio/public/dawdex/demo/drums-single-track.mid`
- Create `opendaw/packages/app/studio/public/dawdex/demo/bass-single-track.mid`
- Create `opendaw/packages/app/studio/public/dawdex/demo/keys-single-track.mid`
- Create `opendaw/packages/app/studio/public/dawdex/demo/provenance.json`
  - Exact source paths and SHA-256 values for the three copied authorized MIDI files.

## Scope Guard

These files must remain unchanged:

```text
opendaw/packages/app/studio/src/agent/AgentClient.ts
opendaw/packages/app/studio/src/agent/AgentProtocol.ts
opendaw/packages/app/studio/src/agent/DawProjectAdapter.ts
opendaw/packages/app/studio/src/agent/RealUiEventBridge.ts
opendaw/packages/server/dawdex-agent/
```

After every task, confirm:

```bash
git diff --name-only origin/main...HEAD
```

Expected: only the files listed in the File Map.

---

### Task 1: Implement the fixed pure state machine

**Files:**
- Create: `opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.test.ts`
- Create: `opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.ts`

- [ ] **Step 1: Write the failing state-machine tests**

Create `SingleInstrumentFlow.test.ts`:

```ts
import {describe, expect, it} from "vitest"
import {
    completionTarget,
    defaultSingleInstrumentDemoConfig,
    instrumentRoom,
    SingleInstrumentFlow
} from "./SingleInstrumentFlow"

describe("SingleInstrumentFlow", () => {
    it("maps each fixed instrument to its existing room", () => {
        expect(instrumentRoom("drums")).toBe("drums")
        expect(instrumentRoom("bass")).toBe("strings")
        expect(instrumentRoom("keys")).toBe("keys")
    })

    it("advances only through Intro, Verse, Chorus, and Bridge", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("bass")
        expect(flow.state).toEqual({kind: "entering", instrument: "bass"})

        flow.finishEntering()
        expect(flow.state).toMatchObject({kind: "generating", section: "intro"})

        flow.finishGenerating()
        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "intro",
            completed: ["intro"],
            nextPrompt: "继续为 BASS 生成 VERSE"
        })

        flow.continue()
        flow.finishGenerating()
        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "verse",
            completed: ["intro", "verse"],
            nextPrompt: "继续为 BASS 生成 CHORUS"
        })

        flow.continue()
        flow.finishGenerating()
        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "chorus",
            completed: ["intro", "verse", "chorus"],
            nextPrompt: "继续为 BASS 生成 BRIDGE"
        })

        flow.continue()
        flow.finishGenerating()
        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "bridge",
            completed: ["intro", "verse", "chorus", "bridge"],
            nextPrompt: null
        })

        flow.continue()
        expect(flow.state).toEqual({
            kind: "complete",
            instrument: "bass",
            completed: ["intro", "verse", "chorus", "bridge"]
        })
    })

    it("does not duplicate a completed section when regenerating", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("drums")
        flow.finishEntering()
        flow.finishGenerating()
        flow.regenerate()
        flow.finishGenerating()

        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "intro",
            completed: ["intro"]
        })
    })

    it("pauses, resumes, and replays without changing section order", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("keys")
        flow.finishEntering()
        flow.finishGenerating()

        flow.togglePause()
        expect(flow.state).toMatchObject({kind: "playing", paused: true})
        flow.togglePause()
        expect(flow.state).toMatchObject({kind: "playing", paused: false})
        flow.replay()
        expect(flow.state).toMatchObject({
            kind: "playing",
            section: "intro",
            completed: ["intro"],
            playbackRevision: 1
        })
    })

    it("restores the prior playing state when instrument change is cancelled", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("keys")
        flow.finishEntering()
        flow.finishGenerating()
        const prior = flow.state

        flow.requestInstrumentChange()
        expect(flow.state.kind).toBe("confirm-swap")
        flow.cancelInstrumentChange()
        expect(flow.state).toEqual(prior)
    })

    it("clears all progress and returns to selection when instrument change is confirmed", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("drums")
        flow.finishEntering()
        flow.finishGenerating()
        flow.requestInstrumentChange()
        flow.confirmInstrumentChange()

        expect(flow.state).toEqual({kind: "selecting"})
    })

    it("restores only a completed instrument from the local completion query", () => {
        const flow = SingleInstrumentFlow.fromCompleted("keys")
        expect(flow.state).toEqual({
            kind: "complete",
            instrument: "keys",
            completed: ["intro", "verse", "chorus", "bridge"]
        })
    })

    it("resolves remote and local completion targets without backend state", () => {
        expect(completionTarget(
            "http://localhost:7100/create?mock=1",
            {...defaultSingleInstrumentDemoConfig, remoteCompletionUrl: "https://example.com/next"},
            "drums"
        )).toBe("https://example.com/next")

        expect(completionTarget(
            "http://localhost:7100/create?mock=1",
            defaultSingleInstrumentDemoConfig,
            "bass"
        )).toBe("http://localhost:7100/create?mock=1&dawdex-complete=1&instrument=bass")
    })

    it("rejects transitions that would skip a fixed stage", () => {
        const flow = new SingleInstrumentFlow()
        expect(() => flow.finishGenerating()).toThrow("Expected generating")
        flow.select("bass")
        expect(() => flow.continue()).toThrow("Expected playing")
    })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd opendaw
npx vitest run packages/app/studio/src/agent/SingleInstrumentFlow.test.ts \
  --config packages/app/studio/vitest.config.ts
```

Expected: FAIL because `./SingleInstrumentFlow` does not exist.

- [ ] **Step 3: Implement the minimal state machine**

Create `SingleInstrumentFlow.ts`:

```ts
import type {DawdexRoomId} from "./DawdexStageAssets"

export const INSTRUMENTS = ["drums", "bass", "keys"] as const
export type InstrumentId = typeof INSTRUMENTS[number]

export const SECTION_ORDER = ["intro", "verse", "chorus", "bridge"] as const
export type SongSection = typeof SECTION_ORDER[number]

export type GeneratingState = {
    readonly kind: "generating"
    readonly instrument: InstrumentId
    readonly section: SongSection
    readonly completed: ReadonlyArray<SongSection>
}

export type PlayingState = {
    readonly kind: "playing"
    readonly instrument: InstrumentId
    readonly section: SongSection
    readonly completed: ReadonlyArray<SongSection>
    readonly paused: boolean
    readonly nextPrompt: string | null
    readonly playbackRevision: number
}

export type SingleInstrumentFlowState =
    | {readonly kind: "selecting"}
    | {readonly kind: "entering", readonly instrument: InstrumentId}
    | GeneratingState
    | PlayingState
    | {readonly kind: "confirm-swap", readonly previous: PlayingState}
    | {
        readonly kind: "complete"
        readonly instrument: InstrumentId
        readonly completed: typeof SECTION_ORDER
    }

export type SingleInstrumentDemoConfig = {
    readonly remoteCompletionUrl: string | null
    readonly previewAudioUrls: Partial<Record<InstrumentId, string>>
    readonly downloadUrls: Readonly<Record<InstrumentId, string>>
}

export const defaultSingleInstrumentDemoConfig: SingleInstrumentDemoConfig = {
    remoteCompletionUrl: null,
    previewAudioUrls: {},
    downloadUrls: {
        drums: "/dawdex/demo/drums-single-track.mid",
        bass: "/dawdex/demo/bass-single-track.mid",
        keys: "/dawdex/demo/keys-single-track.mid"
    }
}

const ROOM_BY_INSTRUMENT: Readonly<Record<InstrumentId, DawdexRoomId>> = {
    drums: "drums",
    bass: "strings",
    keys: "keys"
}

const label = (value: InstrumentId | SongSection): string => value.toUpperCase()

const nextSection = (section: SongSection): SongSection | null => {
    const index = SECTION_ORDER.indexOf(section)
    return SECTION_ORDER[index + 1] ?? null
}

const nextPrompt = (instrument: InstrumentId, section: SongSection): string | null => {
    const next = nextSection(section)
    return next === null ? null : `继续为 ${label(instrument)} 生成 ${label(next)}`
}

const expectKind = <Kind extends SingleInstrumentFlowState["kind"]>(
    state: SingleInstrumentFlowState,
    kind: Kind
): Extract<SingleInstrumentFlowState, {kind: Kind}> => {
    if (state.kind !== kind) {throw new Error(`Expected ${kind}, received ${state.kind}`)}
    return state as Extract<SingleInstrumentFlowState, {kind: Kind}>
}

export const instrumentRoom = (instrument: InstrumentId): DawdexRoomId =>
    ROOM_BY_INSTRUMENT[instrument]

export const completionTarget = (
    currentHref: string,
    config: SingleInstrumentDemoConfig,
    instrument: InstrumentId
): string => {
    if (config.remoteCompletionUrl !== null) {return config.remoteCompletionUrl}
    const url = new URL(currentHref)
    url.searchParams.set("dawdex-complete", "1")
    url.searchParams.set("instrument", instrument)
    return url.toString()
}

export class SingleInstrumentFlow {
    #state: SingleInstrumentFlowState

    constructor(initial: SingleInstrumentFlowState = {kind: "selecting"}) {
        this.#state = initial
    }

    static fromCompleted(instrument: InstrumentId): SingleInstrumentFlow {
        return new SingleInstrumentFlow({kind: "complete", instrument, completed: SECTION_ORDER})
    }

    get state(): SingleInstrumentFlowState {
        return this.#state
    }

    select(instrument: InstrumentId): void {
        expectKind(this.#state, "selecting")
        this.#state = {kind: "entering", instrument}
    }

    finishEntering(): void {
        const state = expectKind(this.#state, "entering")
        this.#state = {kind: "generating", instrument: state.instrument, section: "intro", completed: []}
    }

    finishGenerating(): void {
        const state = expectKind(this.#state, "generating")
        const completed = SECTION_ORDER.filter(section =>
            state.completed.includes(section) || section === state.section)
        this.#state = {
            kind: "playing",
            instrument: state.instrument,
            section: state.section,
            completed,
            paused: false,
            nextPrompt: nextPrompt(state.instrument, state.section),
            playbackRevision: 0
        }
    }

    continue(): void {
        const state = expectKind(this.#state, "playing")
        const next = nextSection(state.section)
        this.#state = next === null
            ? {kind: "complete", instrument: state.instrument, completed: SECTION_ORDER}
            : {kind: "generating", instrument: state.instrument, section: next, completed: state.completed}
    }

    togglePause(): void {
        const state = expectKind(this.#state, "playing")
        this.#state = {...state, paused: !state.paused}
    }

    replay(): void {
        const state = expectKind(this.#state, "playing")
        this.#state = {...state, paused: false, playbackRevision: state.playbackRevision + 1}
    }

    regenerate(): void {
        const state = expectKind(this.#state, "playing")
        this.#state = {
            kind: "generating",
            instrument: state.instrument,
            section: state.section,
            completed: state.completed
        }
    }

    requestInstrumentChange(): void {
        this.#state = {kind: "confirm-swap", previous: expectKind(this.#state, "playing")}
    }

    cancelInstrumentChange(): void {
        this.#state = expectKind(this.#state, "confirm-swap").previous
    }

    confirmInstrumentChange(): void {
        expectKind(this.#state, "confirm-swap")
        this.#state = {kind: "selecting"}
    }
}
```

- [ ] **Step 4: Run the targeted test**

Run the Step 2 command.

Expected: 1 test file passed, 9 tests passed.

- [ ] **Step 5: Run the existing Studio tests**

```bash
cd opendaw
npm run test -w @opendaw/app-studio
```

Expected: 13 test files passed, 56 tests passed.

- [ ] **Step 6: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.ts \
  opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.test.ts
git commit -m "feat(stage): add single instrument flow state machine"
```

---

### Task 2: Derive all sub-screen content and keyboard actions

**Files:**
- Create: `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts`
- Create: `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.ts`

- [ ] **Step 1: Write the failing view-model tests**

Create `SingleInstrumentFlowView.test.ts`:

```ts
import {describe, expect, it} from "vitest"
import {SingleInstrumentFlow} from "./SingleInstrumentFlow"
import {flowView} from "./SingleInstrumentFlowView"

describe("SingleInstrumentFlowView", () => {
    it("starts with three clickable instrument choices and only system keys", () => {
        const model = flowView(new SingleInstrumentFlow().state)
        expect(model.kind).toBe("selecting")
        expect(model.instruments).toEqual([
            {id: "drums", label: "DRUMS", icon: "/dawdex/ro_drums_kit.png"},
            {id: "bass", label: "BASS", icon: "/dawdex/ro_strings_guitars.png"},
            {id: "keys", label: "KEYS", icon: "/dawdex/ro_keys_rhodes.png"}
        ])
        expect(model.primaryActions).toEqual([])
        expect(model.systemActions.map(action => action.label)).toEqual(["工作台", "设置"])
    })

    it("shows fixed progress and the Enter continue key while playing Intro", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("bass")
        flow.finishEntering()
        flow.finishGenerating()

        const model = flowView(flow.state)
        expect(model.title).toBe("BASS / INTRO")
        expect(model.status).toBe("● PLAYING")
        expect(model.sections).toEqual([
            {id: "intro", label: "INTRO", status: "current"},
            {id: "verse", label: "VERSE", status: "pending"},
            {id: "chorus", label: "CHORUS", status: "pending"},
            {id: "bridge", label: "BRIDGE", status: "pending"}
        ])
        expect(model.nextPrompt).toBe("继续为 BASS 生成 VERSE")
        expect(model.primaryActions.map(action => action.label)).toEqual([
            "播放/暂停", "重播", "重新生成", "换乐器", "↵ 继续"
        ])
        expect(model.primaryActions.at(-1)).toMatchObject({id: "continue", enter: true})
    })

    it("changes the Enter key to Finish for Bridge", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("keys")
        flow.finishEntering()
        for (let index = 0; index < 4; index++) {
            flow.finishGenerating()
            if (index < 3) {flow.continue()}
        }

        const model = flowView(flow.state)
        expect(model.primaryActions.map(action => action.label)).toEqual([
            "播放/暂停", "从头播放", "重新生成本段", "换乐器", "↵ 完成"
        ])
        expect(model.nextPrompt).toBeNull()
    })

    it("renders the destructive instrument-change confirmation", () => {
        const flow = new SingleInstrumentFlow()
        flow.select("drums")
        flow.finishEntering()
        flow.finishGenerating()
        flow.requestInstrumentChange()

        const model = flowView(flow.state)
        expect(model).toMatchObject({
            kind: "confirm-swap",
            title: "CHANGE INSTRUMENT?",
            message: "当前四段进度将被清空"
        })
        expect(model.primaryActions.map(action => action.label)).toEqual(["返回", "重新选择"])
    })

    it("renders one-track completion and the local handoff variant", () => {
        const flow = SingleInstrumentFlow.fromCompleted("bass")
        const complete = flowView(flow.state)
        expect(complete.title).toBe("BASS TRACK COMPLETE")
        expect(complete.message).toBe("01 TRACK · 04 / 04 SECTIONS")
        expect(complete.primaryActions.map(action => action.label)).toEqual([
            "从头播放", "下载 MIDI", "换乐器", "↵ 前往下一页"
        ])

        const handoff = flowView(flow.state, true)
        expect(handoff.title).toBe("BASS MIDI READY")
        expect(handoff.message).toBe("下载文件，或返回录音棚重新选择乐器")
    })

    it("never emits the retired intervention copy", () => {
        const views = []
        for (const instrument of ["drums", "bass", "keys"] as const) {
            const flow = new SingleInstrumentFlow()
            views.push(flowView(flow.state))
            flow.select(instrument)
            views.push(flowView(flow.state))
            flow.finishEntering()
            views.push(flowView(flow.state))
            flow.finishGenerating()
            views.push(flowView(flow.state))
            flow.requestInstrumentChange()
            views.push(flowView(flow.state))
        }
        const text = JSON.stringify(views)
        expect(text).not.toContain("接受")
        expect(text).not.toContain("保留")
        expect(text).not.toContain("更有力量")
        expect(text).not.toContain("更轻松")
        expect(text).not.toContain("撤销")
    })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd opendaw
npx vitest run packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts \
  --config packages/app/studio/vitest.config.ts
```

Expected: FAIL because `./SingleInstrumentFlowView` does not exist.

- [ ] **Step 3: Implement the view model**

Create `SingleInstrumentFlowView.ts`:

```ts
import {
    INSTRUMENTS,
    SECTION_ORDER,
    type InstrumentId,
    type SingleInstrumentFlowState,
    type SongSection
} from "./SingleInstrumentFlow"

export type FlowActionId =
    | "play-pause" | "replay" | "regenerate" | "swap"
    | "continue" | "finish" | "cancel-swap" | "confirm-swap"
    | "download" | "next" | "workbench" | "settings"

export type FlowActionModel = {
    readonly id: FlowActionId
    readonly label: string
    readonly enter?: boolean
}

export type FlowSectionModel = {
    readonly id: SongSection
    readonly label: string
    readonly status: "complete" | "current" | "pending"
}

export type FlowViewModel = {
    readonly kind: SingleInstrumentFlowState["kind"] | "handoff"
    readonly title: string
    readonly status: string
    readonly message: string
    readonly instruments: ReadonlyArray<{id: InstrumentId, label: string, icon: string}>
    readonly sections: ReadonlyArray<FlowSectionModel>
    readonly nextPrompt: string | null
    readonly primaryActions: ReadonlyArray<FlowActionModel>
    readonly systemActions: ReadonlyArray<FlowActionModel>
}

const SYSTEM_ACTIONS: ReadonlyArray<FlowActionModel> = [
    {id: "workbench", label: "工作台"},
    {id: "settings", label: "设置"}
]

const INSTRUMENT_ICONS: Readonly<Record<InstrumentId, string>> = {
    drums: "/dawdex/ro_drums_kit.png",
    bass: "/dawdex/ro_strings_guitars.png",
    keys: "/dawdex/ro_keys_rhodes.png"
}

const sectionRows = (
    completed: ReadonlyArray<SongSection>,
    current: SongSection | null
): ReadonlyArray<FlowSectionModel> => SECTION_ORDER.map(section => ({
    id: section,
    label: section.toUpperCase(),
    status: section === current ? "current" : completed.includes(section) ? "complete" : "pending"
}))

const base = (kind: FlowViewModel["kind"]): FlowViewModel => ({
    kind,
    title: "",
    status: "",
    message: "",
    instruments: [],
    sections: [],
    nextPrompt: null,
    primaryActions: [],
    systemActions: SYSTEM_ACTIONS
})

export const flowView = (
    state: SingleInstrumentFlowState,
    handoffPage: boolean = false
): FlowViewModel => {
    if (state.kind === "selecting") {
        return {
            ...base("selecting"),
            title: "SELECT INSTRUMENT",
            instruments: INSTRUMENTS.map(id => ({
                id,
                label: id.toUpperCase(),
                icon: INSTRUMENT_ICONS[id]
            }))
        }
    }
    if (state.kind === "entering") {
        return {
            ...base("entering"),
            title: `ENTERING ${state.instrument.toUpperCase()} ROOM…`,
            message: "PLEASE WAIT"
        }
    }
    if (state.kind === "generating") {
        return {
            ...base("generating"),
            title: `${state.instrument.toUpperCase()} / GENERATING ${state.section.toUpperCase()}`,
            status: "WORKING",
            sections: sectionRows(state.completed, state.section)
        }
    }
    if (state.kind === "playing") {
        const bridge = state.section === "bridge"
        return {
            ...base("playing"),
            title: `${state.instrument.toUpperCase()} / ${state.section.toUpperCase()}`,
            status: state.paused ? "Ⅱ PAUSED" : "● PLAYING",
            sections: sectionRows(state.completed, state.section),
            nextPrompt: state.nextPrompt,
            primaryActions: [
                {id: "play-pause", label: "播放/暂停"},
                {id: "replay", label: bridge ? "从头播放" : "重播"},
                {id: "regenerate", label: bridge ? "重新生成本段" : "重新生成"},
                {id: "swap", label: "换乐器"},
                {id: bridge ? "finish" : "continue", label: bridge ? "↵ 完成" : "↵ 继续", enter: true}
            ]
        }
    }
    if (state.kind === "confirm-swap") {
        return {
            ...base("confirm-swap"),
            title: "CHANGE INSTRUMENT?",
            message: "当前四段进度将被清空",
            primaryActions: [
                {id: "cancel-swap", label: "返回"},
                {id: "confirm-swap", label: "重新选择", enter: true}
            ]
        }
    }
    if (handoffPage) {
        return {
            ...base("handoff"),
            title: `${state.instrument.toUpperCase()} MIDI READY`,
            message: "下载文件，或返回录音棚重新选择乐器",
            sections: sectionRows(state.completed, null),
            primaryActions: [
                {id: "download", label: "下载 MIDI"},
                {id: "swap", label: "换乐器"}
            ]
        }
    }
    return {
        ...base("complete"),
        title: `${state.instrument.toUpperCase()} TRACK COMPLETE`,
        message: "01 TRACK · 04 / 04 SECTIONS",
        sections: sectionRows(state.completed, null),
        primaryActions: [
            {id: "replay", label: "从头播放"},
            {id: "download", label: "下载 MIDI"},
            {id: "swap", label: "换乐器"},
            {id: "next", label: "↵ 前往下一页", enter: true}
        ]
    }
}
```

- [ ] **Step 4: Run both new test files**

```bash
cd opendaw
npx vitest run \
  packages/app/studio/src/agent/SingleInstrumentFlow.test.ts \
  packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts \
  --config packages/app/studio/vitest.config.ts
```

Expected: 2 test files passed, 15 tests passed.

- [ ] **Step 5: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.ts \
  opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts
git commit -m "feat(stage): define single track screen and key states"
```

---

### Task 3: Add provenance-preserving static MIDI downloads

**Files:**
- Create: `opendaw/packages/app/studio/public/dawdex/demo/drums-single-track.mid`
- Create: `opendaw/packages/app/studio/public/dawdex/demo/bass-single-track.mid`
- Create: `opendaw/packages/app/studio/public/dawdex/demo/keys-single-track.mid`
- Create: `opendaw/packages/app/studio/public/dawdex/demo/provenance.json`

- [ ] **Step 1: Copy exact authorized source assets**

Run:

```bash
mkdir -p opendaw/packages/app/studio/public/dawdex/demo
cp "/Users/javeyli/Documents/DAWdex/midi/easy/drums/MIDI/1925@EZX_DARK_MATTER/120-S015@BRIDGE/Variation_01.mid" \
  opendaw/packages/app/studio/public/dawdex/demo/drums-single-track.mid
cp "/Users/javeyli/Documents/DAWdex/midi/easy/bass/MIDI/000646@EBX_Progressive_Metal/411@Straight_7#8/089-S012@Verse/Variation_01.mid" \
  opendaw/packages/app/studio/public/dawdex/demo/bass-single-track.mid
cp "/Users/javeyli/Documents/DAWdex/midi/easy/keys/MIDI/000970@Piano-Loops/000915@RnB_Piano_Ballads_Vol_1/027@Song5_C_66bpm_Prog_3/Prog3_Song5_PreCh.mid" \
  opendaw/packages/app/studio/public/dawdex/demo/keys-single-track.mid
```

These are copied assets, not synthesized replacement note patterns.

- [ ] **Step 2: Add the exact provenance record**

Create `provenance.json`:

```json
{
  "purpose": "Frontend-only static download affordance for the single-instrument section-flow demo",
  "generated": false,
  "assets": {
    "drums": {
      "source": "midi/easy/drums/MIDI/1925@EZX_DARK_MATTER/120-S015@BRIDGE/Variation_01.mid",
      "sha256": "cbfc6e931fa5413ff9ee8f920d621b7fe4536ca80d315892141b1197935094f3",
      "bytes": 684
    },
    "bass": {
      "source": "midi/easy/bass/MIDI/000646@EBX_Progressive_Metal/411@Straight_7#8/089-S012@Verse/Variation_01.mid",
      "sha256": "e381ce9baf43b1a31ba219bf0e75dfd13fd7af6c5c0b976f4dac9cb524c4b3b9",
      "bytes": 1961
    },
    "keys": {
      "source": "midi/easy/keys/MIDI/000970@Piano-Loops/000915@RnB_Piano_Ballads_Vol_1/027@Song5_C_66bpm_Prog_3/Prog3_Song5_PreCh.mid",
      "sha256": "2b536f64c7bf625d5e094f5d7b3cebaa671863b4edb31c71a6f27d3e32226c42",
      "bytes": 299
    }
  }
}
```

- [ ] **Step 3: Verify the landed files against the source**

Run:

```bash
shasum -a 256 opendaw/packages/app/studio/public/dawdex/demo/*.mid
```

Expected:

```text
e381ce9baf43b1a31ba219bf0e75dfd13fd7af6c5c0b976f4dac9cb524c4b3b9  .../bass-single-track.mid
cbfc6e931fa5413ff9ee8f920d621b7fe4536ca80d315892141b1197935094f3  .../drums-single-track.mid
2b536f64c7bf625d5e094f5d7b3cebaa671863b4edb31c71a6f27d3e32226c42  .../keys-single-track.mid
```

- [ ] **Step 4: Commit**

```bash
git add opendaw/packages/app/studio/public/dawdex/demo
git commit -m "assets(stage): add sourced single track demo downloads"
```

---

### Task 4: Mount the frontend-only sub-screen controller

**Files:**
- Create: `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.tsx`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx:1-24`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx:282-380`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx:872-901`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx:1234-1400`

- [ ] **Step 1: Create the DOM view contract**

Create `SingleInstrumentFlowView.tsx` with these public types and mount signature:

```tsx
import {appendChildren, createElement} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {Lifecycle, Terminable} from "@opendaw/lib-std"
import {
    completionTarget,
    defaultSingleInstrumentDemoConfig,
    instrumentRoom,
    SingleInstrumentFlow,
    type InstrumentId,
    type SingleInstrumentFlowState
} from "./SingleInstrumentFlow"
import {flowView, type FlowActionId, type FlowViewModel} from "./SingleInstrumentFlowView"

type MountSingleInstrumentFlow = {
    readonly lifecycle: Lifecycle
    readonly screen: HTMLElement
    readonly keys: HTMLElement
    readonly initialCompletedInstrument: InstrumentId | null
    readonly handoffPage: boolean
    readonly onRoomChanged: (room: ReturnType<typeof instrumentRoom>) => void
    readonly onPlayingChanged: (playing: boolean, instrument: InstrumentId | null) => void
    readonly onOpenWorkbench: () => void
    readonly onOpenSettings: () => void
}

export type MountedSingleInstrumentFlow = {
    readonly state: () => SingleInstrumentFlowState
    readonly render: () => void
}

const ENTERING_MS = 650
const GENERATING_MS = 1400
const COMPLETE_REPLAY_MS = 4000

const createFlow = (instrument: InstrumentId | null): SingleInstrumentFlow =>
    instrument === null ? new SingleInstrumentFlow() : SingleInstrumentFlow.fromCompleted(instrument)

export const mountSingleInstrumentFlow = ({
    lifecycle,
    screen,
    keys,
    initialCompletedInstrument,
    handoffPage,
    onRoomChanged,
    onPlayingChanged,
    onOpenWorkbench,
    onOpenSettings
}: MountSingleInstrumentFlow): MountedSingleInstrumentFlow => {
    const flow = createFlow(initialCompletedInstrument)
    let timer: number | null = null
    let promptDraft = ""
    let audio: HTMLAudioElement | null = null

    const clearTimer = () => {
        if (timer === null) {return}
        window.clearTimeout(timer)
        timer = null
    }

    const stopAudio = () => {
        audio?.pause()
        audio = null
    }

    const setTimer = (delay: number, action: () => void) => {
        clearTimer()
        timer = window.setTimeout(() => {
            timer = null
            action()
        }, delay)
    }

    const syncPlayback = () => {
        const state = flow.state
        const playing = state.kind === "playing" && !state.paused
        const instrument = state.kind === "selecting" || state.kind === "confirm-swap"
            ? null
            : state.instrument
        onPlayingChanged(playing, instrument)

        delete screen.dataset.previewUnavailable
        stopAudio()
        if (!playing) {return}
        const source = defaultSingleInstrumentDemoConfig.previewAudioUrls[instrument as InstrumentId]
        if (source === undefined) {return}
        audio = new Audio(source)
        audio.play().catch(() => {
            audio = null
            screen.dataset.previewUnavailable = "true"
        })
    }

    const scheduleAutomaticTransition = () => {
        if (flow.state.kind === "entering") {
            setTimer(ENTERING_MS, () => {
                flow.finishEntering()
                render()
            })
        } else if (flow.state.kind === "generating") {
            setTimer(GENERATING_MS, () => {
                flow.finishGenerating()
                render()
            })
        }
    }

    const renderSections = (model: FlowViewModel): HTMLElement => (
        <div className="flow-sections">
            {model.sections.map((section, index) => (
                <div className="flow-section" data-status={section.status}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{section.label}</strong>
                    <i><b/></i>
                </div>
            ))}
        </div>
    )

    const renderScreen = (model: FlowViewModel) => {
        Html.empty(screen)
        screen.dataset.state = model.kind
        const body: HTMLElement = (<div className="single-instrument-screen"/>)
        appendChildren(body, (
            <div className="flow-screen-head">
                <strong>{model.title}</strong>
                {model.status.length > 0 && <span>{model.status}</span>}
            </div>))

        if (model.instruments.length > 0) {
            appendChildren(body, (
                <div className="flow-instruments">
                    {model.instruments.map(instrument => {
                        const button: HTMLButtonElement = (
                            <button type="button" aria-label={`选择 ${instrument.label}`}
                                    data-instrument={instrument.id}>
                                <img src={instrument.icon} alt="" draggable={false}/>
                                <span>{instrument.label}</span>
                            </button>)
                        button.onclick = () => {
                            flow.select(instrument.id)
                            onRoomChanged(instrumentRoom(instrument.id))
                            render()
                        }
                        return button
                    })}
                </div>))
        }

        if (model.sections.length > 0) {appendChildren(body, renderSections(model))}
        if (model.message.length > 0) {appendChildren(body, <p className="flow-message">{model.message}</p>)}

        if (model.nextPrompt !== null) {
            promptDraft = promptDraft.length === 0 ? model.nextPrompt : promptDraft
            const input: HTMLInputElement = (
                <input className="flow-next-prompt" aria-label="下一段指令" value={promptDraft}/>)
            input.oninput = () => {promptDraft = input.value}
            appendChildren(body, <label className="flow-next"><span>NEXT</span>{input}</label>)
        } else {
            promptDraft = ""
        }

        appendChildren(screen, body)
    }

    const download = (instrument: InstrumentId) => {
        const anchor = document.createElement("a")
        anchor.href = defaultSingleInstrumentDemoConfig.downloadUrls[instrument]
        anchor.download = `dawdex-${instrument}-single-track.mid`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
    }

    const invokeAction = (action: FlowActionId) => {
        const before = flow.state
        if (action === "play-pause") {flow.togglePause()}
        else if (action === "replay") {
            if (before.kind === "complete") {
                onPlayingChanged(true, before.instrument)
                setTimer(COMPLETE_REPLAY_MS, () => onPlayingChanged(false, before.instrument))
                return
            } else {flow.replay()}
        } else if (action === "regenerate") {flow.regenerate()}
        else if (action === "swap") {
            if (before.kind === "complete") {
                window.location.assign(window.location.pathname)
                return
            }
            flow.requestInstrumentChange()
        } else if (action === "continue" || action === "finish") {flow.continue()}
        else if (action === "cancel-swap") {flow.cancelInstrumentChange()}
        else if (action === "confirm-swap") {
            flow.confirmInstrumentChange()
            onRoomChanged("main")
        } else if (action === "download" && before.kind === "complete") {download(before.instrument)}
        else if (action === "next" && before.kind === "complete") {
            window.location.assign(completionTarget(
                window.location.href,
                defaultSingleInstrumentDemoConfig,
                before.instrument
            ))
            return
        } else if (action === "workbench") {onOpenWorkbench(); return}
        else if (action === "settings") {onOpenSettings(); return}
        render()
    }

    const renderKeys = (model: FlowViewModel) => {
        Html.empty(keys)
        const add = (action: {id: FlowActionId, label: string, enter?: boolean}, system: boolean) => {
            const button: HTMLButtonElement = (
                <button type="button" data-action={action.id}
                        className={`${system ? "sys-key" : ""}${action.enter ? " enter-key" : ""}`}>
                    {action.label}
                </button>)
            button.onclick = () => invokeAction(action.id)
            appendChildren(keys, button)
        }
        model.primaryActions.forEach(action => add(action, false))
        if (model.primaryActions.length > 0 && model.systemActions.length > 0) {
            appendChildren(keys, <span className="flow-key-spacer"/>)
        }
        model.systemActions.forEach(action => add(action, true))
    }

    const render = () => {
        clearTimer()
        const model = flowView(flow.state, handoffPage)
        renderScreen(model)
        renderKeys(model)
        syncPlayback()
        scheduleAutomaticTransition()
    }

    lifecycle.own(Events.subscribe(document, "keydown", (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {return}
        if (event.key !== "Enter") {return}
        const enter = flowView(flow.state, handoffPage).primaryActions.find(action => action.enter)
        if (enter === undefined) {return}
        event.preventDefault()
        invokeAction(enter.id)
    }))
    lifecycle.own(Terminable.create(() => {
        clearTimer()
        stopAudio()
        onPlayingChanged(false, null)
    }))

    if (initialCompletedInstrument !== null) {
        onRoomChanged(instrumentRoom(initialCompletedInstrument))
    }
    render()
    return {state: () => flow.state, render}
}
```

- [ ] **Step 2: Keep the DOM module type-safe**

Run:

```bash
cd opendaw
npx tsc --noEmit -p packages/app/studio/tsconfig.json
```

Expected: any failures reference the new module only. Fix those exact failures before integration; do not modify Agent, MIDI, or DAW files.

- [ ] **Step 3: Replace the keyboard sub-screen and key row in `AgentOverlay.tsx`**

Add imports:

```ts
import {mountSingleInstrumentFlow} from "./SingleInstrumentFlowView"
import {INSTRUMENTS, type InstrumentId} from "./SingleInstrumentFlow"
```

Replace the old `interventionButtons` construction and deck body with:

```tsx
const flowScreen: HTMLElement = (<div className="flow-screen-host"/>)
const flowKeys: HTMLElement = (<div className="interventions flow-keys"/>)

const deskSceneEl: HTMLElement = (
    <div className="desk-scene">
        <div className="stage-bezel">
            {stageEl}
        </div>
        <div className="crt-stand"/>
        <div className="keyboard-deck">
            <div className="deck-riser">
                <div className="deck-screen">
                    {flowScreen}
                    {panelEl}
                </div>
            </div>
            {flowKeys}
        </div>
    </div>)
```

Keep `INTERVENTIONS` and `intervene()` available for legacy object panels, but do not append the legacy intervention buttons to the product DOM.

- [ ] **Step 4: Lock room navigation while the flow owns the product screen**

At the top of `navTo`:

```ts
if (root.classList.contains("single-instrument-flow")) {return}
```

Do the same for the later `chPrev` / `chNext` subscriptions:

```ts
Events.subscribe(chPrev, "click", () => {
    if (!root.classList.contains("single-instrument-flow")) {setRoom(roomIndex - 1)}
}),
Events.subscribe(chNext, "click", () => {
    if (!root.classList.contains("single-instrument-flow")) {setRoom(roomIndex + 1)}
}),
```

- [ ] **Step 5: Mount the flow after `root` exists**

Immediately after the root classes are initialized:

```ts
root.classList.add("transport-paused", "single-instrument-flow")
root.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`)

const completedInstrumentParam = initialSearchParams.get("instrument")
const completedInstrument = initialSearchParams.has("dawdex-complete")
    && INSTRUMENTS.includes(completedInstrumentParam as InstrumentId)
    ? completedInstrumentParam as InstrumentId
    : null

mountSingleInstrumentFlow({
    lifecycle,
    screen: flowScreen,
    keys: flowKeys,
    initialCompletedInstrument: completedInstrument,
    handoffPage: initialSearchParams.has("dawdex-complete"),
    onRoomChanged: room => {
        const index = DAWDEX_ROOMS.findIndex(candidate => candidate.id === room)
        if (index >= 0) {setRoom(index)}
    },
    onPlayingChanged: (playing, instrument) => {
        isPlaying = playing
        setPlaying(playing)
        for (const role of ["drums", "bass", "keys"] as const) {
            if (role === instrument) {
                enterRole(role)
                setRoleState(role, playing ? "performing" : "ready")
            } else {
                setRoleState(role, "waiting")
            }
        }
    },
    onOpenWorkbench: () => uiSession.setWorkbench(true),
    onOpenSettings: () => openPanel("settings")
})
```

- [ ] **Step 6: Stop legacy startup UI from competing**

Guard the existing room deep-link:

```ts
const initialRoom = initialSearchParams.get("room")
if (!root.classList.contains("single-instrument-flow") && initialRoom !== null) {
    const idx = DAWDEX_ROOMS.findIndex(room => room.id === initialRoom)
    if (idx >= 0) {setRoom(idx, false)}
}
```

Guard the existing panel deep-link so an old object panel cannot cover the selection screen:

```ts
const initialPanel = initialSearchParams.get("panel")
if (!root.classList.contains("single-instrument-flow")
    && (initialPanel === "monitor" || initialPanel === "desk"
        || initialPanel === "guitar" || initialPanel === "lamp"
        || initialPanel === "art" || initialPanel === "shelf"
        || initialPanel === "clock" || initialPanel === "settings")) {
    openPanel(initialPanel)
}
```

Do not start the legacy Provider polling, real bridge polling, or fan prompt while
`single-instrument-flow` is active. Replace the final startup block with:

```ts
if (!root.classList.contains("single-instrument-flow")) {
    renderProviderSlot()
    refreshProviderStatus(true).catch(reason => appendEvent(`模型状态检查失败：${String(reason)}`))
    const realSyncTimer = window.setInterval(() => realBridge.sync(daw.snapshot()), 500)
    lifecycle.own(Terminable.create(() => window.clearInterval(realSyncTimer)))
    if (!demoMode) {realBridge.sync(daw.snapshot())}
}
```

This does not delete the old Agent path; it prevents it from driving the new initial UI.

- [ ] **Step 7: Run TypeScript and Studio tests**

```bash
cd opendaw
npm run build -w @opendaw/app-studio
npm run test -w @opendaw/app-studio
```

Expected:

- Studio build succeeds.
- 14 test files pass.
- 62 tests pass.

- [ ] **Step 8: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.tsx \
  opendaw/packages/app/studio/src/agent/AgentOverlay.tsx
git commit -m "feat(stage): mount keyboard single track journey"
```

---

### Task 5: Apply the pixel sub-screen and adaptive physical-key styling

**Files:**
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.sass:196-231`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.sass:1108-1205`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.sass:1662-1668`

- [ ] **Step 1: Add flow screen styles below `.deck-idle`**

Add:

```sass
  .flow-screen-host
    min-height: 112px
    height: 100%
    font-family: "SF Mono", "Courier New", monospace
    color: $cyan
    &[data-preview-unavailable="true"]::after
      content: "PREVIEW UNAVAILABLE"
      position: absolute
      right: 12px
      bottom: 7px
      color: $amber
      font-size: 8px
      letter-spacing: 0.12em

  .single-instrument-screen
    min-height: 112px
    height: 100%
    display: flex
    flex-direction: column
    justify-content: center
    gap: 7px
    padding: 10px 16px
    text-shadow: 0 0 7px rgba($cyan, 0.42)

  .flow-screen-head
    display: flex
    align-items: center
    justify-content: space-between
    gap: 12px
    letter-spacing: 0.12em
    strong
      font-size: 13px
    span
      color: $amber
      font-size: 10px

  .flow-instruments
    display: grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 12px
    button
      min-height: 72px
      display: grid
      grid-template-columns: 1fr
      place-items: center
      gap: 2px
      border: 1px solid rgba($cyan, 0.36)
      border-radius: 3px
      background: rgba(8, 22, 25, 0.74)
      color: $cyan
      font: inherit
      letter-spacing: 0.14em
      cursor: pointer
      transition: border-color 120ms ease, background 120ms ease, transform 80ms steps(2)
      img
        width: min(104px, 72%)
        height: 42px
        object-fit: contain
        image-rendering: pixelated
        filter: grayscale(1) contrast(1.2) sepia(1) hue-rotate(125deg) saturate(3)
      span
        font-size: 10px
      &:hover, &:focus-visible
        outline: none
        border-color: $cyan
        background: rgba($cyan, 0.12)
      &:active
        transform: translateY(2px)

  .flow-sections
    display: grid
    grid-template-columns: repeat(4, minmax(0, 1fr))
    gap: 8px

  .flow-section
    display: grid
    grid-template-columns: auto 1fr
    gap: 3px 6px
    align-items: center
    color: rgba($cyan, 0.34)
    font-size: 9px
    letter-spacing: 0.1em
    i
      grid-column: 1 / -1
      height: 4px
      background: rgba($cyan, 0.1)
      overflow: hidden
      b
        display: block
        width: 0
        height: 100%
        background: currentColor
    &[data-status="complete"]
      color: rgba($cyan, 0.76)
      i b
        width: 100%
    &[data-status="current"]
      color: $amber
      i b
        width: 58%
        animation: flow-progress 1.4s steps(6) infinite

  .flow-next
    display: grid
    grid-template-columns: auto 1fr
    align-items: center
    gap: 8px
    color: rgba($amber, 0.72)
    font-size: 9px
    letter-spacing: 0.14em
    input
      min-width: 0
      border: 0
      border-bottom: 1px solid rgba($cyan, 0.24)
      outline: 0
      background: transparent
      color: $cyan
      font: inherit
      font-size: 10px
      padding: 3px 0

  .flow-message
    margin: 0
    text-align: center
    color: $amber
    font-size: 11px
    letter-spacing: 0.12em
```

- [ ] **Step 2: Adapt the physical key row**

Add below `.keyboard-deck .interventions`:

```sass
  .keyboard-deck .flow-keys
    flex-wrap: nowrap
    .flow-key-spacer
      flex: 0 0 16px
    button[data-action="continue"],
    button[data-action="finish"],
    button[data-action="next"],
    button[data-action="confirm-swap"]
      flex-grow: 1.7
      color: #26241f
      font-weight: 800
    button.sys-key
      flex: 0 0 auto
      padding-inline: 13px
      color: #77736b
```

Hide competing product UI and room controls only in this flow:

```sass
  &.single-instrument-flow
    .composer,
    .drawer,
    .room-nav,
    .channel button,
    .stage .hotspots,
    .new-project,
    .replay,
    .status-dot,
    .last-event,
    .intro-splash
      display: none
```

- [ ] **Step 3: Add deterministic pixel motion and reduced-motion handling**

Add:

```sass
@keyframes flow-progress
  from
    width: 12%
  to
    width: 88%

@media (prefers-reduced-motion: reduce)
  component .flow-section[data-status="current"] i b
    width: 58%
    animation: none !important
  component .flow-instruments button
    transition: none
```

- [ ] **Step 4: Build and visually inspect compiled CSS**

```bash
cd opendaw
npm run build -w @opendaw/app-studio
```

Expected: build succeeds with no Sass warnings introduced by the new selectors.

- [ ] **Step 5: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/AgentOverlay.sass
git commit -m "style(stage): adapt pixel screen for section journey"
```

---

### Task 6: Verify the complete UI journey and PR boundary

**Files:**
- Modify only if verification finds a defect:
  - `opendaw/packages/app/studio/src/agent/SingleInstrumentFlow.ts`
  - `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.ts`
  - `opendaw/packages/app/studio/src/agent/SingleInstrumentFlowView.tsx`
  - `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx`
  - `opendaw/packages/app/studio/src/agent/AgentOverlay.sass`

- [ ] **Step 1: Run targeted and full Studio tests**

```bash
cd opendaw
npx vitest run \
  packages/app/studio/src/agent/SingleInstrumentFlow.test.ts \
  packages/app/studio/src/agent/SingleInstrumentFlowView.test.ts \
  --config packages/app/studio/vitest.config.ts
npm run test -w @opendaw/app-studio
```

Expected: all targeted tests and all Studio test files pass.

- [ ] **Step 2: Run required builds without changing the missing-Cargo machine state**

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
npm run build -w @opendaw/app-studio
```

Expected: Agent Server and Studio commands pass. Do not run the root WASM build because the verified baseline machine lacks `cargo`.

- [ ] **Step 3: Start the local UI**

```bash
cd opendaw
npm run dev:dawdex-studio
```

Expected: Vite prints a local Studio URL, normally `http://localhost:7100/create`.

- [ ] **Step 4: Browser-check all three instruments**

For Drums, Bass, and Keys:

1. Confirm the first visible sub-screen contains only the three instrument icons.
2. Click the icon and confirm the main screen enters the correct room.
3. Confirm Intro generates and automatically changes to `● PLAYING`.
4. Press the wide `↵ 继续` key three times and confirm Verse, Chorus, and Bridge appear in order.
5. Confirm the room does not change between sections.
6. Confirm the old Prompt, evidence drawer, room arrows, hotspots, and old intervention keys are absent.
7. Press `↵ 完成`; confirm `01 TRACK · 04 / 04 SECTIONS`.
8. Download MIDI; confirm the downloaded filename matches the selected instrument.
9. Press `↵ 前往下一页`; confirm the URL contains
   `dawdex-complete=1&instrument=<selected>`.
10. Confirm no new browser console error.

- [ ] **Step 5: Browser-check reset and keyboard behavior**

1. During Intro playback, click `换乐器`.
2. Click `返回`; confirm Intro and its playback state remain.
3. Click `换乐器` again, then `重新选择`.
4. Confirm the main screen returns to the lobby and all four sections are empty.
5. Select another instrument; confirm the journey restarts at Intro.
6. Use keyboard `Tab` to focus an instrument icon and `Enter` to select it.
7. While no text input is focused, use physical `Enter` for Continue.
8. Focus the prefilled input; confirm `Enter` does not bypass the explicit wide key.

- [ ] **Step 6: Verify the change boundary**

```bash
git diff --check
git diff --name-only origin/main...HEAD
git status --short
```

Expected:

- `git diff --check` exits 0.
- Only the File Map paths are listed.
- Worktree is clean.

- [ ] **Step 7: Final review commit if browser fixes were required**

If Step 4 or Step 5 required corrections:

```bash
git add opendaw/packages/app/studio/src/agent \
  opendaw/packages/app/studio/public/dawdex/demo
git commit -m "fix(stage): finish single instrument journey verification"
```

If no corrections were required, do not create an empty commit.

- [ ] **Step 8: Prepare the PR**

Use:

```text
Title: feat(stage): add single-instrument section journey

Body:
## Summary
- select Drums, Bass, or Keys from the keyboard sub-screen
- run a frontend-only Intro → Verse → Chorus → Bridge journey
- adapt the physical keyboard to Continue, regenerate, replay, swap, download, and handoff
- keep Agent, MIDI retrieval, and openDAW execution unchanged

## Verification
- Studio tests
- Agent Server tests
- Studio build
- browser walkthrough for Drums, Bass, and Keys
- download provenance and SHA-256 verification
```
