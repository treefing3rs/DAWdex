# DAWdex 技术方案

> 基线：0.3.0 / PR #17
> 适用范围：当前真实 MIDI 垂直切片，以及下一阶段完整歌曲扩展

## 一、技术边界

| 层 | 当前 0.3.0 | 下一阶段 |
|---|---|---|
| Product State | 当前 openDAW Snapshot | 持久 Song Blueprint、锁定和版本 |
| Planning | Creative Brief + AgentPlan | Song Plan + Section/Phrase Patch |
| Retrieval | SQLite 检索真实 MIDI | motif/riff family、相似度和风格增强 |
| Transformation | 裁剪、循环、音域、基础 MIDI Transform | 有来源的动机发展 |
| Sound | Vaporisateur + Mixer + Effects | Instrument & Sound Catalog |
| Execution | 角色轨道 upsert + 通用 DAW 控制 | 面向 Section 的 Patch Executor |
| Validation | Schema、ID、Capability、Quality Gate | 结构、重复度、能量曲线与锁定范围 |
| UI | 真实事件、角色与六房间 | 编曲白板、Section 状态和物件热点 |

生产规划路径必须检索和导入已有 MIDI。不得使用旧 `PatternCompiler` 或固定 Bass/Chord/Pulse/Lead 模板合成替代音符。

## 二、代码地图

```text
opendaw/
├─ packages/server/dawdex-agent/
│  └─ src/
│     ├─ server.ts
│     ├─ CodexAppServer.ts
│     ├─ LocalRuntime.ts
│     ├─ LocalCliProviders.ts
│     ├─ MusicPlan.ts
│     ├─ MidiCatalog.ts
│     ├─ MidiBundleRanker.ts
│     └─ index-midi.ts
└─ packages/app/studio/src/agent/
   ├─ AgentClient.ts
   ├─ AgentProtocol.ts
   ├─ AgentOverlay.tsx
   ├─ DawProjectAdapter.ts
   ├─ DawCapabilityRegistry.ts
   ├─ DawControlExecutor.ts
   ├─ LocalMusicPlanner.ts
   ├─ RealUiEventBridge.ts
   ├─ ui-contract.ts
   └─ music/
      ├─ MidiAsset.ts
      ├─ QualityGate.ts
      └─ TrackSound.ts
```

## 三、运行接口

Agent Server 默认监听 `http://127.0.0.1:8787`。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/v1/provider/status` | Codex/OpenAI/Local 状态 |
| `POST` | `/v1/provider/codex/login` | 发起 ChatGPT/Codex 登录 |
| `POST` | `/v1/plan` | 一次性返回 Plan |
| `POST` | `/v1/plan/stream` | NDJSON 返回进度与 Plan |
| `GET` | `/v1/midi-assets/:id` | 下载目录中已授权的 MIDI |

计划请求：

```json
{
  "prompt": "副歌更有力量，但保留 Keys",
  "snapshot": {
    "hasProject": true,
    "bpm": 120,
    "tracks": [],
    "transport": {
      "playing": false,
      "position": 0,
      "loopEnabled": true,
      "loopFrom": 0,
      "loopTo": 4
    },
    "capabilities": {
      "commands": ["transport", "track", "region", "effect"],
      "instruments": [],
      "midiEffects": [],
      "audioEffects": []
    }
  }
}
```

请求体限制为 64 KiB；默认允许来源为 `http://localhost:8080`。

## 四、Provider

环境变量：

```text
DAWDEX_AGENT_PROVIDER=auto|codex|openai
DAWDEX_AGENT_PORT=8787
DAWDEX_STUDIO_ORIGIN=http://localhost:8080
DAWDEX_CODEX_CWD=<optional isolated planning cwd>
OPENAI_API_KEY=<optional>
OPENAI_MODEL=<optional>
OPENAI_BASE_URL=<optional>
```

`auto` 顺序：

```text
authenticated Codex app-server
→ configured OpenAI-compatible API
→ Studio LocalMusicPlanner fallback
```

`CodexAppServer` 负责：

- 发现和启动 `codex app-server`；
- 查询账号、套餐和速率限制；
- 发起 ChatGPT 登录；
- 创建/继续规划线程；
- 解析结构化输出；
- 超时、退出与待处理请求清理。

