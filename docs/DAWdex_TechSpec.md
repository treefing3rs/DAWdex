# DAWdex 技术方案
## Electron + Open Agent Runtime + Ableton MCP

> 版本：v0.1 Hackathon MVP
> 日期：2026-07-23
> 状态：架构已确定，Agent Runtime 具体实现待 Spike 后选型

---

## 一、系统总览

DAWdex 是 MCP Host，也是一个为音乐制作定制的桌面 Agent UI。

```text
┌──────────────────────────────────────────────────────────────┐
│ Electron Renderer                                           │
│                                                              │
│ Conversation | DAW Context | Plan | Roles | Tool Calls      │
│ Range Select | Action Log | Before/After | Transport         │
└───────────────────────┬──────────────────────────────────────┘
                        │ typed IPC
┌───────────────────────▼──────────────────────────────────────┐
│ Electron Main / Application Host                            │
│                                                              │
│ Session Service     Approval Service     Project Store       │
│ Agent Runtime Host  Event Stream         Process Manager      │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                ▼                               ▼
┌─────────────────────────────┐   ┌────────────────────────────┐
│ Open Agent Runtime Adapter  │   │ MCP Client Manager         │
│                             │   │                            │
│ LLM / Loop / Tools / Tasks  │   │ Tool registry / lifecycle  │
│ Subagents / Skills / Events │   │ stdio or local process     │
└──────────────┬──────────────┘   └──────────────┬─────────────┘
               │                                 │
               └──────────────┬──────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ ableton-mcp Python Server                                   │
│                ↓ TCP JSON 127.0.0.1:8765                    │
│ AbletonMCP Remote Script                                    │
│                ↓ Live API                                   │
│ Ableton Live 12                                             │
└──────────────────────────────────────────────────────────────┘
```

### 核心边界

- Renderer 只负责 UI；
- Main Process 是本地可信 Host；
- Agent Runtime 负责推理循环，不直接拥有 UI；
- MCP Client Manager 负责工具连接；
- Ableton 写操作经过单一执行队列；
- 音乐领域规则位于独立 package；
- 弹幕只是输入适配器 / Skill。

---

## 二、建议技术栈

### Desktop

| 层 | 建议 |
|---|---|
| Shell | Electron |
| Renderer | React + TypeScript |
| Build | Vite |
| UI State | Zustand 或 reducer |
| Validation | Zod |
| Local DB | SQLite 或 v0.1 JSON store |
| Test | Vitest + Playwright |
| Packaging | Electron Forge 或 Electron Builder，Spike 后选择 |

### Agent

具体 Runtime 待选，但必须满足能力合同：

- 开源且可嵌入或可作为子进程运行；
- 多轮 Session；
- 流式事件；
- Provider 可替换；
- Tool Calling；
- MCP Client 或可接入 MCP；
- Approval / Cancellation；
- Skills / System Prompt；
- 子任务或子 Agent；
- 会话持久化；
- Windows 可运行；
- 许可证允许产品集成。

候选方向包括 OpenCode-like Agent Runtime。不要在选型完成前把业务代码绑定到某个内部 API。

### DAW

v0.1：

- Ableton Live 12；
- 已有 `ableton-mcp`；
- Ableton Remote Script；
- localhost TCP 8765。

后续：

- FL Studio Adapter；
- Reaper Adapter；
- MIDI 文件 Adapter。

---

## 三、Electron 进程设计

### Main Process

负责：

- 应用生命周期；
- Window；
- 本地配置；
- Agent Runtime 子进程；
- MCP Server 子进程；
- IPC；
- 文件系统；
- 安全存储；
- Session persistence；
- 日志；
- 自动恢复。

### Renderer Process

负责：

- 对话；
- DAW Context；
- Plan；
- Tool Call；
- Approval；
- Roles；
- Action Log；
- Transport 控制；
- Settings。

Renderer 禁止：

- 直接 `spawn`；
- 直接读写任意文件；
- 直接持有 API Key；
- 直接连接 localhost socket；
- 直接调用 Ableton MCP；
- 导入 Node 内置模块。

### Preload

只暴露白名单 API：

```ts
export interface MusicAgentDesktopApi {
  session: {
    create(input: CreateSessionInput): Promise<SessionSummary>;
    sendMessage(input: SendMessageInput): Promise<void>;
    cancel(sessionId: string): Promise<void>;
    approve(input: ApprovalDecision): Promise<void>;
    subscribe(
      listener: (event: AgentUiEvent) => void
    ): () => void;
  };
  daw: {
    diagnose(): Promise<DawDiagnostic>;
    refreshContext(): Promise<DawContextSnapshot>;
    control(command: TransportCommand): Promise<void>;
  };
  settings: {
    read(): Promise<PublicSettings>;
    update(patch: PublicSettingsPatch): Promise<PublicSettings>;
  };
}
```

