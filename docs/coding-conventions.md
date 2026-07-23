# DAWdex 编码与架构规范

> 适用范围：Electron、Renderer、Agent Runtime Adapter、MCP、Ableton Adapter、音乐领域和测试。

---

## 一、目录规范

```text
apps/desktop/
├─ src/main/       # Electron Main
├─ src/preload/    # 白名单 bridge
└─ src/renderer/   # React UI

packages/
├─ shared-contracts/
├─ session-domain/
├─ music-domain/
├─ agent-runtime/
├─ mcp-client/
└─ ableton-adapter/

skills/
├─ music-director/
├─ composer/
├─ arranger/
├─ players/
├─ mix-engineer/
└─ danmaku-arrangement/
```

### 放置规则

- UI 不放 Agent 逻辑；
- Music Domain 不依赖 Electron；
- Runtime Adapter 不定义产品类型；
- MCP 原始类型不泄漏到 Renderer；
- Ableton Tool 映射只放 Adapter；
- Skill 内容不与基础设施混放；
- 弹幕不建立第二套执行架构。

---

## 二、命名

文件使用 kebab-case：

```text
runtime-adapter.ts
daw-command-queue.ts
action-log-panel.tsx
music-director.skill.md
```

类型使用 PascalCase：

```ts
interface DawContextSnapshot {}
type MusicAgentRole = "arranger";
class OpenAgentRuntimeAdapter {}
```

变量与函数使用 camelCase：

```ts
const activeSessionId = "...";
async function verifyDawWrite() {}
```

常量：

```ts
const DEFAULT_ABLETON_PORT = 8765;
```

Boolean：

```text
isConnected
hasPendingApproval
canApplyPlan
shouldRefreshContext
```

### 单位

名称必须携带单位：

```text
timeoutMs
tempoBpm
startBeat
durationBeats
receivedAt
```

---

## 三、TypeScript

### 严格模式

必须：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true
  }
}
```

### 外部输入

以下都视为 `unknown`：

- IPC payload；
- Runtime Event；
- MCP Result；
- LLM 输出；
- 本地 JSON；
- Skill manifest；
- 配置。

必须通过 schema。

### 不使用 `any`

若第三方类型缺失，先写最小边界类型，不把 `any` 传播到业务层。

### 判别联合

```ts
export type ToolCallState =
  | { kind: "pending" }
  | { kind: "running"; startedAt: string }
  | { kind: "succeeded"; result: ToolCallResult }
  | { kind: "failed"; error: PublicAppError };
```

避免多个可能矛盾的 Boolean。

### Result

领域中的可预期失败：

```ts
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

---

## 四、Electron 安全

### BrowserWindow

