# DAWdex 单乐器分段创作前端流程设计

日期：2026-07-26
状态：书面规格已确认

## 1. 目标

把 DAWdex 产品形态的首次交互改为一个纯前端、可点击、可完整演示的单乐器创作流程：

```text
选择 Drums / Bass / Keys
→ 主屏与键盘副屏同步进入对应房间
→ Intro 生成并自动播放
→ Verse 生成并自动播放
→ Chorus 生成并自动播放
→ Bridge 生成并自动播放
→ 单轨完成页
→ 下载 MIDI 或前往下一页
```

本阶段只跑通前端 UI 状态、房间联动、键帽操作、播放表现、下载入口和页面跳转。
不接 Agent、MIDI 检索、openDAW 工程写入或远端服务。

## 2. 已确认的产品约束

- 乐器固定为 `Drums`、`Bass`、`Keys`。
- 乐器直接在键盘上方的小副屏中通过图标选择。
- 选中乐器后，上方主屏和副屏同步切换到对应房间。
- 每次生成完成后自动进入播放状态，不出现“接受”步骤。
- 主操作使用键盘最右侧的大回车键：`↵ 继续`。
- 段落顺序固定为 `Intro → Verse → Chorus → Bridge`。
- 不允许跳段、换序或同时选择多个乐器。
- 不显示“保留”“更有力量”“更轻松”或“撤销”等旧干预。
- “换乐器”保留，但确认后必须清空进度并从乐器选择重新开始。
- 下一轮指令可以自动预填，但必须保持当前乐器和固定段落顺序。
- 远端地址尚未确定；通过前端配置注入。未配置时进入本地完成页。

## 3. 非目标

- 不修改 `AgentClient`、Provider、Plan Approval 或 Agent 协议。
- 不调用 `/v1/plan`、`/v1/midi-assets/:id` 或任何新增后端接口。
- 不创建、替换或删除 openDAW Track、Region、Device 或 Note。
- 不使用 `PatternCompiler` 或前端固定音符模板生成替代 MIDI。
- 不改变 MIDI Catalog、声音目录、SoundFont 或乐器映射。
- 不把这个线性流程扩展成自由聊天、风格选择或多轨编曲器。
- 不在本阶段确定生产环境远端页面。

## 4. 双屏职责

### 4.1 上方主屏

主屏只呈现空间与演奏状态：

- 未选择乐器时显示演播大厅；
- Drums 对应鼓棚；
- Bass 对应吉他贝斯棚；
- Keys 对应键盘阁楼；
- 进入房间后，四个段落都停留在同一房间；
- 生成完成进入播放时，房间视频和当前角色进入现有播放表现；
- 暂停时停止播放表现，重新播放时恢复。

进入单乐器流程后，主屏房间名称只读。现有左右换房箭头不能让用户跳离所选房间。

### 4.2 键盘副屏

副屏是这条流程唯一的创作入口，负责：

- 乐器选择；
- 进房过场；
- 当前乐器与段落；
- Mock 生成进度；
- 播放状态与段落进度；
- 下一轮自动预填内容；
- 换乐器确认；
- 单轨完成页；
- 下载与下一页跳转。

现有底部通用 Prompt、Plan Approval 和乐队会议抽屉在该流程中不显示，避免第二套入口。

### 4.3 物理键帽

键帽只显示当前状态可执行的动作。没有动作时隐藏，不用无关按钮填满键盘。

## 5. 固定状态机

```ts
type InstrumentId = "drums" | "bass" | "keys"
type SongSection = "intro" | "verse" | "chorus" | "bridge"

type GeneratingState = {
    kind: "generating"
    instrument: InstrumentId
    section: SongSection
    completed: ReadonlyArray<SongSection>
}

type PlayingState = {
    kind: "playing"
    instrument: InstrumentId
    section: SongSection
    completed: ReadonlyArray<SongSection>
    paused: boolean
    nextPrompt: string | null
}

type SingleInstrumentFlowState =
    | {kind: "selecting"}
    | {kind: "entering"; instrument: InstrumentId}
    | GeneratingState
    | PlayingState
    | {
        kind: "confirm-swap"
        previous: PlayingState
    }
    | {
        kind: "complete"
        instrument: InstrumentId
        completed: readonly ["intro", "verse", "chorus", "bridge"]
    }
```

允许的前进关系固定为：

```text
selecting
→ entering
→ generating(intro)
→ playing(intro)
→ generating(verse)
→ playing(verse)
→ generating(chorus)
→ playing(chorus)
→ generating(bridge)
→ playing(bridge)
→ complete
```

`继续`只执行当前状态允许的下一步。它不能接受外部段落名，也不能跳过中间状态。

## 6. 选择与进房

### 6.1 初始副屏

```text
SELECT INSTRUMENT

[ DRUMS ]    [ BASS ]    [ KEYS ]
```

- 三个图标本身是可点击按钮；
- 点击、键盘焦点和 `Enter` 都可以选择；
- 图标使用像素化轮廓和点阵标签；
- 选中时先产生一次短促按下/闪烁反馈；
- 选择立即锁定，防止连点选择多个乐器。