浏览器不直接执行 CLI，也不保存 Codex 或 OpenAI 密钥。

## 五、MIDI 数据库

### 数据事实

```text
midi/easy/                      194,553 files
midi/.dawdex/catalog.sqlite     local generated index
validated rows                  193,320
roles                           drums | bass | keys
```

索引命令：

```bash
cd opendaw
npm run index:midi -w @dawdex/agent-server
```

数据库不提交 Git。Agent Server 完整打开时应输出大约：

```text
DAWdex opened 193320 indexed MIDI assets
```

### 检索契约

`MidiCatalog`：

1. 根据 role 和 Creative Brief 查询；
2. 使用结构化特征排序；
3. 去除重复 fingerprint；
4. 给模型少量精确候选；
5. 校验模型返回的 Asset ID 与路径；
6. 只允许 `/v1/midi-assets/:id` 读取目录内资产。

模型不能浏览整个目录，也不能编造文件路径。

### 数据库策略

第一阶段不需要人工标记全部文件，也不需要通用向量数据库。自动索引优先：

```text
role
track count
bar length / meter / tempo hint
pitch range / density / polyphony
rhythm and onset fingerprint
key / scale / chord hints
duplicate and quality state
```

后续只对难以结构化的风格、情绪和相似听感增加 Embedding，并将代表性片段聚合为 motif/riff family。

## 六、当前规划数据

### Creative Brief

当前 Brief 包含：

```ts
type MusicBrief = {
    intent: "create" | "add" | "restyle" | "modify"
    style: string
    styleAlternatives: readonly string[]
    moods: readonly string[]
    decisionSummary: string
    instrumentation: readonly string[]
    bpm: number
    key: string
    bars: 4 | 8
    energy: number
    swing: number
    preserveTrackIds: readonly string[]
    targetRoles: readonly ("drums" | "bass" | "keys")[]
}
```

风格字段是开放字符串；Dubstep、R&B 只是测试和 Profile 示例，不是 Schema 上限。

### 角色轨道动作

```ts
type UpsertRoleTrackAction = {
    type: "upsert-role-track"
    mode: "create" | "replace"
    targetTrackId: string | null
    role: "drums" | "bass" | "keys"
    style: string
    startBar: number
    bars: number
    rootMidi: number
    seed: number
    density: number
    energy: number
    midiAssetId: string
    midiAssetPath: string
    sound: TrackSoundDesign
}
```

约束：

- `replace` 只能指向当前 Snapshot 中的 DAWdex 生成轨道；
- 用户轨道和 `preserveTrackIds` 不得修改；
- Asset ID/Path 必须来自给定候选；
- 不同角色使用不同 seed；
- Keys 不放入 Bass 音区；
- 一轮动作总数不超过 8。

### 音色

`TrackSoundDesign` 当前使用：

```text
Vaporisateur parameters
+ mixer volume/pan/mute/solo
+ 0..4 role-appropriate effects
```

模型必须给 drums、bass、keys 设计不同音色，并避免 Sub Bass 上的宽立体声和过量 Reverb。

## 七、通用 DAW 控制

```ts
type DawControlAction = {
    type: "control"
    command:
        | "transport" | "loop" | "track" | "region"
        | "midi-transform" | "instrument" | "effect"
        | "device-parameter" | "automation"
        | "bus" | "send" | "routing"
    operation: string
    targetTrackId: string | null
    targetRegionId: string | null
    targetDeviceId: string | null
    targetBusId: string | null
    assetId: string
    parameters: readonly DawControlParameter[]
    points: readonly DawAutomationPoint[]
}
```

支持矩阵以 `DawCapabilityRegistry.ts` 为准。关键规则：

- Track/Region/Device/Bus 使用 Snapshot 精确 ID；
- Instrument 与 Effect 使用 Capability 白名单；
- Soundfont/Nano/Playfield/Apparat 必须给工程内 Asset ID；
- Automation 至少两个点，值归一化到 0..1；
- Quantize 只允许 4/8/16/32；
- Humanize 使用确定 seed；
- 所有工程修改合并为一个 Undo 事务。

