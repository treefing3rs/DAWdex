# DAWdex 系统架构

> 架构目标：把观众语言编译为受约束的音乐操作，并让同一份结构化决策同时驱动角色对话、MIDI 处理和 openDAW 执行。

## 一、总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│ Experience                                                   │
│ 全屏弹幕 · 角色对话 · 乐手状态 · 循环播放 · 用户干预        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Producer Orchestrator                                       │
│ 纠错/去重 · 聚类/评分 · 制作人裁决 · 全局 Music Brief       │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
┌───────────────▼──────────────┐  ┌────────────▼──────────────┐
│ Role Task Compiler           │  │ Agent Runtime Gateway     │
│ Arranger / Drums / Bass /    │  │ Local / OpenAI / Qwen /   │
│ Keys / Lead                  │  │ Compatible API / CLI      │
└───────────────┬──────────────┘  └────────────┬──────────────┘
                └───────────────┬───────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Music Material Engine                                        │
│ MIDI Index → Retrieve → Transform → Music Quality Gate       │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ openDAW Application Adapter                                  │
│ Plan Validation · Undo Transaction · Loop-boundary Schedule  │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ openDAW Project                                               │
│ Tracks · Note Regions · Instruments · Transport · Playback    │
└──────────────────────────────────────────────────────────────┘
```

## 二、当前实现

当前原型不是 Electron，也不再依赖外部 Ableton MCP。它由两部分组成：

```text
openDAW Studio（浏览器）
  → POST /v1/plan
  → 本地 DAWdex Agent Server
  → OpenAI Agents SDK
```

网络或模型失败时：

```text
openDAW Studio
  → LocalMusicPlanner
  → AgentPlan
```

`DawProjectAdapter` 将计划作为一次 openDAW 编辑事务应用，因此可以一步 Undo。

当前计划协议只允许：

- `set-tempo`；
- `create-instrument`；
- `bass | chords | pulse | lead` 四种 Pattern。

当前架构已经验证“自然语言计划可以写入内置 DAW”，但尚未实现正式音乐意图编译器、角色任务、MIDI 检索和循环调度。

## 三、核心边界

### Experience Layer

负责：

- 全屏弹幕；
- 制作人和乐手角色；
- 专业术语与通俗解释；
- 编译过程可视化；
- 轨道和角色状态；
- 用户批准、重做和撤销；
- Demo 叙事。

不负责：

- 保存 API Key；
- 调用模型供应商 SDK；
- 自己修改 openDAW 工程；
- 自己决定音乐硬规则；
- 根据自由文本伪造执行结果。

### Producer Orchestrator

负责：

- 转写纠错与乱码过滤；
- 弹幕去重、聚类和排序；
- 结合当前工程选择最有意义的意见；
- 发布唯一权威 `MusicBrief`；
- 合并角色建议；
- 批准可以进入音乐引擎的计划。

制作人评分至少考虑：

```text
relevance      与当前作品相关性
consensus      观众共识
feasibility    下一阶段可实现性
novelty        是否带来有效变化
continuity     是否破坏作品连续性
```

### Music Intent Compiler

负责把模糊语言转换为：

- 情绪与能量变化；
- BPM、调性、拍号和小节数；
- 保留项；
- 乐器角色任务；
- 可执行操作；
- 质量要求。

它是产品领域层，不等同于某一段 Prompt。模型、规则和 Schema 都只是实现手段。

### Role Layer

角色读取同一份不可变 `MusicBrief` 和当前工程快照，只能在各自职责内提出任务：

```ts
type MusicRole =
    | "producer"
    | "arranger"
    | "drummer"
    | "bassist"
    | "keyboardist"
    | "lead"
    | "mix-engineer"
```

角色工作回执是任务的可视化解释，不是私有思维链。

### Music Material Engine

负责：

- 素材元数据索引；
- 候选检索与排序；
- MIDI 解析；
- 移调、裁剪、量化、力度和音域适配；
- Motif 和结尾小节变体；
- 变换记录；
- 许可证信息。

### Music Quality Gate

模型负责审美建议，代码负责不让工程出事故。

硬规则：

- 单一权威 BPM、调性、拍号和循环长度；
- Clip 长度为 4 或 8 小节；
- 音域符合角色；
- 音符位置和长度合法；
- 新轨在量化边界进入；
- 音量和并发轨道受限；
- 无效输出不执行。

软规则可以由模型或评分器判断：

- 风格符合程度；
- 是否足够“炸”；
- 与观众意图的一致性；
- 与已有轨道的审美冲突；
- 是否过度重复。

### openDAW Adapter

唯一允许修改工程的入口。负责：

- 读取工程快照；
- 校验动作；
- 创建乐器、Region 和 Note Event；
- 将一组动作包装为一个 Undo 单元；
- 在循环边界调度；
- 执行后读回验证；
- 失败时保持已有 Loop 播放。

## 四、结构化数据是唯一事实源

正确：

```text
RoleTask JSON
  ├─→ UI 角色工作回执
  ├─→ MIDI 检索与变体
  └─→ openDAW 工程操作
