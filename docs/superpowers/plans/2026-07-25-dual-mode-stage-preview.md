# DAWdex Dual-Mode Stage Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the openDAW device-panel ShaderToy preview slot with a live, read-only DAWdex stage preview that is the visible return portal from workbench mode to the full DAWdex product.

**Architecture:** Keep one `AgentClient`, `DawProjectAdapter`, and `RealUiEventBridge` in `AgentOverlay`. Add a `DawdexUiSession`, keyed by `StudioService`, that carries the shared view mode and compact stage snapshot. The existing full stage publishes its final visible state into the session; a new device-panel preview consumes that session without creating a second Agent or music path.

**Tech Stack:** TypeScript, `@opendaw/lib-jsx`, `@opendaw/lib-std` observables, Sass, Vitest, Vite, Playwright/browser runtime verification.

---

## File map

- Create `opendaw/packages/app/studio/src/agent/DawdexStageAssets.ts`: shared room and performer asset catalog.
- Create `opendaw/packages/app/studio/src/agent/DawdexUiSession.ts`: per-`StudioService` view mode and stage snapshot.
- Create `opendaw/packages/app/studio/src/agent/DawdexUiSession.test.ts`: pure session behavior tests.
- Create `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.tsx`: read-only preview and return control.
- Create `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.sass`: compact 16:9 preview styling.
- Create `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.ts`: pure compact-view projection.
- Create `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.test.ts`: compact-view projection tests.
- Modify `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx`: publish stage state, subscribe to view mode, and pause the hidden full-stage video.
- Modify `opendaw/packages/app/studio/src/agent/AgentOverlay.sass`: remove the collapsed right-edge rail.
- Modify `opendaw/packages/app/studio/src/ui/devices/panel/DevicePanel.tsx`: mount the DAWdex preview in the old ShaderToy slot.
- Modify `docs/design/STAGE_UI.md`: document the new workbench portal and state-sharing boundary.

### Task 1: Shared asset catalog and UI session

**Files:**
- Create: `opendaw/packages/app/studio/src/agent/DawdexStageAssets.ts`
- Create: `opendaw/packages/app/studio/src/agent/DawdexUiSession.ts`
- Test: `opendaw/packages/app/studio/src/agent/DawdexUiSession.test.ts`

- [ ] **Step 1: Write the failing session tests**

```ts
import {describe, expect, it} from "vitest"
import {dawdexRoom} from "./DawdexStageAssets"
import {DawdexUiSession, getDawdexUiSession} from "./DawdexUiSession"

describe("DawdexUiSession", () => {
    it("switches between product and workbench without resetting stage state", () => {
        const session = new DawdexUiSession()
        session.setRoom("keys")
        session.setRole("keys", {entered: true, state: "performing", audible: true})

        session.setViewMode("workbench")
        session.setViewMode("product")

        expect(session.viewMode.getValue()).toBe("product")
        expect(session.stage.getValue().roomId).toBe("keys")
        expect(session.stage.getValue().roles.keys).toMatchObject({
            entered: true,
            state: "performing",
            audible: true
        })
    })

    it("publishes transport and danmaku state for the compact preview", () => {
        const session = new DawdexUiSession()
        session.setTransport({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            barsPerLoop: 4,
            currentBar: 3
        })
        session.pushDanmaku("鼓松一点", "user")

        expect(session.stage.getValue()).toMatchObject({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            currentBar: 3,
            danmaku: {text: "鼓松一点", author: "user"}
        })
    })

    it("resets role presentation without changing the active room or mode", () => {
        const session = new DawdexUiSession()
        session.setViewMode("workbench")
        session.setRoom("drums")
        session.setRole("drums", {entered: true, state: "failed", audible: false})

        session.resetRoles()

        expect(session.viewMode.getValue()).toBe("workbench")
        expect(session.stage.getValue().roomId).toBe("drums")
        expect(session.stage.getValue().roles.drums).toEqual({
            entered: false,
            state: "waiting",
            audible: false
        })
    })

    it("returns one session for one StudioService identity", () => {
        const service = {} as never
        expect(getDawdexUiSession(service)).toBe(getDawdexUiSession(service))
        expect(getDawdexUiSession({} as never)).not.toBe(getDawdexUiSession(service))
    })

    it("resolves the shared room media catalog", () => {
        const session = new DawdexUiSession()
        session.setRoom("lounge")

        expect(dawdexRoom(session.stage.getValue().roomId)).toMatchObject({
            label: "休息室",
            bg: "/dawdex/room_lounge.jpg",
            video: "/dawdex/room_lounge_loop.mp4"
        })
    })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd opendaw
npx vitest run packages/app/studio/src/agent/DawdexUiSession.test.ts --config packages/app/studio/vitest.config.ts
```