必须：

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload
}
```

若某项因第三方限制无法开启，必须记录 ADR 与替代缓解措施。

### Preload

按方法暴露：

```ts
contextBridge.exposeInMainWorld("musicAgent", {
  diagnoseDaw: () => ipcRenderer.invoke("daw:diagnose"),
  sendMessage: (input) => ipcRenderer.invoke("session:send", input)
});
```

禁止暴露：

```ts
send: ipcRenderer.send
invoke: ipcRenderer.invoke
on: ipcRenderer.on
```

Renderer 不能自选 channel。

### IPC

每个 channel：

- 常量定义；
- Request schema；
- Response schema；
- 权限说明；
- 错误映射；
- 单元测试。

### 子进程

- 使用参数数组；
- 不拼 shell 字符串；
- 固定 executable 或经验证路径；
- 明确 cwd；
- 最小环境变量；
- 采集退出码；
- App 退出时清理；
- 不打印 API Key。

### 导航

- 主窗口只加载本地应用；
- 阻止任意导航；
- 外链使用系统浏览器；
- 禁止新窗口获得 Node 权限；
- CSP 不允许任意 inline script。

---

## 五、Renderer

### 组件职责

组件可以：

- 展示；
- 发送 typed command；
- 订阅 UI Event；
- 本地交互状态。

组件不可以：

- 调用 MCP；
- 解析 Runtime stdout；
- 生成音乐计划；
- 管理 API Key；
- 启动子进程；
- 修改 Ableton。

### Store

保存可序列化 View Model：

- Session；
- Messages；
- Plan；
- Roles；
- Tool Calls；
- Approval；
- Connection；
- DAW Context；
- Action Log。

不保存：

- ChildProcess；
- MCP Client；
- Database handle；
- Secret；
- Node stream。

### 流式事件

- 事件有单调序号；
- 忽略旧 Session 的晚到事件；
- Message Delta 合并有测试；
- Tool Call 以 ID 更新；
- 取消后不把晚到结果显示为新的成功任务。

### 音乐 UI

- 小节从 1 开始显示；
- 轨道使用真实名称；
- Context 显示采集时间；
- Plan 和执行结果分开；
- Partial Success 明确；
- 不以动画伪装实际 Tool Call；
- 角色 UI 只显示真实发生的 Role Run。

---

## 六、Agent Runtime Adapter

### 单一入口

产品只能依赖：

```ts
AgentRuntimePort
```

禁止在 Renderer、Music Domain 或 Session 中 import 具体 Runtime 内部模块。

### Event Mapping

具体 Runtime Event 在 Adapter 内转成统一事件。

禁止让 UI：

- 解析终端 ANSI；
- 依赖某个 CLI 文案；
- 依赖某个 Provider 消息格式；
- 直接使用 Runtime Session object。

### Capabilities

Runtime 启动后报告：

```ts
interface RuntimeCapabilities {
  supportsMcp: boolean;
  supportsApproval: boolean;
  supportsCancel: boolean;
  supportsResume: boolean;
  supportsSubagents: boolean;
  supportsSkills: boolean;
}
```

UI 根据能力降级，不假设所有候选都有同样功能。

### Cancel

Cancel 必须：

- 停止模型生成；
- 取消未执行 Tool Call；
- 调用 Queue cancelPending；
- 不强杀正在进行且可能已写入 DAW 的操作；
- 之后触发状态核验。

---

## 七、MCP 与 Tool

### MCP Client

只有 Main / MCP package 持有。

### Tool Registry

每个 Tool 包含：

- 名称；
- 描述；
- 输入 schema；
- 风险级别；
- 是否只读；
- Verification strategy；
- UI label。

### 原始 Tool 与领域动作

角色使用领域动作：

```text
createMusicTrack
writeMusicClip
loadSound
placeSection
previewRange
```

Adapter 使用原始 Tool：

```text
create_midi_track
add_notes_to_clip
load_instrument_or_effect
duplicate_to_arrangement
```

不要让 Skill Prompt 依赖一长串不稳定的原始 Tool 参数。

### 串行

Ableton 写 Tool 必须进入 `DawCommandQueue`。

禁止：

```ts
await Promise.all([
  createTrack(),
  loadInstrument(),
  createClip()
]);
```

### 写后核验

每个写操作必须定义 Verification：

```ts
interface VerificationSpec {
  readTool: string;
  expectation: string;
  compare: VerificationComparator;
}
```

工具返回文本不是最终成功依据。

---

## 八、音乐领域

### 领域对象

- UserMusicRequest；
- DawContextSnapshot；
- MusicIntent；
- RoleProposal；
- AgentPlan；
- MusicAction；
- VerificationResult。

### 意图与执行分离

禁止：

```text
用户文本 → 原始 MCP Tool Call
```

必须：

```text
用户文本
→ MusicIntent
→ RoleProposal
→ AgentPlan
→ Approval
→ MusicAction
→ Adapter
```

### Preserve

所有计划显式携带：

- 保留轨道；
- 保留 Clip；
- 保留主题；
- 禁止修改；
- 允许范围。

### 角色

每个角色：

- 有独立 Skill；
- 输出 schema；
- 不越权；
- 不编造工程状态；
- 不直接并行写 DAW；
- 不宣称听见未提供的音频。

### 不夸大听觉

没有 Bounce / Audio Input / Audio Model 时，只能基于：

- MIDI；
- 工程结构；
- 轨道名；
- 设备名；
- 用户语言；
- 音乐规则。

用户文案不能写“Agent 听完了你的歌”。

---

## 九、Plan 与 Approval

### Plan 必须包含

- 目标；
- 范围；
- 假设；
- Preserve；
- 受影响轨道；
- 步骤；
- 角色；
- Verification；
- 风险；
- 是否确认。

### Approval 不得复用

一次 Approval 只覆盖：

- 特定 Plan ID；
- 特定步骤；
- 特定参数范围；
- 有效时间。

Plan 改变后重新确认。

### Plan Status

```text
draft
awaiting_approval
approved
running
partially_completed
completed
failed
cancelled
```

状态只能通过集中 reducer。

---

## 十、Action Log

### 结构化

```ts
interface ActionLogEntry {
  id: string;
  sequence: number;
  timestamp: string;
  sessionId: string;
  planId?: string;
  stage:
    | "request"
    | "context"
    | "role"
    | "plan"
    | "approval"
    | "tool"
    | "verification"
    | "preview";
  level: "info" | "warning" | "error";
  message: string;
  data?: Record<string, unknown>;
}
```

### 用户文案

推荐：

> 已在 “Dream Drums” 创建 8 小节副歌变体，并通过 Arrangement 读回确认。

不推荐：

> tool call returned success.

### 敏感信息

不记录：

- API Key；
- 完整环境变量；
- 凭据路径；
- 用户未授权的音频内容；
- 不必要的模型内部推理。

---

## 十一、错误

### Error Code

```ts
type AppErrorCode =
  | "RUNTIME_START_FAILED"
  | "RUNTIME_CAPABILITY_MISSING"
  | "MCP_START_FAILED"
  | "ABLETON_NOT_CONNECTED"
  | "DAW_READ_FAILED"
  | "DAW_WRITE_FAILED"
  | "DAW_WRITE_UNCERTAIN"
  | "VERIFICATION_FAILED"
  | "APPROVAL_REJECTED"
  | "SESSION_CANCELLED";
