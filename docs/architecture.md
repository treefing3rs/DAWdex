# DAWdex Architecture Breakdown

> 产品定位：直接操控 DAW 的 Codex-like Electron Agent App。
> v0.1：Ableton Live + 现有 Ableton MCP。
> 设计重点：Agent Runtime 可替换、音乐 UX 独立、DAW 写操作安全串行。

---

## 一、模块总览

```text
┌───────────────────────────────────────────────────────────┐
│ Experience                                                │
│                                                           │
│ Conversation  DAW Context  Plan  Roles  Tool Calls       │
│ Range  Approvals  Action Log  Before/After  Transport     │
└──────────────────────┬────────────────────────────────────┘
                       │ typed IPC
┌──────────────────────▼────────────────────────────────────┐
│ Desktop Host                                              │
│                                                           │
│ SessionService  EventHub  ApprovalService  ProcessManager │
└───────────┬───────────────────────────────┬───────────────┘
            │                               │
            ▼                               ▼
┌────────────────────────┐       ┌──────────────────────────┐
│ Agent Runtime Adapter  │       │ MCP Client Manager       │
│                        │       │                          │
│ Loop / LLM / Tasks     │       │ Lifecycle / Tools        │
│ Skills / Subagents     │       │ Permissions / Events     │
└───────────┬────────────┘       └────────────┬─────────────┘
            │                                 │
            └──────────────┬──────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────┐
│ Music Application Layer                                  │
│                                                           │
│ Intent → Role Proposals → Plan → Execution → Verification │
└──────────────────────┬────────────────────────────────────┘
                       ▼
┌───────────────────────────────────────────────────────────┐
│ Ableton Adapter → ableton-mcp → Remote Script → Live API │
└───────────────────────────────────────────────────────────┘
```

---

## 二、分层职责

### Experience Layer

负责：

- 对话；
- DAW Context；
- 计划；
- Tool Call；
- Agent Roles；
- Approval；
- Action Log；
- Before / After；
- Transport。

不负责：

- Agent 推理；
- MCP；
- 进程管理；
- 文件系统；
- API Key；
- 直接操作 Ableton。

### Desktop Host

Electron Main Process，负责：

- 应用生命周期；
- 可信本地能力；
- typed IPC；
- Runtime / MCP 子进程；
- Session；
- EventHub；
- 设置与凭据；
- 恢复。

### Agent Runtime Layer

负责：

- 多轮会话；
- LLM；
- Agent Loop；
- Tools；
- Skills；
- Task；
- Subagent；
- Approval 请求；
- Cancel；
- Event Stream。

该层通过 Adapter 隔离具体 OpenCode-like 实现。

### Music Application Layer

负责：

- 音乐意图；
- 角色定义；
- 计划；
- 冲突消解；
- 权限与风险；
- DAW 操作语义；
- 结果解释。

它是产品差异的核心，不能塞进 Runtime Prompt 的一大段字符串后失去类型和测试。

### MCP Layer

负责：

- 连接 MCP Server；
- Tools；
- Capability；
- 生命周期；
- 原始事件；
- Tool Result。

### Ableton Adapter

负责：

- 把音乐动作映射到 MCP Tool；
- 串行队列；
- 参数校验；
- 写后读回；
- Timeout reconciliation；
- Partial Success；
- 连接诊断。

---

## 三、模块依赖

允许：

```text
Renderer → shared-contracts
Main → session / runtime-port / mcp-client
Music Application → music-domain / ports
Ableton Adapter → daw-port / mcp-client
Runtime Adapter → runtime-port
```

禁止：

```text
Renderer → Electron Node API
Renderer → MCP Client
Renderer → Runtime Process
Music Domain → Electron
Music Domain → OpenCode internal API
Music Domain → Ableton MCP raw tool
Role Agent → direct concurrent DAW writes
Danmaku Skill → direct MCP writes
```

---

## 四、核心模块

### SessionService

```ts
export interface SessionService {
  create(input: CreateSessionInput): Promise<MusicAgentSession>;
  resume(sessionId: string): Promise<void>;
  send(input: SendMessageInput): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  approve(decision: ApprovalDecision): Promise<void>;
  get(sessionId: string): Promise<MusicAgentSession>;
}
```

职责：

- 连接 UI 与 Runtime；
- 关联 DAW Context；
- 保存会话；
- 归一事件；
- 管理当前任务。