Expected: FAIL because `./DawdexUiSession` does not exist.

- [ ] **Step 3: Add the shared room and performer catalog**

```ts
import type {RoleId} from "./ui-contract"

export type DawdexRoomId = "main" | "drums" | "strings" | "keys" | "control" | "lounge"

export type DawdexRoom = {
    readonly id: DawdexRoomId
    readonly label: string
    readonly bg: string
    readonly video: string
}

export const DAWDEX_ROOMS: ReadonlyArray<DawdexRoom> = [
    {id: "main", label: "演播大厅", bg: "/dawdex/studio_base.jpg", video: "/dawdex/studio_night_loop.mp4"},
    {id: "drums", label: "鼓棚", bg: "/dawdex/room_drums.jpg", video: "/dawdex/room_drums_loop.mp4"},
    {id: "strings", label: "吉他贝斯棚", bg: "/dawdex/room_guitar_bass.jpg", video: "/dawdex/room_guitar_bass_loop.mp4"},
    {id: "keys", label: "键盘阁楼", bg: "/dawdex/room_keyboards.jpg", video: "/dawdex/room_keyboards_loop.mp4"},
    {id: "control", label: "控制室", bg: "/dawdex/control_room_night.jpg", video: "/dawdex/control_room_loop.mp4"},
    {id: "lounge", label: "休息室", bg: "/dawdex/room_lounge.jpg", video: "/dawdex/room_lounge_loop.mp4"}
]

export const DAWDEX_STAGE_ROLES: ReadonlyArray<{id: RoleId, label: string, img: string}> = [
    {id: "drums", label: "鼓手", img: "/dawdex/drummer_v2.png"},
    {id: "bass", label: "贝斯手", img: "/dawdex/bassist_v2.png"},
    {id: "keys", label: "键盘手", img: "/dawdex/keyboardist_v2.png"}
]

export const DAWDEX_PRODUCER = {
    id: "producer" as const,
    label: "制作人",
    img: "/dawdex/producer_v2.png"
}

export const dawdexRoom = (id: DawdexRoomId): DawdexRoom =>
    DAWDEX_ROOMS.find(room => room.id === id) ?? DAWDEX_ROOMS[0]
```

- [ ] **Step 4: Implement the minimal session**

Implement `DawdexUiSession` with:

```ts
import {DefaultObservableValue} from "@opendaw/lib-std"
import type {StudioService} from "@/service/StudioService"
import type {DanmakuAuthor, RoleId, RoleState} from "./ui-contract"
import type {DawdexRoomId} from "./DawdexStageAssets"

export type DawdexViewMode = "product" | "workbench"
export type PreviewAuthor = DanmakuAuthor | "producer" | RoleId
export type PreviewRole = {entered: boolean, state: RoleState, audible: boolean}
export type DawdexStageSnapshot = {
    roomId: DawdexRoomId
    isPlaying: boolean
    bpm: number
    key: string
    barsPerLoop: number
    currentBar: number
    roles: Record<RoleId, PreviewRole>
    danmaku: null | {id: number, text: string, author: PreviewAuthor}
    latestEvent: string
}

const initialRole = (): PreviewRole => ({entered: false, state: "waiting", audible: false})
const initialRoles = (): Record<RoleId, PreviewRole> => ({
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

    setRole(role: RoleId, patch: Partial<PreviewRole>): void {
        const current = this.stage.getValue()
        this.#patch({roles: {...current.roles, [role]: {...current.roles[role], ...patch}}})
    }

    resetRoles(): void {
        this.#patch({roles: initialRoles()})
    }

    pushDanmaku(text: string, author: PreviewAuthor): void {
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
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/DawdexStageAssets.ts \
        opendaw/packages/app/studio/src/agent/DawdexUiSession.ts \
        opendaw/packages/app/studio/src/agent/DawdexUiSession.test.ts
git commit -m "feat(stage): add shared DAWdex UI session"
```