```

禁止：

```text
模型生成漂亮角色台词
另一套随机算法生成无关音乐
```

示例：

```ts
type RoleTask = {
    readonly role: MusicRole
    readonly decision: string
    readonly listenerEffect: string
    readonly operation: MusicOperation
    readonly constraints: ReadonlyArray<string>
    readonly confidence: number
}
```

`decision` 用于专业工作回执，`listenerEffect` 用于给音乐小白的解释，`operation` 用于真实执行。

## 五、多角色与多 Agent

### Demo 默认模式

为了降低延迟和失败率：

1. 一次模型调用生成完整 Music Brief 和角色任务；
2. Schema 校验；
3. 前端按真实执行顺序逐个展示角色；
4. 角色任务依次进入素材引擎；
5. 制作人批准；
6. 轨道在循环边界加入。

这叫“多角色 Agent 编排”。

### 真正多 Agent 模式

后续可以：

1. 制作人生成 Music Brief；
2. 鼓手、贝斯手、键盘手分别调用独立 Agent；
3. 总编曲师合并冲突；
4. 制作人最终批准；
5. 所有工程写入仍串行。

多个角色不能并发写 openDAW。

## 六、Agent Runtime Gateway

目标 Gateway 同时支持：

```text
API Runtime
  ├─ OpenAI
  ├─ Qwen
  └─ Custom OpenAI-compatible

CLI Runtime
  ├─ Codex CLI
  ├─ Claude Code
  ├─ Qwen Code
  └─ OpenCode
```

所有 Runtime 必须归一为同一事件和最终 Schema。CLI 只产生计划，不能获得不必要的 Shell 或工程写权限。

黑客松默认使用直接 API，因为启动、授权和结构化输出更可控；CLI 是可选增强项。

## 七、端到端数据流

### 进入工程

```text
Studio starts
→ load fixed demo project
→ read tempo / instruments / regions
→ start base loop
→ renderer shows roles waiting
```

### 处理弹幕

```text
danmaku received
→ normalize transcription
→ deduplicate / cluster
→ producer scores candidates
→ selected intent displayed
```

### 编曲

```text
selected intent + project snapshot
→ MusicBrief
→ RoleTasks
→ schema validation
→ material retrieval
→ MIDI transformations
→ quality gate
→ executable AgentPlan
```

### 逐轨加入

```text
plan ready
→ wait for next loop boundary
→ create/apply one role track
→ verify
→ role becomes performing
→ continue previous loop
→ prepare next role
```

### 用户继续干预

```text
user: “鼓很好，但贝斯轻一点”
→ producer targets bassist
→ fresh project snapshot
→ replace or transform only bass task
→ next boundary applies revision
```

## 八、故障与回退

| 故障 | 回退 |
|---|---|
| Agent Server 不可用 | LocalMusicPlanner |
| API 超时 | 固定安全 Music Brief |
| Schema 不合法 | 一次修复请求，然后本地回退 |
| MIDI 候选为空 | 角色默认安全素材 |
| 质量闸门失败 | 不加入并选择下一个候选 |
| 新轨执行失败 | 旧 Loop 继续播放 |
| 动画加载失败 | 保留角色状态文字，不影响音乐 |
| 网络断开 | Demo 仍可使用本地路径 |

## 九、隐私与安全

- API Key 仅存在于本地 Agent Server 或未来 Electron Main；
- Renderer 不接触 Key；
- Prompt、弹幕和工程快照按最小必要范围发送；
- 不向模型发送完整音频；
- 不记录私有思维链；
- AI 乐迷明确标识；
- 素材许可证和来源进入索引；
- CLI Runtime 使用只读或隔离工作目录；
- 工程写入只经过 openDAW Adapter。

## 十、架构决策

### ADR-001：产品是互动 AI 虚拟乐队

弹幕不是附属 Skill，而是核心输入与舞台体验。DAW 是底层音乐引擎。

### ADR-002：基于 openDAW

内置音乐制作能力，避免现场依赖外部 Ableton、Remote Script 和 MCP。

### ADR-003：音乐意图编译器是领域层

不把核心能力压缩成不可测试的大段 Prompt。

### ADR-004：结构化指令驱动一切

角色对话、MIDI 变体和工程操作共享同一数据源。

### ADR-005：创意与安全分层

模型负责理解和创意，代码负责 BPM、调性、长度、音域、边界和音量。

### ADR-006：多角色优先于真实多 Agent

Demo 先保证稳定、可解释和低延迟，再扩展独立 Agent。

### ADR-007：轨道逐步加入

音乐持续循环，新轨只能在量化边界加入，角色状态与轨道状态同步。

### ADR-008：Runtime 可替换

OpenAI、千问、中转站和 CLI 均通过 Gateway，产品 Schema 不绑定供应商。

### ADR-009：早期 Ableton MCP 仅作验证材料

早期连接证明 Agent 可以控制音乐软件，但不再是当前产品执行链。
