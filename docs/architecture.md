# DAWdex 系统架构

本文回答系统如何分层、数据如何流动：DAWdex 在用户意图与真实 openDAW 工程之间，靠哪些组件完成计划、检索、审批、写入与回滚，以及当前实现与下一阶段的边界在哪里。

## 一、架构结论

DAWdex 的核心不是某一个模型、MIDI 数据库或动画界面，而是中间的调度与约束层：

```text
用户意图
   ↓
Product State + Planning + Retrieval + Validation
   ↓
受控 openDAW 操作
   ↓
真实工程与声音
   ↓
可解释的虚拟录音棚反馈
```

这个 Harness 决定模型看见什么状态、可以调用什么能力、能修改哪些对象、何时需要审批、如何验证、如何撤销，以及哪些事实可以驱动前端。

正在接入的最小产品展示路径是：

```text
选择 Drums / Bass / Keys 中的一种乐器
→ 创建一条可编辑轨道
→ Intro → Verse → Chorus → Bridge
→ 显示段落、播放与完成状态
```

当前公有分支没有这条路径所需的 Flow、View 和演示 MIDI 资产。当前能运行的是固定 Drums、Bass、Keys 三角色 Guided Demo；它直接派发 UI 事件，不调用实时 Agent/MIDI/DAW 写入。

下面的 Agent、MIDI 和通用 DAW 模块均可在源码中核对，但完整资料库端到端运行依赖 Git 之外的本地授权 MIDI 与生成索引。

## 二、Agent/MIDI 技术架构

```text
┌────────────────────────────────────────────────────────────┐
│ Studio UI                                                  │
│ AgentOverlay · rooms · danmaku · evidence · interventions  │
└───────────────────────┬────────────────────────────────────┘
                        │ AgentClient
                        ▼
┌────────────────────────────────────────────────────────────┐
│ DAWdex Agent Server                                        │
│ Provider status/login · Creative Brief · Plan · MIDI API   │
├───────────────────────┬────────────────────────────────────┤
│ Codex app-server      │ OpenAI-compatible API              │
│ ChatGPT account       │ environment configuration          │
└───────────────────────┴──────────────┬─────────────────────┘
Agent Server
  → MidiCatalog / catalog.sqlite
  → exact MIDI candidates
  → structured AgentPlan

Approved AgentPlan
  → DawProjectAdapter
  → MidiAsset parser
  → TrackSound
  → DawControlExecutor
  → one openDAW undo transaction

openDAW state
  → RealUiEventBridge
  → UiEvent
  → visible room / role / transport / evidence state
```

### Studio 侧

| 文件 | 责任 |
|---|---|
| `AgentOverlay.tsx` | 输入、Plan 审批、舞台、房间、证据、Provider 与工作台切换 |
| `AgentClient.ts` | `/v1/plan`、Provider 和登录请求 |
| `AgentProtocol.ts` | Snapshot、Plan 与 DAW Action 数据结构 |
| `DawProjectAdapter.ts` | 读取工程并应用生成轨道事务 |
| `DawCapabilityRegistry.ts` | 支持命令、设备与操作白名单 |
| `DawControlExecutor.ts` | 执行通用 DAW 控制 |
| `RealUiEventBridge.ts` | 将真实工程状态翻译为 UI 事件 |
| `ui-contract.ts` | 前端与 Agent/openDAW 的事件边界 |
| `music/MidiAsset.ts` | 下载并解析选中的真实 MIDI |
| `music/TrackSound.ts` | 创建合成器、Mixer 和效果链 |

### Agent Server 侧

| 文件 | 责任 |
|---|---|
| `server.ts` | HTTP API、Provider 路由、Brief/Plan 编排和 MIDI 下载 |
| `CodexAppServer.ts` | 启动与控制本机 Codex `app-server` |
| `LocalRuntime.ts` | 本地 CLI 运行时扫描、选择、进程管理与严格路由 |
| `LocalCliProviders.ts` | Codex/Kimi/Qoder 三种本地 CLI 运行时的适配定义 |
| `MidiBundleRanker.ts` | 对角色 MIDI 检索捆绑做生成质量排序 |
| `MidiCatalog.ts` | SQLite 检索、排序和去重 |
| `MusicPlan.ts` | Schema、Prompt 和模型输出解析 |
| `index-midi.ts` | 构建本地 MIDI 索引 |

