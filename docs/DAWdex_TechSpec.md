# DAWdex 技术方案

## openDAW + 音乐意图编译器 + 多角色 Agent 编排

| 项目 | 当前原型 | 黑客松目标 |
|---|---|---|
| 音乐引擎 | openDAW Studio | 保持 |
| UI | 浏览器内全屏遮罩与 Agent 侧栏 | 角色乐队舞台 |
| Agent | OpenAI Agents SDK + 本地 Planner | Provider 抽象、角色任务 |
| 动作 | Tempo、四种固定 Pattern | MusicBrief、检索、变体、循环调度 |
| 音乐素材 | 确定性音符生成 | 高质量 MIDI 库 |
| 桌面封装 | 未完成 | P2，Demo 不依赖 |

## 一、代码基线

当前 DAWdex 原型位于：

```text
opendaw/
├─ packages/app/studio/src/agent/
│  ├─ AgentClient.ts
│  ├─ AgentOverlay.tsx
│  ├─ AgentOverlay.sass
│  ├─ AgentProtocol.ts
│  ├─ DawProjectAdapter.ts
│  ├─ LocalMusicPlanner.ts
│  └─ LocalMusicPlanner.test.ts
└─ packages/server/dawdex-agent/
   ├─ src/server.ts
   ├─ .env.example
   └─ package.json
```

Studio 默认请求：

```text
POST http://localhost:8787/v1/plan
```

请求：

```json
{
  "prompt": "副歌更炸一点，但不要太满",
  "snapshot": {
    "hasProject": true,
    "bpm": 120,
    "tracks": [
      {
        "name": "Keys",
        "trackCount": 1,
        "regionCount": 1
      }
    ]
  }
}
```

网络、HTTP 或 Schema 失败时，`AgentClient` 自动调用 `LocalMusicPlanner`。

## 二、当前协议

```ts
type DawAction =
    | {
        readonly type: "set-tempo"
        readonly bpm: number
    }
    | {
        readonly type: "create-instrument"
        readonly name: string
        readonly pattern: "bass" | "chords" | "pulse" | "lead"
        readonly startBar: number
        readonly bars: number
        readonly rootMidi: number
        readonly velocity: number
        readonly density: number
    }
```

当前 `compilePattern` 使用固定四和弦循环和确定性规则。它适合验证工程写入，但不能承担正式音乐生成。

## 三、目标数据模型

### ProjectSnapshot

```ts
type ProjectSnapshot = {
    readonly transport: {
        readonly isPlaying: boolean
        readonly bpm: number
        readonly timeSignature: readonly [number, number]
        readonly loopStartPpqn: number
        readonly loopLengthPpqn: number
    }
    readonly harmony: {
        readonly key: string
        readonly scale: string
        readonly chordProgression: ReadonlyArray<string>
    }
    readonly tracks: ReadonlyArray<TrackSnapshot>
}
```

后续快照必须读取实际音符摘要，而不是只统计 Region 数量：

```ts
type TrackSnapshot = {
    readonly id: string
    readonly role: MusicRole | "unknown"
    readonly name: string
    readonly instrument: string
    readonly range: readonly [number, number]
    readonly regions: ReadonlyArray<RegionSnapshot>
}
```

### MusicBrief

```ts
type MusicBrief = {
    readonly requestId: string
    readonly selectedAudienceIntent: {
        readonly originalText: string
        readonly normalizedText: string
        readonly summary: string
        readonly score: number
    }
    readonly global: {
        readonly bpm: number
        readonly key: string
        readonly scale: string
        readonly timeSignature: readonly [number, number]
        readonly bars: 4 | 8
        readonly energy: number
        readonly tension: number
        readonly preserve: ReadonlyArray<string>
    }
    readonly roleTasks: ReadonlyArray<RoleTask>
}
```

### RoleTask

```ts
type RoleTask = {
    readonly id: string
    readonly role: MusicRole
    readonly professionalSummary: string
    readonly listenerExplanation: string
    readonly operation: MusicOperation
    readonly constraints: ReadonlyArray<string>
    readonly confidence: number
}
```

### MusicOperation

MVP 只开放有界操作：

```ts
type MusicOperation =
    | RetrieveAndTransformMidi
    | CreatePattern
    | ReplaceRoleTrack
    | ChangeRoleDensity
    | ChangeVoicing
    | SetTempo
```

不允许模型生成任意函数名、脚本或文件路径。

## 四、弹幕管线

```text
RawDanmaku[]
→ normalizeText
→ repairTranscription
→ rejectGarbage
→ deduplicate
→ clusterIntent
→ scoreCandidate
→ ProducerDecision
```