## 八、MIDI 导入与质量闸门

```text
GET /v1/midi-assets/:id
→ MidiAsset parser
→ select/merge usable note events
→ fit requested bars
→ role range and octave adaptation
→ QualityGate
→ create/replace openDAW Region
```

允许的变换：

- loop/crop；
- 按小节适配；
- 八度与角色音域适配；
- 受控 transpose、velocity、quantize、humanize。

不允许把选中 MIDI 丢弃后用固定模板重新生成音符。

## 九、UI 契约

当前 `ui-contract.ts` 的下行事件：

```text
DanmakuReceived
ProducerSelected
RoleTaskAssigned
RoleStateChanged
TransportChanged
TrackAudibleChanged
OperationResult
```

上行意图：

```text
DanmakuSubmit
UserIntervention
```

关键不变量：

```text
RoleStateChanged(performing)
    does not prove audible playback

TrackAudibleChanged(audible=true)
    unlocks performing animation
```

Mock 与真实桥共用事件签名。Mock 只能通过 `?mock=1` 或 `↻` 启动。

## 十、完整歌曲扩展契约

### Song Blueprint

第一版建议：

```ts
type SongBlueprint = {
    id: string
    revision: number
    title: string
    tempo: number
    meter: readonly [number, number]
    key: string
    style: string
    targetBars: number
    energyCurve: readonly number[]
    sections: readonly SongSection[]
    lockedSectionIds: readonly string[]
}

type SongSection = {
    id: string
    kind: "intro" | "verse" | "pre-chorus" | "chorus"
        | "bridge" | "breakdown" | "outro" | "custom"
    startBar: number
    bars: number
    energy: number
    roleIds: readonly string[]
    phraseIds: readonly string[]
}
```

### Song Patch

```ts
type SongPatch = {
    id: string
    baseRevision: number
    targetSectionIds: readonly string[]
    preserveSectionIds: readonly string[]
    operations: readonly SongOperation[]
    rationale: readonly string[]
}
```

必须验证：

- `baseRevision` 与当前 Blueprint 一致；
- target 与 preserve 不冲突；
- locked Section 不被修改；
- Section 不重叠且覆盖有效小节；
- Phrase 记录来源 Asset 和 transforms；
- Patch 翻译为现有 openDAW 动作后仍通过 Capability；
- 一次 Patch 可整体撤销。

### 新 UI 事件

现有 v0.1 事件不重做，只做增量：

```text
BlueprintChanged
SectionChanged
SectionLocked
PhraseDeveloped
```

控制室编曲白板消费这些事件，不自行推测歌曲结构。

## 十一、音色目录扩展

正式 Instrument & Sound Catalog 与 MIDI Catalog 分离：

```ts
type SoundProfile = {
    id: string
    roles: readonly string[]
    styles: readonly string[]
    instrumentKind: string
    assetId: string | null
    preset: Record<string, number | string | boolean>
    effectProfileIds: readonly string[]
    range: readonly [number, number]
    available: boolean
    license: string
}
```

浏览器路径：

- SF2/SoundFont：先导入工程资产；
- WAV/AIFF：先导入后交给 Nano/Playfield；
- Synth：使用 openDAW 设备与安全参数；
- 本机 AU/VST：未来必须通过单独的本地 Bridge，不直接开放浏览器文件/插件访问。

## 十二、安全与隐私

- API Key 只通过 Agent Server 环境变量；
- Codex 认证由本机 app-server 管理；
- Prompt 和 Snapshot 只发送计划所需字段；
- MIDI 下载只允许目录内 ID；
- 不允许模型调用文件、Shell 或网络工具；
- 不允许模型发出未经 Capability 校验的任意内部操作；
- AI 弹幕和本地回退必须明确标识。

## 十三、验证

改变 Agent、MIDI 或执行路径后运行：

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
npm run build -w @opendaw/app-studio
npm run test -w @opendaw/app-studio
git diff --check
```

纯文档变更至少运行：

```bash
git diff --check
```

涉及完整资料库时，另外确认 Agent Server 日志打开约 193,320 个索引资产。没有该日志，不能声称完整 MIDI 检索已经启用。