不向 Renderer 暴露通用 `ipcRenderer.send(channel, payload)`。

### Utility / Child Process

Agent Runtime 和 MCP Server 建议运行在独立进程：

- 崩溃不带走 UI；
- 可单独重启；
- stdout / stderr 可采集；
- 可设置工作目录和环境变量；
- 可限制暴露接口；
- 可以检测僵尸进程。

---

## 四、Monorepo 结构

```text
/
├─ apps/
│  └─ desktop/
│     ├─ src/main/
│     ├─ src/preload/
│     └─ src/renderer/
├─ packages/
│  ├─ agent-runtime/
│  │  ├─ ports.ts
│  │  ├─ runtime-adapter.ts
│  │  └─ candidates/
│  ├─ mcp-client/
│  ├─ ableton-adapter/
│  ├─ music-domain/
│  │  ├─ intent/
│  │  ├─ planning/
│  │  ├─ roles/
│  │  └─ schemas/
│  ├─ session-domain/
│  ├─ shared-contracts/
│  └─ test-fixtures/
├─ skills/
│  ├─ music-director/
│  ├─ arranger/
│  ├─ composer/
│  ├─ players/
│  ├─ mix-engineer/
│  └─ danmaku-arrangement/
├─ docs/
├─ third_party/
│  └─ ableton-mcp-upstream/
└─ package.json
```

依赖方向：

```text
renderer → shared-contracts
main → session-domain / agent-runtime / mcp-client
ableton-adapter → mcp-client / music-domain
agent-runtime → shared-contracts / ports
music-domain → 无 Electron、无 React、无具体 Runtime
```

---

## 五、Agent Runtime Adapter

### 为什么必须抽象

当前只确定使用 OpenCode-like 开源 Agent，尚未确定：

- 嵌入库还是启动 CLI / Server；
- Provider；
- Session 格式；
- MCP 支持方式；
- 子 Agent 模型；
- Event Stream 格式。

因此先定义产品所需合同。

### Runtime Port

```ts
export interface AgentRuntimePort {
  start(config: AgentRuntimeConfig): Promise<void>;
  stop(): Promise<void>;
  createSession(input: CreateRuntimeSessionInput): Promise<string>;
  resumeSession(sessionId: string): Promise<void>;
  send(input: RuntimeUserMessage): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  approve(decision: RuntimeApprovalDecision): Promise<void>;
  subscribe(listener: (event: RuntimeEvent) => void): Unsubscribe;
  getCapabilities(): Promise<RuntimeCapabilities>;
}
```

### 必需事件

```ts
export type RuntimeEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "assistant.delta"; sessionId: string; text: string }
  | { type: "plan.updated"; plan: AgentPlan }
  | { type: "task.started"; task: AgentTask }
  | { type: "tool.requested"; call: ToolCallRequest }
  | { type: "approval.requested"; approval: ApprovalRequest }
  | { type: "tool.completed"; result: ToolCallResult }
  | { type: "subagent.started"; agent: AgentRoleRun }
  | { type: "subagent.completed"; agent: AgentRoleRun }
  | { type: "session.completed"; summary: string }
  | { type: "session.failed"; error: PublicAgentError };
```

### Runtime Spike

每个候选必须完成同一 Spike：

1. 创建 Session；
2. 使用两个不同 Provider；
3. 注册一个 Mock Tool；
4. 连接 Ableton MCP；
5. 流式显示 Tool Call；
6. 发起 Approval；
7. Cancel；
8. 恢复 Session；
9. 运行一个子任务；
10. Windows 打包后运行。

### 选择矩阵

| 维度 | 权重 |
|---|---:|
| MCP 集成 | 20% |
| 可嵌入与事件流 | 20% |
| Session / Cancel / Approval | 15% |
| Provider 可替换 | 10% |
| 子 Agent / Skill | 10% |
| Windows 稳定性 | 10% |
| 许可证 | 10% |
| 维护活跃度 | 5% |

---

## 六、MCP Host 与 Ableton Adapter

### MCP 角色

DAWdex 是 MCP Host：

- 管理 MCP Client；
- 启动或连接 MCP Server；
- 获取 Tools；
- 把 Tools 注册给 Agent Runtime；
- 对工具做权限分级；
- 把 Tool Call 事件映射到 UI。