## 三、Agent/MIDI 计划主链

仓库已有构成下列链路的组件实现；这张图是代码路径，不是 clean clone 的完整资料库运行证明：

```text
natural-language request
→ current openDAW snapshot
→ Creative Brief
→ SQLite retrieval over real MIDI
→ small candidate list with exact IDs/paths
→ arranger chooses assets, sound and controls
→ schema/capability validation
→ user approval
→ create/replace generated role tracks
→ apply extra DAW controls
→ one undo transaction
→ resnapshot and emit real UI events
```

正式主链不允许使用旧 `PatternCompiler` 或固定 Bass/Chord/Pulse/Lead 模板合成替代音符。旧模块只能保留为历史测试证据，不能被描述为生产检索路径。

## 四、Provider 架构

Provider 选择由 `DAWDEX_AGENT_PROVIDER` 控制；浏览器只调用受控 HTTP 接口。

仓库还包含本地 CLI 运行时适配器（`LocalRuntime.ts` + `LocalCliProviders.ts`）。它属于 Agent 路径代码证据，不是当前 Guided Demo 的实时来源。

Codex 集成不是在浏览器里直接运行 CLI 命令。Agent Server 管理本机 `codex app-server` 的进程、登录、请求、超时和结束状态，浏览器只调用受控 HTTP 接口。

模型负责：

- 理解用户开放风格、情绪与目标；
- 生成 Creative Brief；
- 在候选中选择素材；
- 提出受控的编排、音色和工程动作；
- 给出用户可理解的理由。

模型不负责：

- 自行浏览文件系统；
- 编造 MIDI 路径或设备 ID；
- 绕过审批直接修改工程；
- 声称尚未发生的操作已经成功。

## 五、MIDI 检索架构

Git 只跟踪 `midi/easy/README.md`，不分发授权 MIDI 文件；`catalog.sqlite` 也是忽略的本地生成物。下图只有在本地配置资料并完成索引后才能运行：

```text
midi/easy/
→ index-midi.ts
→ midi/.dawdex/catalog.sqlite
→ MidiCatalog.search()
→ role-compatible candidates
→ fingerprint deduplication
→ MidiBundleRanker bundle ranking
→ model-visible short list
```

结构化音乐数据优先使用 SQLite，而不是先构建通用向量数据库：

- 路径、角色、长度、轨数和文件有效性是精确字段；
- 节奏、密度、音域和 fingerprint 可以自动提取；
- 风格与听感 Embedding 只在结构化检索不足时补充；
- 人工审核集中在高质量家族和异常样本，不逐条标注 19 万文件。

`194,553` 是本地资料清单记录，`193,320` 是一次本地索引环境记录。两者都不是 clean clone 可直接复现的仓库资产数。

## 六、音乐执行与安全边界

### 角色轨道

`upsert-role-track` 有两种模式：

- `create`：该角色没有 DAWdex 生成轨道；
- `replace`：替换现有生成轨道的 Region 和声音设计。

目标必须是已知生成轨道。用户轨道和 `preserveTrackIds` 不得被覆盖。

### 通用控制平面

技术控制契约包括：

| 命令 | 操作 |
|---|---|
| transport | play / pause / stop / seek |
| loop | set |
| track | rename / delete / enable / disable |
| region | move / resize / rename / mute / unmute / duplicate / delete |
| midi-transform | transpose / velocity / quantize / humanize |
| instrument | replace |
| effect | add / update / remove / move / enable / disable |
| device-parameter | set |
| automation | replace / clear |
| bus | create / update / delete |
| send | upsert / remove |
| routing | set-output |

每个动作使用 Snapshot 中的精确 Track、Region、Device、Bus 和 Asset ID，并经过 Capability Registry 验证。模型不能直接获得任意 openDAW 内部对象访问权。

### 事务

- 用户审批后的工程修改合并为一个 Undo 步骤；
- 即时 Transport 操作不伪装成工程 Undo；
- 任一动作失败时回滚本轮事务；
- 之前的可播放工程保持不变。

## 七、音色架构

技术声音设计路径使用 Vaporisateur：

```text
MIDI asset
→ role-aware synth parameters
→ mixer volume / pan
→ restrained effect chain
→ openDAW track
```

openDAW 的能力目录还包括 Soundfont、Nano、Playfield、MIDIOutput 和 Apparat，但依赖外部资产的设备只有在工程 Snapshot 中存在兼容 Asset ID 时才允许选择。