### Task 2: Publish the existing full-stage state into the session

**Files:**
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx`

- [ ] **Step 1: Write the failing single-video-ownership test**

Append:

```ts
it("plays room video only on the visible surface", () => {
    expect(shouldPlayDawdexVideo("product", "product", true)).toBe(true)
    expect(shouldPlayDawdexVideo("workbench", "product", true)).toBe(false)
    expect(shouldPlayDawdexVideo("workbench", "workbench", true)).toBe(true)
    expect(shouldPlayDawdexVideo("product", "product", false)).toBe(false)
})
```

Import `shouldPlayDawdexVideo`, run the focused test, and verify it fails because the helper is not exported.

- [ ] **Step 2: Implement the single-video-ownership helper**

Add to `DawdexUiSession.ts`:

```ts
export const shouldPlayDawdexVideo = (
    surface: DawdexViewMode,
    mode: DawdexViewMode,
    isPlaying: boolean
): boolean => isPlaying && surface === mode
```

Run the focused test and verify GREEN.

- [ ] **Step 3: Integrate shared assets and session**

In `AgentOverlay.tsx`:

- import `DAWDEX_ROOMS`, `DAWDEX_STAGE_ROLES`, and `DawdexRoomId`;
- import `getDawdexUiSession`;
- remove the local room/role catalogs;
- create `const uiSession = getDawdexUiSession(service)` beside `client` and `daw`;
- replace `ROOMS`/`STAGE_ROLES` references with their shared names.

- [ ] **Step 4: Publish final visible stage state**

Update existing state-changing functions:

```ts
const setRoom = (index: number) => {
    roomIndex = ((index % DAWDEX_ROOMS.length) + DAWDEX_ROOMS.length) % DAWDEX_ROOMS.length
    const room = DAWDEX_ROOMS[roomIndex]
    channelName.textContent = room.label
    stageEl.dataset.room = room.id
    stageImg.src = room.bg
    uiSession.setRoom(room.id)
    setVideoLive(isPlaying)
}
```

Publish role entry, final role state, audible state, transport, danmaku, latest event, and Mock resets through the corresponding session methods. Do not move `RealUiEventBridge` out of `AgentOverlay`.

- [ ] **Step 5: Run tests and build**

```bash
cd opendaw
npx vitest run packages/app/studio/src/agent/DawdexUiSession.test.ts --config packages/app/studio/vitest.config.ts
npm run build -w @opendaw/app-studio
```

Expected: session tests PASS and Studio build exits 0.

- [ ] **Step 6: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/AgentOverlay.tsx \
        opendaw/packages/app/studio/src/agent/DawdexUiSession.test.ts
git commit -m "refactor(stage): publish live stage preview state"
```

### Task 3: Add the workbench preview in the former ShaderToy slot

**Files:**
- Create: `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.ts`
- Test: `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.test.ts`
- Create: `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.tsx`
- Create: `opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.sass`
- Modify: `opendaw/packages/app/studio/src/ui/devices/panel/DevicePanel.tsx`

- [ ] **Step 1: Write the failing compact preview-model test**

```ts
import {describe, expect, it} from "vitest"
import {DawdexUiSession} from "@/agent/DawdexUiSession"
import {createDawdexStagePreviewModel} from "./DawdexStagePreviewModel"

describe("createDawdexStagePreviewModel", () => {
    it("projects the current room and transport into compact labels", () => {
        const session = new DawdexUiSession()
        session.setRoom("keys")
        session.setTransport({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            barsPerLoop: 4,
            currentBar: 3
        })

        expect(createDawdexStagePreviewModel(session.stage.getValue(), "workbench")).toMatchObject({
            roomLabel: "键盘阁楼",
            recLabel: "● REC",
            transportLabel: "BAR 3/4 · 92 BPM",
            playVideo: true
        })
    })

    it("keeps video paused when the product surface owns playback", () => {
        const session = new DawdexUiSession()
        session.setTransport({
            isPlaying: true,
            bpm: 128,
            key: "A minor",
            barsPerLoop: 4,
            currentBar: 1
        })

        expect(createDawdexStagePreviewModel(session.stage.getValue(), "product").playVideo).toBe(false)
    })
})
```