### 6.2 联动过场

副屏显示：

```text
ENTERING BASS ROOM…
```

与此同时：

- 主屏切换到对应房间；
- 房间名称同步更新；
- 非当前角色不进入演奏状态；
- 短暂过场结束后自动开始生成 Intro；
- 不增加“开始生成”按钮。

## 7. 生成、播放与预填

### 7.1 生成态

```text
BASS / GENERATING INTRO

██████████░░░░░░░░
```

- 进度是确定性的前端 Mock 反馈，不声称代表后端完成度；
- 生成期间主键帽进入忙碌状态，避免重复触发；
- 生成完成后自动转入播放，不等待用户批准。

### 7.2 播放态

```text
BASS / VERSE                      ● PLAYING

01 INTRO   ████████████████
02 VERSE   ███████░░░░░░░░░
03 CHORUS  ░░░░░░░░░░░░░░░░
04 BRIDGE  ░░░░░░░░░░░░░░░░

NEXT: 继续为 BASS 生成 CHORUS
```

- 当前段落显示播放位置；
- 已完成段落保持点亮；
- 未完成段落仅显示名称与空进度；
- 若配置了本地预览音频，进入 `playing` 时同步播放；
- 没有预览音频时仍运行播放走带、房间视频和角色动画，不修改 DAW；
- `播放/暂停`只控制这次前端 Mock 播放；
- `重播`从当前段开头重新播放；
- `重新生成`只重跑当前段的 Mock 生成与自动播放。

### 7.3 自动预填

下一轮文字在播放当前段时提前显示：

| 当前段 | 预填内容 |
| --- | --- |
| Intro | `继续为 {INSTRUMENT} 生成 VERSE` |
| Verse | `继续为 {INSTRUMENT} 生成 CHORUS` |
| Chorus | `继续为 {INSTRUMENT} 生成 BRIDGE` |
| Bridge | 无下一段预填 |

预填文字可以聚焦编辑，但段落名与乐器身份由状态机锁定。实现可以接受附加文本作为展示，
但不能因用户输入改变固定顺序或切换乐器。

点击 `↵ 继续`直接提交当前预填内容并开始下一段生成，不出现第二个发送按钮。

## 8. 键帽映射

### 8.1 选择态

- 乐器只在副屏图标中选择；
- 键帽区仅保留分离的系统入口：`工作台`、`设置`；
- 不显示段落操作。

### 8.2 进入与生成态

- 段落操作键隐藏或禁用；
- 大回车键显示当前忙碌状态，不接受重复输入。

### 8.3 Intro、Verse、Chorus 播放态

```text
[播放/暂停] [重播] [重新生成] [换乐器]       [↵ 继续]
```

### 8.4 Bridge 播放态

```text
[播放/暂停] [从头播放] [重新生成本段] [换乐器] [↵ 完成]
```

### 8.5 完成态

```text
[从头播放] [下载 MIDI] [换乐器]              [↵ 前往下一页]
```

最右侧回车键沿用当前 `undo` 键帽的加宽位置与物理按压效果，但其语义和
`data-kind` 必须改为当前流程动作，不能继续触发 `daw.undo()`。

## 9. 换乐器

在任意播放态点击“换乐器”，副屏覆盖显示：

```text
CHANGE INSTRUMENT?
当前四段进度将被清空

[返回]  [重新选择]
```

选择“返回”恢复此前状态和播放位置。选择“重新选择”执行：

1. 停止 Mock 播放；
2. 清空当前乐器；
3. 清空 Intro、Verse、Chorus、Bridge 进度；
4. 清空预填文字；
5. 主屏返回演播大厅；
6. 副屏恢复三个乐器图标。

不得保留旧乐器的已完成段落，也不得把旧进度带到新房间。

## 10. 完成页与跳转

Bridge 播放结束并按下 `↵ 完成`后，副屏显示：

```text
BASS TRACK COMPLETE

INTRO · VERSE · CHORUS · BRIDGE
04 / 04 SECTIONS

[从头播放]  [下载 MIDI]
[换乐器]    [↵ 前往下一页]
```

完成页明确表达：

- 当前结果只有一个乐器；
- 当前结果是一条轨道；
- 四个固定段落已经完成。

前端配置定义为：

```ts
type SingleInstrumentDemoConfig = {
    readonly remoteCompletionUrl: string | null
    readonly previewAudioUrls: Partial<Record<InstrumentId, string>>
    readonly downloadUrls: Readonly<Record<InstrumentId, string>>
}
```

- `remoteCompletionUrl` 有值时，`↵ 前往下一页`导航到该地址；
- `remoteCompletionUrl` 为 `null` 时，导航到当前 Studio 的
  `?dawdex-complete=1&instrument={INSTRUMENT}` 本地完成页；该页面只从查询参数恢复已完成的
  乐器身份，不恢复中途生成状态；