未来独立的 Instrument & Sound Catalog 负责：

```text
style + role + range + mood
→ instrument family
→ asset/preset
→ mixer/effects profile
→ license/availability
```

MIDI 检索和音色映射保持解耦。

## 八、UI 事件架构

前端只消费结构化事件，不解析模型自由文本：

```text
DanmakuReceived
ProducerSelected
RoleTaskAssigned
RoleStateChanged
TransportChanged
TrackAudibleChanged
OperationResult
```

真实性规则：

- `RoleStateChanged(performing)` 只能表示角色意图；
- `TrackAudibleChanged(audible=true)` 才允许点亮实际演奏；
- Pause/Stop 冻结或撤销播放动作；
- 每条回执使用 Plan ID 或 Operation Reference 追踪。

房间、角色和动画属于“音乐状态翻译层”，不拥有 Agent、MIDI 或 DAW 业务逻辑。

当前 `mock-timeline.ts` 按相同事件签名驱动 Drums、Bass、Keys 三角色 Guided Demo。它不调用 `AgentClient`、`MidiCatalog` 或 `DawProjectAdapter.apply()`，因此 UI 中出现 `TrackAudibleChanged` / `OperationResult` 不能被讲成真实三轨工程写入。

PR #12 增加可收起外壳：根节点收起后让 Pointer Event 穿透到原本一直存活的
openDAW，`RealUiEventBridge` 仍按 500 ms 同步。它没有创建第二个 DAW，也
不复制工程状态，只是在动画录音棚与同一底层工作台之间切换视图。

## 九、完整歌曲目标架构

单乐器、单轨、四段落仍是正在接入的展示切片。完整歌曲需要在其后增加多乐器、多轨道与持久的 Song 层：

```text
┌──────────────────────────────────────────────┐
│ Song State Store                             │
│ Blueprint · locks · versions · user intent   │
└───────────────────────┬──────────────────────┘
                        ▼
┌──────────────────────────────────────────────┐
│ Song Planner                                 │
│ Section graph · energy curve · role tasks    │
└───────────────────────┬──────────────────────┘
                        ▼
┌──────────────────────────────────────────────┐
│ Phrase Planner / Retrieval                   │
│ motif family · MIDI candidates · transforms │
└───────────────────────┬──────────────────────┘
                        ▼
┌──────────────────────────────────────────────┐
│ Patch Validator                              │
│ scope · harmony · repetition · capability    │
└───────────────────────┬──────────────────────┘
                        ▼
              current openDAW executor
```

统一层级：

```text
Song Blueprint
└── Section
    └── Phrase
        └── Region
            └── Notes
```

### Song Patch

后续动作不应让模型直接重写整首歌，而应产生受控 Patch：

```ts
type SongPatch = {
    id: string
    targetSectionIds: readonly string[]
    preserveSectionIds: readonly string[]
    operations: readonly SongOperation[]
    rationale: readonly string[]
}
```

第一组 `SongOperation` 应覆盖：

- create/move/duplicate/delete/lock section；
- replace/develop phrase；
- assign/reassign role；
- update energy、density 和 instrumentation；
- apply approved openDAW actions。

### 评价闭环

每个 Patch 执行后重新读取工程，评价：

- Section 长度与顺序；
- 能量曲线和段落对比；
- 动机来源与变化；
- 重复率和留白；
- 角色音域与和声冲突；
- 用户锁定是否被尊重。

## 十、失败与恢复

| 故障 | 行为 |
|---|---|
| Asset 不存在或解析失败 | 拒绝执行该 Plan |
| Capability/ID 非法 | Validator 拒绝动作 |
| 工程动作失败 | 回滚本轮事务 |
| 轨道没有确认可听 | 角色不进入演奏 |

## 十一、边界

DAWdex 继续复用 openDAW 的时间线、设备、音频引擎和工程模型，不重新制造 DAW。

DAWdex 的产品方向负责：

- 面向完整歌曲的持久状态；
- 自然语言到受控 Patch 的编译；
- 真实 MIDI 检索和有来源的音乐变换；
- 能力、审批、事务和质量闸门；
- 工程状态到动画录音棚的因果翻译。

这条边界让 Agent 可以发挥音乐判断，又不会获得无约束地破坏工程的自由。