Run:

```bash
cd opendaw
npx vitest run packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.test.ts \
  --config packages/app/studio/vitest.config.ts
```

Expected: FAIL because `DawdexStagePreviewModel` does not exist.

- [ ] **Step 2: Implement the compact preview model**

```ts
import {dawdexRoom} from "@/agent/DawdexStageAssets"
import {
    shouldPlayDawdexVideo,
    type DawdexStageSnapshot,
    type DawdexViewMode
} from "@/agent/DawdexUiSession"

export const createDawdexStagePreviewModel = (
    stage: DawdexStageSnapshot,
    mode: DawdexViewMode
) => {
    const room = dawdexRoom(stage.roomId)
    return {
        room,
        roomLabel: room.label,
        recLabel: stage.isPlaying ? "● REC" : "STANDBY",
        transportLabel: `BAR ${stage.currentBar}/${stage.barsPerLoop} · ${Math.round(stage.bpm)} BPM`,
        playVideo: shouldPlayDawdexVideo("workbench", mode, stage.isPlaying)
    }
}
```

Run the focused test and verify 2 tests PASS.

- [ ] **Step 3: Implement the preview component**

Create the component around this structure:

```tsx
import css from "./DawdexStagePreview.sass?inline"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import type {Lifecycle} from "@opendaw/lib-std"
import {DAWDEX_PRODUCER, DAWDEX_STAGE_ROLES} from "@/agent/DawdexStageAssets"
import {getDawdexUiSession, type DawdexStageSnapshot, type DawdexViewMode} from "@/agent/DawdexUiSession"
import type {StudioService} from "@/service/StudioService"
import {createDawdexStagePreviewModel} from "./DawdexStagePreviewModel"

const className = Html.adoptStyleSheet(css, "DawdexStagePreview")

export const DawdexStagePreview = ({lifecycle, service}: {
    lifecycle: Lifecycle,
    service: StudioService
}) => {
    const session = getDawdexUiSession(service)
    const roomImage: HTMLImageElement = <img className="room-bg" alt="" draggable={false}/>
    const roomVideo: HTMLVideoElement = <video className="room-video" muted loop playsInline preload="metadata"/>
    const rec: HTMLElement = <span className="rec"/>
    const roomLabel: HTMLElement = <span className="room-label"/>
    const transport: HTMLElement = <span className="transport"/>
    const danmaku: HTMLElement = <span className="preview-danmaku"/>
    const roleEls = new Map(DAWDEX_STAGE_ROLES.concat([DAWDEX_PRODUCER]).map(role => {
        const element: HTMLElement = (
            <span className="performer" data-role={role.id}>
                <img src={role.img} alt="" draggable={false}/>
            </span>)
        return [role.id, element] as const
    }))
    let mode: DawdexViewMode = session.viewMode.getValue()
    let snapshot: DawdexStageSnapshot = session.stage.getValue()
    let lastDanmakuId = 0

    const root: HTMLButtonElement = (
        <button type="button" className={className} aria-label="打开 DAWdex 演播厅">
            {roomImage}
            {roomVideo}
            <span className="performers">{Array.from(roleEls.values())}</span>
            {danmaku}
            <span className="hud">{rec}{roomLabel}{transport}</span>
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
            const element = roleEls.get(role as keyof typeof snapshot.roles)
            if (element === undefined) {return}
            element.dataset.state = state.state
            element.dataset.entered = String(state.entered)
            element.dataset.audible = String(state.audible)
        })
        if (snapshot.danmaku !== null && snapshot.danmaku.id !== lastDanmakuId) {
            lastDanmakuId = snapshot.danmaku.id
            danmaku.textContent = snapshot.danmaku.text
            danmaku.classList.remove("show")
            requestAnimationFrame(() => danmaku.classList.add("show"))
        }
        if (model.playVideo) {
            roomVideo.play().catch(() => {})
        } else {
            roomVideo.pause()
            roomVideo.currentTime = 0
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
        Events.subscribe(root, "click", () => session.setViewMode("product"))
    )
    return root
}
```