### EventHub

把：

- Runtime Event；
- MCP Event；
- Queue Event；
- Approval Event；
- DAW Context Event；

映射为稳定的 `AgentUiEvent`。

### ProcessManager

管理：

- Agent Runtime；
- Ableton MCP；
- 启动；
- 停止；
- 重启；
- 健康检查；
- stdout / stderr；
- 退出清理。

不允许出现：

- 同时多个 ableton-mcp 实例争抢连接；
- App 退出后残留子进程；
- Renderer 自己启动进程。

### RuntimeAdapter

隔离具体开源 Agent。

Runtime 变更时，以下模块不应改动：

- Renderer；
- MusicIntent；
- AgentPlan；
- Ableton Adapter；
- Approval UI；
- Action Log。

### MusicDirector

主 Orchestrator：

```ts
export interface MusicDirector {
  understand(
    request: UserMusicRequest,
    context: DawContextSnapshot
  ): Promise<MusicIntent>;

  plan(
    intent: MusicIntent,
    proposals: RoleProposal[]
  ): Promise<AgentPlan>;
}
```

### RoleRegistry

```ts
export type MusicAgentRole =
  | "music_director"
  | "composer"
  | "arranger"
  | "drum_player"
  | "bass_player"
  | "keys_player"
  | "guitar_player"
  | "mix_engineer"
  | "qa_auditor";
```

每个角色定义：

- 目标；
- 输入；
- 输出 schema；
- 可见工具；
- 禁止事项；
- 是否允许请求 DAW 写入。

默认只有 Music Director 能提交最终写计划。

### PlanCompiler

把 Role Proposal 合并为：

- 有序步骤；
- 依赖；
- 影响范围；
- Approval；
- Verification；
- 用户解释。

### ApprovalService

负责：

- 请求；
- 用户选择；
- 一次性批准范围；
- 过期；
- 拒绝；
- 日志。

### DawCommandQueue

唯一 DAW 写入口。

保证：

- FIFO；
- 依赖；
- Cancel Pending；
- 每步状态；
- 一个时间只有一个写 Tool Call；
- 写后 Verification；
- 错误停止策略。

### VerificationService

写后读取：

- Track 是否存在；
- Device 是否加载；
- Clip 是否创建；
- Note 数是否合理；
- Arrangement 是否出现；
- 播放头是否移动；
- 实际结果是否符合 Plan。

### ActionLogService

记录：

```text
Request
→ Understanding
→ Role Proposals
→ Plan
→ Approval
→ Tool Calls
→ Verification
→ Result
```

---

## 五、端到端数据流

### Flow 1：连接

```text
App starts
→ ProcessManager checks ableton-mcp
→ MCP Client initializes
→ tools discovered
→ Ableton diagnostic read
→ ConnectionState emitted
→ Renderer shows project
```

### Flow 2：修改请求

```text
User selects Bar 9–16
→ sends request
→ SessionService captures fresh DAW Context
→ Runtime invokes Music Director
→ role proposals
→ PlanCompiler
→ Plan shown in UI
→ Approval
→ Queue
→ MCP tools
→ read-back verification
→ Action Log
→ preview range
```

### Flow 3：部分失败

```text
Drums verified
→ Bass tool timeout
→ Queue pauses dependent steps
→ Verification reads Bass track
  ├─ actual change exists → continue, mark timeout reconciled
  └─ no change → mark failed, skip dependent steps
→ UI shows succeeded / failed / not executed
```

### Flow 4：继续修改

```text
User: “鼓很好，但和弦太亮”
→ previous session context retained
→ fresh DAW snapshot
→ target narrowed to Keys
→ new Plan
→ new Approval
```

### Flow 5：弹幕 Demo

```text
Preset danmaku
→ Danmaku Input Adapter
→ aggregated UserMusicRequest
→ same Music Director / Plan / Queue / Verify flow
```

弹幕不维护独立执行链。

---

## 六、Agent 角色协作

### 读共享 Snapshot

每个角色读取同一个不可变 `DawContextSnapshot`，避免分析过程中工程状态漂移。

### 输出 Proposal

角色只输出建议：

```ts
export interface RoleProposal {
  role: MusicAgentRole;
  targetRange: BarRange;
  summary: string;
  actions: ProposedMusicAction[];
  preserve: string[];
  conflicts: string[];
  confidence: number;
}
```