```

### Uncertain

Tool timeout 后工程状态未知时，使用：

```text
DAW_WRITE_UNCERTAIN
```

不能直接显示“失败”后自动重试创建。

### 用户错误

错误文案包含：

- 发生了什么；
- 是否可能已经写入；
- 已停止哪些后续步骤；
- 如何自检；
- 是否可以重试。

---

## 十二、配置与 Secret

### 配置

```ts
interface AppSettings {
  runtime: RuntimeSettings;
  model: ModelSettings;
  mcp: {
    abletonExecutable?: string;
    host: string;
    port: number;
  };
  approvalMode: ApprovalMode;
}
```

### 默认

```text
ABLETON_HOST=127.0.0.1
ABLETON_PORT=8765
ABLETON_MCP_DISABLE_TELEMETRY=true
```

### Secret

- 系统凭据存储或环境变量；
- 不进入 Renderer；
- 不进入日志；
- 不进入 Session export；
- 不提交 `.env`；
- `.env.example` 只放键名。

---

## 十三、依赖

### 原则

- Runtime 可替换；
- Electron 安全默认；
- 同一职责一个库；
- 锁定版本；
- 检查许可证；
- 不修改上游 vendored 代码而无记录；
- 第三方 Agent 更新前跑 Contract Test。

### 候选变更

所有 Runtime 版本升级必须验证：

- Event；
- MCP；
- Approval；
- Cancel；
- Resume；
- Subagent；
- Windows package。

---

## 十四、Git

分支：

```text
feature/electron-shell
feature/runtime-adapter
feature/ableton-host
feature/music-director
feature/music-agent-ui
feature/danmaku-skill
```

Commit：

```text
feat(runtime): add provider-neutral session adapter
feat(ableton): serialize write tool calls
feat(ui): show plan approval and affected tracks
fix(queue): reconcile timeout with read-back state
docs(prd): make daw agent the primary product
```

提交前：

- typecheck；
- lint；
- unit；
- contract；
- integration；
- Electron build；
- Mock E2E；
- Ableton smoke（影响 DAW 时）。

---

## 十五、测试

### 必测

- IPC 白名单；
- IPC schema；
- Runtime Event mapping；
- Runtime capability 降级；
- Session resume；
- Cancel；
- Approval；
- MusicIntent；
- Role merge；
- Plan；
- Queue；
- Timeout reconciliation；
- Verification；
- Action Log；
- Danmaku Skill 走标准链路。

### 禁止测试依赖

- 当前时间；
- 随机 Session ID；
- 真实付费模型；
- Ableton 一直打开；
- 网络。

### Fixture

固定：

- 104 BPM；
- 4/4；
- D minor；
- 32 小节；
- 4 条 MIDI Track；
- Bar 9–16 修改任务；
- Bells preserve。

### Real Smoke

真实 Ableton 测试必须使用：

- 专用 Demo 工程；
- 可恢复内容；
- 少量音符；
- 串行；
- 写后核验；
- 不操作用户其他工程。

---

## 十六、Skill 规范

每个 Skill 至少包含：

```text
name
role
purpose
inputs
output schema
available tools
constraints
failure behavior
examples
```

### Music Director

- 唯一最终计划合并者；
- 不编造已执行结果；
- 不跳过 Approval。

### Player

- 输出指定乐器 Proposal；
- 不修改其他乐器；
- 不直接写 DAW。

### Mix Engineer

- 没有混音 Tool 时只给计划；
- 不声称已修改。

### Danmaku

- 聚合弹幕；
- 输出标准 UserMusicRequest；
- 不直接操作 MCP；
- UI 标记为 Demo Skill。

---

## 十七、快速 Checklist

### 新 Runtime

- [ ] 实现 Port
- [ ] Event mapping
- [ ] MCP
- [ ] Approval
- [ ] Cancel
- [ ] Resume
- [ ] Capabilities
- [ ] Windows
- [ ] License

### 新 MCP Tool

- [ ] Input schema
- [ ] Risk
- [ ] Domain wrapper
- [ ] Queue policy
- [ ] Verification
- [ ] UI label
- [ ] Error mapping

### 新 Role

- [ ] Skill
- [ ] Output schema
- [ ] Tool scope
- [ ] No direct parallel writes
- [ ] Merge rule
- [ ] UI truthful

### 新 UI

- [ ] Renderer only
- [ ] Typed API
- [ ] No secret
- [ ] Plan vs result distinct
- [ ] Partial state visible
- [ ] Accessibility

### 发布

- [ ] Electron security
- [ ] Child process cleanup
- [ ] No secret in bundle
- [ ] Offline mock mode
- [ ] Ableton diagnose
- [ ] Fixed demo
- [ ] Backup video