The component relies on native button keyboard activation for `Enter` and `Space`. It must not construct `AgentClient`, `DawProjectAdapter`, or `RealUiEventBridge`.

- [ ] **Step 4: Style the compact surface**

Implement:

```sass
component
  position: relative
  align-self: stretch
  min-width: 260px
  max-width: min(36vw, 480px)
  margin: 0.5em 0.5em 0.5em 0
  padding: 0
  border: 1px solid rgba(89, 225, 196, 0.28)
  border-radius: 0.5em
  overflow: hidden
  background: #090a0d
  color: #fff
  cursor: pointer
  aspect-ratio: 16 / 9

  &:focus-visible
    outline: 2px solid #59e1c4
    outline-offset: -2px

  .room-bg, .room-video
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    object-fit: cover

  .enter-hint
    position: absolute
    inset: auto 10px 10px auto
    z-index: 9
    padding: 5px 8px
    border-radius: 999px
    background: rgba(5, 8, 10, 0.76)
    font-size: 10px
    opacity: 0
    transition: opacity 160ms ease

  &:hover .enter-hint,
  &:focus-visible .enter-hint
    opacity: 1
```

Add the room/performer/REC/danmaku selectors needed for a readable preview without copying the full product shell.

Use these concrete selectors:

```sass
  .room-video
    opacity: 0
    transition: opacity 180ms ease
  &[data-playing="true"] .room-video
    opacity: 1

  .performers
    position: absolute
    inset: 0
    z-index: 3
    pointer-events: none
  .performer
    display: none
    position: absolute
    bottom: 5%
    opacity: 0.42
    &[data-entered="false"]
      visibility: hidden
    &[data-state="performing"]
      opacity: 1
    img
      display: block
      height: 40%
      min-height: 52px
      image-rendering: pixelated
  &[data-room="main"]
    .performer[data-role="drums"]
      display: block
      left: 35%
    .performer[data-role="bass"]
      display: block
      left: 45%
    .performer[data-role="keys"]
      display: block
      left: 75.5%
  &[data-room="drums"] .performer[data-role="drums"]
    display: block
    left: 28%
  &[data-room="strings"] .performer[data-role="bass"]
    display: block
    left: 72.5%
  &[data-room="keys"] .performer[data-role="keys"]
    display: block
    left: 70.5%
  &[data-room="control"] .performer[data-role="producer"]
    display: block
    left: 76%

  .hud
    position: absolute
    z-index: 7
    inset: 8px 8px auto
    display: flex
    align-items: center
    gap: 7px
    font: 700 9px/1 ui-monospace, monospace
    text-shadow: 0 1px 3px #000
  .rec
    color: #f87171
  .transport
    margin-left: auto
    color: rgba(255, 255, 255, 0.76)
  .preview-danmaku
    position: absolute
    z-index: 6
    left: 100%
    top: 34%
    max-width: 90%
    white-space: nowrap
    font: 700 11px/1.2 ui-monospace, monospace
    text-shadow: 1px 1px 2px #000
    &.show
      animation: preview-danmaku 4.2s linear both

@keyframes preview-danmaku
  from
    transform: translateX(0)
  to
    transform: translateX(-210%)
```

- [ ] **Step 5: Replace the device-panel slot**

In `DevicePanel.tsx`, replace:

```tsx
<ShadertoyPreview lifecycle={lifecycle} service={service}/>
```

with:

```tsx
<DawdexStagePreview lifecycle={lifecycle} service={service}/>
```

Remove only the device-panel `ShadertoyPreview` import. Do not delete ShaderToy editor, renderer, workspace, or export code.

- [ ] **Step 6: Build and inspect the hot-reloaded workbench**

```bash
cd opendaw
npm run build -w @opendaw/app-studio
```

Expected: TypeScript and Vite build exit 0. In `localhost:7100/create?workbench=1`, the former ShaderToy slot contains the stage preview.

- [ ] **Step 7: Commit**

```bash
git add opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.tsx \
        opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreview.sass \
        opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.ts \
        opendaw/packages/app/studio/src/ui/devices/panel/DawdexStagePreviewModel.test.ts \
        opendaw/packages/app/studio/src/ui/devices/panel/DevicePanel.tsx
git commit -m "feat(workbench): replace ShaderToy slot with stage preview"
```