### NormalizedDanmaku

```ts
type NormalizedDanmaku = {
    readonly id: string
    readonly source: "human" | "ai-fan" | "preset"
    readonly rawText: string
    readonly normalizedText: string
    readonly language: string
    readonly createdAtMs: number
}
```

第一版不需要复杂向量数据库。少量弹幕可以使用模型或 Embedding 加阈值聚类；单用户 Demo 可以直接跳过聚类，但数据结构必须保留来源。

### ProducerScore

```ts
type ProducerScore = {
    readonly relevance: number
    readonly consensus: number
    readonly feasibility: number
    readonly novelty: number
    readonly continuity: number
    readonly total: number
}
```

评分结果用于解释选中原因，不展示模型私有思维链。

## 五、Agent 编排

### 稳定模式

一次请求返回完整 `MusicBrief`：

```text
prompt + project snapshot
→ Producer Agent
→ structured MusicBrief
→ Zod validation
→ role messages staged in UI
```

优点：

- 一次模型延迟；
- 全局约束一致；
- 角色不互相打架；
- 适合现场 Demo。

### 独立角色模式

后续：

```text
Producer Brief
  ├─ Drummer Agent
  ├─ Bassist Agent
  ├─ Keyboard Agent
  └─ Lead Agent
        ↓
Arranger merge
        ↓
Producer approval
```

即使独立调用同一个基础模型，只要上下文、职责、输出和生命周期独立，也可以视为多 Agent。若一次调用同时写完全部角色，只称多角色编排。

## 六、Provider 与 Runtime

### 配置

```ts
type ProviderConfig = {
    readonly id: "openai" | "qwen" | "custom"
    readonly protocol: "responses" | "chat-completions"
    readonly baseUrl: string
    readonly model: string
    readonly apiKeyRef: string
}
```

`apiKeyRef` 指向服务端或未来 Electron Main 的安全存储，不包含 Key 本身。

### API Runtime

必须验证：

- 目标路径是 `/responses` 还是 `/chat/completions`；
- Tool Calling；
- Structured Outputs 或可靠 JSON；
- 流式事件格式；
- 错误响应；
- 超时与取消；
- 模型 ID。

“OpenAI-compatible”不是充分条件。

### CLI Runtime

可参考 Open Design 的 Runtime Adapter：

```text
detect binary
→ detect auth
→ launch child process
→ send prompt through stdin
→ parse JSONL/plain stream
→ normalize AgentEvent
→ capture session id
→ cancel/resume
```

Codex CLI 目标命令形态：

```text
codex exec --json --output-schema <schema> --sandbox read-only
```

CLI Runtime 只返回结构化计划，不直接修改 openDAW，也不使用 `danger-full-access`。

### Demo 决策

- 默认：OpenAI API；
- 回退：LocalMusicPlanner；
- P1：千问/自定义中转；
- P2：Codex CLI 等本地 Runtime。

## 七、MIDI 素材库

### 元数据

每个素材至少包含：

```ts
type MidiAssetMetadata = {
    readonly id: string
    readonly path: string
    readonly role: MusicRole
    readonly styleTags: ReadonlyArray<string>
    readonly moodTags: ReadonlyArray<string>
    readonly bpm: number
    readonly key: string
    readonly scale: string
    readonly timeSignature: readonly [number, number]
    readonly bars: number
    readonly energy: number
    readonly density: number
    readonly pitchRange: readonly [number, number]
    readonly license: string
    readonly source: string
    readonly redistributionAllowed: boolean
}
```

### 检索

MVP 可以使用加权打分：

```text
role match       30%
style/mood       25%
key/scale        15%
energy/density   15%
bars/meter       10%
bpm               5%
```

调性和 BPM 可以变换，因此不是绝对拒绝条件；拍号和角色必须严格匹配。

### 变体

允许的第一版变换：

- transpose；
- octave fit；
- crop/repeat to 4 or 8 bars；
- quantize；
- velocity curve；
- density reduction；
- last-bar variation；
- motif inversion 或受限 pitch substitution。

每次变换保留：

```ts
type MidiTransformReceipt = {
    readonly sourceAssetId: string
    readonly seed: number
    readonly operations: ReadonlyArray<MidiTransformOperation>
}
```

这样可以复现，也能避免每次都添加同一段固定音乐。

## 八、质量闸门

### 硬校验

代码检查：