### Ableton 连接

当前：

```text
MCP executable:
C:\Users\27751\.local\bin\ableton-mcp.exe

Host:
127.0.0.1

Port:
8765
```

### 已验证工具类别

读取：

- `get_session_info`
- `get_track_info`
- `get_arrangement_clips`
- `get_browser_tree`
- `get_browser_items_at_path`

写入：

- `create_midi_track`
- `set_track_name`
- `create_clip`
- `add_notes_to_clip`
- `set_clip_name`
- `duplicate_to_arrangement`
- `load_instrument_or_effect`
- `load_drum_kit`
- `set_tempo`

播放：

- `switch_to_arrangement_view`
- `set_arrangement_time`
- `start_playback`
- `stop_playback`
- `fire_clip`
- `stop_clip`

### 工具包装

不要把原始 MCP Tool 直接暴露给音乐角色。

上层使用稳定动作：

```ts
export interface DawMusicPort {
  inspectProject(): Promise<DawContextSnapshot>;
  inspectRange(range: BarRange): Promise<DawRangeContext>;
  createTrack(input: CreateMusicTrackInput): Promise<DawWriteReceipt>;
  createClip(input: CreateMusicClipInput): Promise<DawWriteReceipt>;
  writeNotes(input: WriteNotesInput): Promise<DawWriteReceipt>;
  loadSound(input: LoadSoundInput): Promise<DawWriteReceipt>;
  placeInArrangement(input: PlaceClipInput): Promise<DawWriteReceipt>;
  verify(receipt: DawWriteReceipt): Promise<VerificationResult>;
  preview(range: BarRange): Promise<void>;
}
```

Adapter 负责把它们映射到 MCP。

---

## 七、DAW Context

### Snapshot

```ts
export interface DawContextSnapshot {
  capturedAt: string;
  connection: {
    daw: "ableton-live";
    version?: string;
    host: string;
    port: number;
  };
  transport: {
    tempoBpm: number;
    timeSignature: [number, number];
    isPlaying: boolean;
    currentBeat: number;
  };
  tracks: DawTrackSummary[];
  arrangement: DawClipSummary[];
  selection?: BarRange;
}
```

### Track

```ts
export interface DawTrackSummary {
  index: number;
  name: string;
  type: "midi" | "audio" | "return" | "master" | "unknown";
  devices: string[];
  clips: DawClipSummary[];
  role?: MusicTrackRole;
}
```

### Context Policy

- 每个任务开始时读取；
- 写操作后局部刷新；
- 长任务在关键阶段重新读取；
- UI 显示 snapshot 时间；
- Agent 不假设 Track Index 永远不变；
- 优先通过稳定标识与名称再次确认。

---

## 八、音乐意图与计划

### UserMusicRequest

```ts
export interface UserMusicRequest {
  text: string;
  target?: {
    range?: BarRange;
    sectionName?: string;
    trackNames?: string[];
  };
  constraints: {
    preserve: string[];
    avoid: string[];
    allowedTracks?: string[];
  };
  mode: "plan_only" | "apply_after_approval";
}
```

### MusicIntent

```ts
export interface MusicIntent {
  targetRange: BarRange;
  goals: {
    energyDelta?: number;
    densityDelta?: number;
    tensionDelta?: number;
    emotionalDirection?: string;
  };
  preserve: MusicReference[];
  trackIntent: TrackIntent[];
  confidence: number;
  assumptions: string[];
  clarificationNeeded: boolean;
}
```

### AgentPlan

```ts
export interface AgentPlan {
  id: string;
  requestId: string;
  understanding: string;
  assumptions: string[];
  targetRange: BarRange;
  steps: PlanStep[];
  affectedTracks: string[];
  preserve: string[];
  risk: "read_only" | "reversible_write" | "important_write";
  requiresApproval: boolean;
  status: "draft" | "awaiting_approval" | "running" | "completed" | "failed";
}
```

### PlanStep

```ts
export interface PlanStep {
  id: string;
  ownerRole: MusicAgentRole;
  description: string;
  operation: MusicOperation;
  dependencies: string[];
  verification: VerificationSpec;
}
```

---

## 九、多 Agent Orchestration

### 推荐模型

```text
User
  ↓
Music Director
  ├─ Composer task
  ├─ Arranger task
  ├─ Drum Player task
  ├─ Bass Player task
  ├─ Guitar Player task
  └─ Mix Engineer task
  ↓
Plan Merge
  ↓ User Approval
  ↓
Single DAW Execution Queue
  ↓
QA / Verification
```