### Task 4: Make the preview the sole visible return portal

**Files:**
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx`
- Modify: `opendaw/packages/app/studio/src/agent/AgentOverlay.sass`

- [ ] **Step 1: Drive collapsed state from the shared view mode**

Refactor the current `setCollapsed` logic so UI events set `uiSession.viewMode`, while one subscription applies the root classes:

```ts
const applyViewMode = (mode: DawdexViewMode) => {
    const collapsed = mode === "workbench"
    root.classList.toggle("collapsed", collapsed)
    collapseButton.classList.toggle("active", collapsed)
    collapseButton.textContent = collapsed ? "⌃ 演播厅" : "⌄ 工作台"
    if (collapsed && root.classList.contains("presentation")) {
        root.classList.remove("presentation")
        presentButton.classList.remove("active")
    }
    setVideoLive(isPlaying)
}

const setCollapsed = (force?: boolean) => {
    const collapsed = uiSession.viewMode.getValue() === "workbench"
    uiSession.setViewMode((force ?? !collapsed) ? "workbench" : "product")
}

lifecycle.own(uiSession.viewMode.catchupAndSubscribe(owner => applyViewMode(owner.getValue())))
```

Update `setVideoLive` so the full product video plays only in product mode. The preview component owns playback while in workbench mode.

- [ ] **Step 2: Remove the visible collapsed rail**

Replace the `.collapsed .shell-header` side-rail block with:

```sass
&.collapsed
  background: transparent
  backdrop-filter: none
  pointer-events: none
  overflow: visible
  padding: 0

  .desk-scene,
  .composer,
  .drawer,
  .intro-splash,
  .shell-header
    display: none
```

Retain `Esc` and `?workbench=1`; remove only the visible duplicate rail.

- [ ] **Step 3: Verify mode switching in the browser**

Verify:

1. Product “工作台” button enters workbench.
2. No DAWdex right-edge rail remains.
3. The preview is visible and openDAW remains interactive.
4. Clicking the preview returns to the full product.
5. `Enter` and `Space` on the focused preview also return.
6. `Esc` still toggles modes when an input is not focused.
7. The active room and role states survive round trips.
8. Only the visible surface video is playing.

- [ ] **Step 4: Commit**

```bash
git add opendaw/packages/app/studio/src/agent/AgentOverlay.tsx \
        opendaw/packages/app/studio/src/agent/AgentOverlay.sass
git commit -m "feat(workbench): use stage preview as mode portal"
```

### Task 5: Documentation and full verification

**Files:**
- Modify: `docs/design/STAGE_UI.md`

- [ ] **Step 1: Update the workbench documentation**

Replace the right-edge rail description with:

```md
- 工作台形态在设备区原 ShaderToy 预览位显示当前 DAWdex 演播厅；
- 缩略窗只读，显示当前房间、角色、REC/走带与有限弹幕；
- 点击缩略窗、按 Enter/Space 或按 Esc 返回产品形态；
- 工作台不再显示重复的右缘 DAWDEX 侧拉条；
- `RealUiEventBridge` 仍只有一个并持续按 500 ms 同步。
```

- [ ] **Step 2: Run the required checks**

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
npm run build -w @opendaw/app-studio
npm run test -w @opendaw/app-studio
cd ..
git diff --check
```

Expected: all commands exit 0; Studio tests include the new `DawdexUiSession` tests.

- [ ] **Step 3: Run final browser verification**

At `http://localhost:7100/create` and `http://localhost:7100/create?workbench=1`:

- capture product and workbench screenshots;
- verify no console errors;
- exercise product → workbench → product;
- resize the device panel and browser window;
- verify room and transport changes update the preview;
- verify the original ShaderToy preview is absent only from the device-panel slot.

- [ ] **Step 4: Inspect scope and commit**

```bash
git status --short
git diff --stat HEAD~4..HEAD
git diff --check
git add docs/design/STAGE_UI.md
git commit -m "docs(stage): document dual-mode preview portal"
```

The unrelated `opendaw/packages/app/studio/public/dawdex/room_lounge.jpg` worktree change must remain unstaged and outside every commit.