- BPM 30–240；
- 4/4 Demo；
- 4 或 8 小节；
- Note position/duration 有效；
- Pitch 0–127 且符合角色音域；
- Velocity 0–1；
- 与工程 Key/Scale 一致或属于允许的经过音；
- Track 数和同时发声密度不超限；
- 加入位置是下一量化边界。

### 软校验

候选评分：

- 意图符合；
- 与已有轨道互补；
- 过度重复检测；
- 结尾是否支持循环；
- 能量变化是否达到目标。

软校验失败可以选择第二候选，不应无限重试模型。

## 九、循环调度

逐轨体验的关键状态：

```ts
type RolePlaybackState =
    | "waiting"
    | "planning"
    | "preparing"
    | "queued"
    | "performing"
    | "failed"
```

调度：

```text
role task ready
→ compile MIDI
→ quality gate
→ calculate next loop boundary
→ queue openDAW edit
→ apply region
→ verify
→ set role performing
```

第一版可以先顺序创建所有 Region，再按进入时间安排播放或显示；无论实现方式如何，听觉进入点和角色状态必须一致。

## 十、UI 事件

```ts
type AgentUiEvent =
    | { readonly type: "danmaku.received"; readonly item: NormalizedDanmaku }
    | { readonly type: "producer.selected"; readonly decision: ProducerDecision }
    | { readonly type: "brief.ready"; readonly brief: MusicBrief }
    | { readonly type: "role.started"; readonly taskId: string }
    | { readonly type: "role.ready"; readonly taskId: string }
    | { readonly type: "role.queued"; readonly taskId: string }
    | { readonly type: "role.performing"; readonly taskId: string }
    | { readonly type: "plan.failed"; readonly error: PublicAgentError }
```

Renderer 只消费稳定事件，不解析 SDK 或 CLI 的原始输出。

## 十一、API 与安全

- Server 只监听 `127.0.0.1`；
- CORS 只允许 Studio Origin；
- Body 大小受限；
- Prompt 和 Schema 有最大长度；
- 所有外部输入视为 `unknown`；
- Key 不进入响应、日志和 UI；
- `.env` 不提交；
- 不发送完整工程文件和未授权 MIDI；
- 错误返回公开消息，详细堆栈仅在开发日志。

## 十二、测试

### Unit

- 中文转写纠错与乱码拒绝；
- 去重和来源标记；
- Producer 评分；
- MusicBrief Schema；
- MIDI 检索权重；
- 移调、长度、音域和变体；
- 循环边界计算；
- 本地 Planner；
- 计划到角色文案的确定性映射。

### Contract

- Agent Server Request/Response；
- Provider Responses/Chat Completions；
- RoleTask → MusicOperation；
- MusicOperation → openDAW Adapter；
- UI Event 判别联合。

### Integration

- 模型返回合法计划；
- 模型返回非法 JSON；
- API 超时转本地回退；
- 三轨依次创建；
- Undo 恢复；
- 旧 Loop 在新轨失败时继续。

### Demo Smoke

固定测试：

```text
输入：“像最终 Boss 一样炸，但保留钢琴和弦”
→ 制作人采用
→ Drums/Bass/Keys 三个任务
→ 三条可编辑轨道
→ 统一 4 小节
→ 在循环中依次进入
→ Undo 成功
```

## 十三、实现顺序

### Phase 0：当前原型

- [x] openDAW 可运行；
- [x] Agent 全屏层；
- [x] Prompt → Plan；
- [x] OpenAI Server；
- [x] Local fallback；
- [x] openDAW 写入；
- [x] Undo。

### Phase 1：可展示的音乐意图编译

- [ ] 修复全部中文 UI 编码；
- [ ] MusicBrief/RoleTask Schema；
- [ ] 制作人、总编曲师、鼓手、贝斯手、键盘手工作回执；
- [ ] 对话从结构化任务派生；
- [ ] 专业术语与通俗解释。

### Phase 2：逐轨舞台

- [ ] 角色状态；
- [ ] 固定基础 Loop；
- [ ] 轨道按顺序进入；
- [ ] 角色 Loop 动画；
- [ ] 新轨加入与动画同步。

### Phase 3：质量与素材

- [ ] MIDI 素材索引；
- [ ] 检索与至少三种变换；
- [ ] 音域/调性/长度硬校验；
- [ ] 固定安全回退；
- [ ] 过度重复检测。

### Phase 4：集成与提交

- [ ] 90 秒固定脚本；
- [ ] 现场冷启动测试；
- [ ] 模型断网测试；
- [ ] 预录视频；
- [ ] README 与提交材料；
- [ ] 打包或固定本地启动方式。