### 角色输出

角色 Agent 默认输出结构化建议，不直接调用写工具：

```ts
export interface RoleProposal {
  role: MusicAgentRole;
  summary: string;
  actions: ProposedMusicAction[];
  constraints: string[];
  confidence: number;
}
```

Music Director 负责：

- 去重；
- 冲突；
- 排序；
- 预算；
- 形成最终 Plan。

### 并发限制

可以并行：

- 读取同一 Snapshot 后的角色分析；
- Composer 与 Arranger 的建议；
- 不同 Player 的 MIDI proposal；
- QA 规则检查。

禁止并行：

- Ableton 写操作；
- 轨道创建与立即依赖其 index 的写入；
- 设备加载与后续设备参数读取；
- 播放头移动和播放控制序列。

---

## 十、执行队列

### Queue

```ts
export interface DawCommandQueue {
  enqueue(command: DawCommand): Promise<DawCommandReceipt>;
  cancelPending(reason: string): void;
  subscribe(listener: (event: DawQueueEvent) => void): Unsubscribe;
}
```

### 每个写操作

```text
validate input
→ wait for dependencies
→ execute MCP tool
→ store raw response
→ read back DAW state
→ compare expectation
→ emit verified / partial / failed
```

### 超时

超时不等于失败。处理顺序：

1. 停止发送依赖写操作；
2. 读取当前 Track / Arrangement；
3. 判断操作是否已实际生效；
4. 若已生效，标记 `succeeded_after_timeout`；
5. 若未生效，再决定是否重试；
6. 不自动重复非幂等创建。

### Result

```ts
export interface DawWriteReceipt {
  commandId: string;
  toolName: string;
  requestedAt: string;
  completedAt?: string;
  rawStatus: "success" | "timeout" | "error";
  verificationStatus: "pending" | "verified" | "partial" | "failed";
  affectedEntities: DawEntityRef[];
}
```

---

## 十一、Approval 与安全

### Approval Policy

```ts
export type ApprovalMode =
  | "always_ask"
  | "ask_for_writes"
  | "ask_for_important"
  | "never_auto_write";
```

v0.1 默认 `ask_for_writes`。

### 重要操作

必须单独确认：

- 删除 Track / Clip / Note；
- 覆盖已有片段；
- 批量修改；
- 工程保存 / 另存；
- 导出覆盖；
- 改变全局 Tempo；
- 操作第三方插件；
- 运行外部脚本。

### Renderer Security

- `contextIsolation: true`；
- `nodeIntegration: false`；
- Preload 方法级白名单；
- IPC payload schema；
- 禁止任意 channel；
- 禁止加载远程页面作为主 UI；
- 外链在系统浏览器打开；
- CSP；
- API Key 只在 Main / Runtime；
- 子进程参数不拼接 shell 字符串。

---

## 十二、Session 与持久化

### Session

```ts
export interface MusicAgentSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  dawProjectIdentity?: DawProjectIdentity;
  runtimeSessionId?: string;
  messages: ConversationMessage[];
  plans: AgentPlan[];
  toolCalls: ToolCallRecord[];
  roleRuns: AgentRoleRun[];
  approvals: ApprovalRecord[];
}
```

### 本地保存

v0.1 保存：

- 会话；
- 用户设置；
- Runtime 选择；
- MCP 配置；
- Action Log；
- 最近工程摘要；
- Demo 状态。

不保存：

- Ableton 工程完整内容；
- 商业音频；
- 未经用户允许的 MIDI 副本；
- 明文 API Key。

### Secret

优先使用系统凭据存储。若 v0.1 未完成，允许只从环境变量读取，不允许写进 JSON。

---

## 十三、UI Event Model

Main 将 Runtime 和 MCP 事件归一为：

```ts
export type AgentUiEvent =
  | { type: "connection.changed"; value: ConnectionState }
  | { type: "context.updated"; value: DawContextSnapshot }
  | { type: "message.delta"; value: MessageDelta }
  | { type: "plan.updated"; value: AgentPlan }
  | { type: "role.updated"; value: AgentRoleRun }
  | { type: "tool.updated"; value: ToolCallRecord }
  | { type: "approval.requested"; value: ApprovalRequest }
  | { type: "action.logged"; value: ActionLogEntry }
  | { type: "session.completed"; value: SessionCompletion }
  | { type: "error"; value: PublicAppError };
```

Renderer 只消费该事件，不解析 Runtime 原始 stdout。

---

## 十四、弹幕 Skill

### 边界