### 合并

Music Director：

1. 检查目标范围；
2. 保留约束；
3. 解决密度冲突；
4. 合并重复操作；
5. 生成依赖；
6. 评估风险；
7. 输出 Plan。

### 执行

角色 Agent 不直接并行操作 Ableton。所有动作进入单队列。

### v0.1 降级

若 Runtime 不支持真实 Subagent：

- 使用一个 Runtime Session；
- 角色作为独立结构化 Prompt；
- 顺序生成 Proposal；
- UI 如实标记为 Role Task；
- 不伪装并行。

---

## 七、权限模型

### Read

- 获取 Session；
- Track；
- Clip；
- Arrangement；
- Browser；
- Connection。

可配置为自动。

### Reversible Write

- 新建 Track；
- 新建 Clip；
- 写入新 Clip；
- 新增 Arrangement 片段；
- 加载原生音色。

v0.1 默认确认。

### Important Write

- 删除；
- 覆盖；
- 修改全局 Tempo；
- 保存工程；
- 批量更改；
- 第三方脚本。

始终确认。

### 未支持

如果底层缺少可逆性，UI 不显示“Undo 已保证”。

---

## 八、Mock 策略

### Mock Runtime

产生固定 Event Stream：

```text
assistant.delta
plan.updated
approval.requested
tool.requested
tool.completed
session.completed
```

UI 不等待 Runtime 选型。

### Mock MCP

内存 Ableton 状态：

- Tracks；
- Devices；
- Clips；
- Notes；
- Arrangement；
- Transport。

支持注入：

- success；
- timeout but applied；
- failure；
- stale response；
- partial write。

### Mock Roles

固定：

- Arranger Proposal；
- Drum Proposal；
- Bass Proposal；
- Guitar Proposal。

### Real Ableton

只在集成阶段使用，避免 UI 开发依赖 Ableton 一直开着。

---

## 九、Agent Runtime 选型阶段

### 不在选型前做的事

- 不 fork 大量 Runtime 代码；
- 不修改业务类型迁就某个 Runtime；
- 不把 Session ID 当产品 ID；
- 不让 Renderer 解析 CLI 文本；
- 不依赖未公开内部 API。

### Spike 输出

每个候选输出：

- 能力表；
- 许可证；
- Windows 结果；
- MCP 结果；
- Event 样例；
- Approval；
- Cancel；
- Session resume；
- 子 Agent；
- 集成复杂度；
- 建议。

### ADR

最终在 `docs/adr/agent-runtime-selection.md` 记录决定。

---

## 十、单人最小实现路径

```text
1. Electron Shell + typed IPC
2. Mock Runtime + Codex-like UI
3. MCP Client + Ableton Diagnose
4. DAW Context Panel
5. Real Runtime Adapter
6. Music Director single-agent flow
7. Plan + Approval
8. Serial Queue + Verification
9. Fixed Arrange Demo
10. Before / After
11. Role Tasks
12. Danmaku Skill
```

如果时间不足，先砍：

1. 真实并行子 Agent；
2. Mix Engineer；
3. 弹幕；
4. Session 搜索；
5. 复杂时间线；
6. 音频监听；
7. 多 DAW。

不能砍：

- Electron；
- Agent Runtime；
- Ableton MCP；
- Context；
- Plan；
- Approval；
- Queue；
- Verification；
- Before / After。

---

## 十一、架构决策记录

### ADR-001：产品是 DAW Agent，而非弹幕产品

弹幕是 Skill。主入口是用户对话和 DAW 工程。

### ADR-002：Electron

需要本地进程、MCP、Agent Runtime、文件与凭据管理，因此采用桌面 Host。

### ADR-003：Runtime 可替换

具体开源 Agent 未定，先定义 Port，避免 UI 和音乐领域绑定。

### ADR-004：MCP 为 DAW 连接层

复用现有 Ableton MCP，不从零开发 Live API 控制栈。

### ADR-005：多 Agent 分析可并行，DAW 写入必须串行

保护底层单 Socket 请求 / 响应和工程一致性。

### ADR-006：计划与确认是核心 UX

不是额外安全弹窗，而是音乐制作中“先听懂再动手”的产品价值。

### ADR-007：验证独立于执行

工具返回不是最终真相，必须读回工程。