- `downloadUrls` 默认指向三个随前端提供的静态演示 MIDI：
  `/dawdex/demo/drums-single-track.mid`、
  `/dawdex/demo/bass-single-track.mid`、
  `/dawdex/demo/keys-single-track.mid`；
- 三个演示 MIDI 必须来自已授权素材，不能由旧模板合成；来源记录放在
  `/dawdex/demo/provenance.json`；
- 下载使用浏览器原生下载，不调用后端。

## 11. 视觉语言

- 副屏继续使用现有深色磷光屏、扫描线和像素/等宽字体；
- 主色只用于当前乐器、当前段落和播放状态；
- 已完成、当前、未完成必须同时通过形态与明度区分，不能只靠颜色；
- 进入房间、生成完成和回车按下使用短促反馈；
- 不增加装饰性卡片、营销文案或风格推荐；
- `prefers-reduced-motion` 下取消闪烁和位移动画，但保留状态切换；
- 点击目标不小于 44 × 44 CSS px；
- 副屏图标支持键盘焦点和清晰的 `aria-label`。

## 12. 组件边界

新增纯前端模块，避免继续扩大 `AgentOverlay.tsx` 的职责：

### `SingleInstrumentFlow`

- 持有并验证状态机；
- 生成下一段固定指令；
- 处理继续、重播、重新生成、换乐器与完成；
- 不依赖 `AgentClient`、`DawProjectAdapter` 或 `RealUiEventBridge`。

### `SingleInstrumentFlowView`

- 渲染副屏与状态化键帽；
- 把图标、回车键和其他操作转为状态机命令；
- 调用前端 Mock 定时器与可选预览音频；
- 向外发出 `roomChanged`、`playingChanged` 和 `completed` 视图事件。

### `AgentOverlay` 集成层

- 在产品形态首次进入时挂载该流程；
- 根据 `roomChanged` 复用现有房间素材和 `setRoom`；
- 根据 `playingChanged` 复用现有房间视频与角色播放表现；
- 在流程期间隐藏旧 Prompt、旧干预键和审批抽屉；
- 保留工作台与设置入口；
- 不改变现有 Agent 与 DAW 执行路径。

## 13. 生命周期与降级

- 页面刷新后回到 `selecting`，不恢复半途进度；
- 组件卸载时清理生成定时器、播放计时器和 `HTMLAudioElement`；
- 重复点击乐器或继续不能创建并行定时器；
- 本地预览音频加载失败时显示 `PREVIEW UNAVAILABLE`，但仍完成视觉播放流程；
- 静态下载资源不存在时不伪装成功，副屏显示 `DOWNLOAD UNAVAILABLE`；
- 房间视频失败时继续使用现有静态房间图；
- 进入工作台再返回产品形态时，当前前端流程状态保留在同一页面会话中。

## 14. 测试

### 单元测试

- 三个乐器映射到正确房间；
- 只能按 Intro、Verse、Chorus、Bridge 前进；
- 每次 Mock 生成完成后自动进入 `playing`；
- Intro、Verse、Chorus 的回车键进入正确下一段；
- Bridge 的回车键进入完成态；
- 重新生成不增加已完成段落；
- 换乐器确认后清空全部状态；
- 取消换乐器恢复此前状态；
- `remoteCompletionUrl` 的远端与本地两种导航；
- 文案中不存在旧的干预标签；
- 组件卸载后没有残留定时器或音频。

### DOM 与交互测试

- 副屏图标点击和键盘 `Enter` 均可选择乐器；
- 选择后主屏与副屏同步切换；
- 生成期间继续键不可重复触发；
- 播放态只出现当前状态允许的键帽；
- 大回车键不再调用 Undo；
- 完成页显示单乐器、单轨和 `04 / 04`；
- 下载选择当前乐器对应的静态 URL。

### 浏览器验收

在 Studio 产品形态中分别走通 Drums、Bass、Keys：

1. 首屏直接看到三个副屏图标；
2. 点击后进入正确房间并自动生成 Intro；
3. Intro 完成后自动播放；
4. 连续点击 `↵ 继续`完成 Verse、Chorus、Bridge；
5. 每段播放时主屏房间不变；
6. 旧 Prompt、旧干预和审批入口不干扰流程；
7. 换乐器确认后主屏回大厅且进度归零；
8. 完成页可从头播放、下载并进入本地完成页；
9. 键盘操作、缩放和 reduced-motion 行为正确；
10. 浏览器控制台无新增错误。

## 15. 验收标准

- 首次交互发生在键盘副屏的三个乐器图标上。
- 主屏与副屏始终显示同一个乐器房间状态。
- 四个段落严格按 Intro、Verse、Chorus、Bridge 生成。
- 每段生成完成后自动播放。
- 用户通过大回车键“继续”，不需要“接受”。
- 旧的通用干预文案和撤销行为不出现在该流程。
- 自动预填不会改变乐器或段落顺序。
- 换乐器一定回到起点并清空旧进度。
- 下载和下一页跳转都能在无后端环境下操作。
- 实现不修改 Agent、MIDI 检索或 openDAW 执行链。