弹幕只是 `Input Adapter + Skill`：

```text
DanmakuEvent[]
  → DanmakuAggregator
  → UserMusicRequest
  → 标准 DAWdex 流程
```

### 不单独维护第二套音乐引擎

弹幕功能不得：

- 绕过 Music Director；
- 直接调用 Ableton MCP；
- 使用独立 CueScript 后端与主产品割裂；
- 让 UI 主导航围绕直播设计。

### 输出示例

```json
{
  "text": "观众希望下一段先切一拍，再打开副歌，并让吉他做短回答。",
  "target": {
    "range": {
      "startBar": 8,
      "endBar": 16
    }
  },
  "constraints": {
    "preserve": ["lead theme"],
    "avoid": ["all tracks becoming dense"]
  },
  "mode": "apply_after_approval"
}
```

---

## 十五、现有 Ableton 能力与缺口

### 已验证

- 连接；
- 读取工程；
- 浏览音色；
- 加载原生设备；
- 创建 MIDI Track；
- 创建 Clip；
- 写入音符；
- 复制到 Arrangement；
- 播放与停止；
- 104 BPM / D minor / 32 小节多轨 Demo。

### 已知限制

- 删除 / 替换指定音符不完整；
- 精确编辑已有音符能力不足；
- 通用 Undo / Rollback 不完整；
- 保存新工程版本不完整；
- Arrangement Loop 不可靠；
- Automation 和混音控制不足；
- 第三方插件参数控制不足；
- 真实音频监听闭环未完成；
- 当前底层请求 / 响应在并行时可能错位。

### v0.1 设计响应

- 串行；
- 新建而非覆盖；
- 固定 Demo；
- 计划确认；
- 写后读回；
- Partial Success；
- 备用工程；
- 不宣传未验证能力。

---

## 十六、测试

### Unit

- Runtime Event 归一；
- IPC schema；
- MusicIntent；
- Plan；
- Role Proposal merge；
- Approval；
- Queue；
- Timeout reconciliation；
- Action Log；
- Danmaku → UserMusicRequest。

### Contract

所有 Runtime Adapter 通过：

- Session；
- Stream；
- Tool；
- Approval；
- Cancel；
- Resume；
- Capabilities。

所有 DAW Adapter 通过：

- Inspect；
- Write；
- Verify；
- Partial；
- Timeout；
- Preview。

### Integration

使用 Mock MCP：

```text
User message
→ Runtime
→ Plan
→ Approval
→ Tool Call
→ Queue
→ Mock Ableton state
→ Verification
→ UI Event
```

### Real Ableton Smoke

- App 启动；
- Diagnose；
- Get Session；
- Get Track；
- 创建测试 Track；
- 加载原生音色；
- 创建 Clip；
- 写小规模 MIDI；
- 复制 Arrangement；
- 读回；
- 播放；
- Stop。

### E2E

- 打开 App；
- 连接状态；
- 发送修改请求；
- 查看 Plan；
- Approve；
- 查看 Tool Call；
- Before / After；
- 新一轮修改；
- Cancel；
- 重开 Session。

---

## 十七、开发阶段

### Phase 0：Runtime Spike

- 两个候选；
- MCP；
- Event；
- Approval；
- Cancel；
- Windows；
- 选型记录。

### Phase 1：Desktop Shell

- Main / Preload / Renderer；
- typed IPC；
- Session；
- Settings；
- Process Manager。

### Phase 2：Ableton Host

- MCP lifecycle；
- Diagnose；
- Tool registry；
- DAW Context；
- Serial Queue；
- Verification。

### Phase 3：DAWdex

- Music Director Skill；
- Intent；
- Plan；
- Approval；
- Action Log；
- 固定编曲任务。

### Phase 4：Music UX

- Context Panel；
- Range；
- Roles；
- Tool Cards；
- Before / After；
- Transport。

### Phase 5：Demo

- 固定工程；
- 重置；
- 弹幕 Skill；
- 90 秒脚本；
- 备用视频。

---

## 十八、技术参考

- Electron Process Model：`https://www.electronjs.org/docs/latest/tutorial/process-model`
- Electron IPC：`https://www.electronjs.org/docs/latest/tutorial/ipc`
- Electron Context Isolation：`https://www.electronjs.org/docs/latest/tutorial/context-isolation`
- MCP Architecture：`https://modelcontextprotocol.io/docs/learn/architecture`
- OpenCode 候选参考：`https://github.com/anomalyco/opencode`
- Ableton MCP 本地参考：`third_party/ableton-mcp-upstream/`
