# DAWdex 三人分工与 7 月 26 日前交付计划

> 团队规模：3 人
> 计划起点：2026-07-23
> 内部完成线：2026-07-25 22:00
> 7 月 26 日用途：提交、现场缓冲和演示，不再开发新功能

## 一、共同目标

在内部完成线前交付一个可重复演示的 DAWdex Demo：

```text
Electron App
→ 用户提出音乐修改
→ Agent 读取或获得 DAW Context
→ 展示 Plan 与影响范围
→ 用户确认
→ 通过 Ableton MCP 修改真实工程
→ 读回结果
→ Before / After
```

申报 08 B 站赛道时，再增加一个小而完整的输入 Skill：

```text
3–5 条预设弹幕
→ 聚合为一个音乐请求
→ 复用同一条 Agent → MCP → Ableton 链
```

弹幕功能服务于赛道展示，但不是产品本体，也不能建立第二套执行引擎。

## 二、三位成员的稳定职责

### 成员 A：Experience & Story Lead

适合背景：宣发、视觉设计、前端页面、UI / UX 交互。

唯一负责人：

- 产品视觉语言和 Electron Renderer；
- Codex-like 对话区、DAW Context、Plan、Tool Call、Agent Roles；
- Apply / Cancel、Loading、Error 和空状态；
- Before / After 的交互呈现；
- 赛道视觉素材、Pitch、截图和演示视频剪辑；
- Build in Public 内容与用户招募；
- 主持可用性测试并整理原话。

主要目录：

```text
apps/desktop/src/renderer/**
packages/ui/**
design/**
docs/demo-script.md
```

不负责：

- 直接调用 MCP；
- 设计 Agent Runtime 内部协议；
- Ableton Tool 参数；
- Electron Main 中的本地权限。

交付标准：

- 用户 10 秒内知道这是“为音乐制作定制的 Codex”；
- Plan、执行中、成功、部分失败四种状态能够区分；
- UI 展示的每个工具状态都来自真实事件或明确标注的 Mock；
- 7 月 25 日前产出最终截图、90 秒演示画面和 Pitch 页面。

### 成员 B：Agent & DAW Lead（当前已完成 Codex → MCP → Ableton 初步验证的成员）

唯一负责人：

- 开源 Agent Runtime 的快速 Spike 和最终选择；
- `AgentRuntimePort` 与 Runtime Adapter；
- MCP Client 接入；
- Ableton MCP 生命周期与连接诊断；
- Music Director 的 Prompt / Skill；
- 音乐意图、计划与 Tool Mapping；
- Ableton Track / Clip / MIDI 的真实写入；
- 固定 Demo 工程的音乐结果；
- 所有 DAW 操作的安全边界。

主要目录：

```text
packages/agent-runtime/**
packages/mcp-client/**
packages/ableton-adapter/**
packages/music-domain/**
skills/**
patches/**
```

不负责：

- 反复打磨页面像素；
- 安装包视觉素材；
- 宣发内容排期；
- Electron Renderer 的组件细节。

交付标准：

- 7 月 24 日中午前锁定 Runtime，不再并行维护候选；
- 一个自然语言任务可稳定转成 Plan；
- 至少一条真实写入动作可由 App 发起并在 Ableton 中读回；
- 删除、覆盖、保存工程不进入现场可调用工具；
- 固定音乐任务连续成功三次。

### 成员 C：App Integration & Reliability Lead

第三位技术成员不是“捡剩下的活”，而是拥有完整的产品集成与可靠性边界。

唯一负责人：

- Electron Main / Preload；
- 本地进程生命周期与启动顺序；
- typed IPC 和 Shared Contracts；
- UI Event Hub 与状态归一化；
- Session 最小状态；
- Approval plumbing；
- 串行执行队列、取消和超时后的状态协调；
- Action Log 数据链；
- Mock Runtime / Mock MCP；
- 集成测试、Smoke Test、打包和启动脚本；
- Demo Reset、故障诊断和备用模式；
- GitHub CI 与发布产物。

主要目录：

```text
apps/desktop/src/main/**
apps/desktop/src/preload/**
packages/shared-contracts/**
packages/session-domain/**
packages/test-support/**
scripts/**
.github/**
```

不负责：

- 决定音乐结果好不好；
- 修改 Music Director 的审美 Prompt；
- 主导页面视觉；
- 临时接第二个 DAW。

交付标准：

- Renderer 不直接获得 Node 或 MCP 权限；
- Electron 能启动、监控并清理 Runtime / MCP 子进程；
- Mock 和 Real Adapter 使用同一套 UI Event；
- Tool Call 的 pending / running / succeeded / failed 能被 UI 稳定消费；
- App 退出后不残留子进程；
- 在固定演示电脑上提供一条明确启动和重置路径。

## 三、边界接口

### A 与 C 的接口

A 只依赖 View Model 和 typed commands：

```text
sendMessage
approvePlan
cancelTask
playRange
resetDemo
subscribeAgentUiEvents
```

C 保证状态和事件真实可消费。A 不解析 Runtime stdout，也不直接调用 Node API。

### B 与 C 的接口

B 实现：

```text
AgentRuntimePort
DawPort
MusicDirector
AbletonAdapter
```

C 负责：

```text
ProcessManager
SessionService
EventHub
ApprovalService
DawCommandQueue
```

两人共同冻结：

- `DawContextSnapshot`；
- `MusicIntent`；
- `AgentPlan`；
- `PlanStep`；
- `AgentUiEvent`；
- `ToolCallResult`；
- `PublicAppError`。

共享合同发生破坏性修改前，必须先在三人群里说明影响，并由另一位技术成员确认。

### A 与 B 的接口

A 定义用户能理解的音乐语言和操作方式；B 保证这些内容能映射到真实 Agent / DAW
能力。任何 UI 文案如果暗示了尚不存在的 Undo、音频理解或多 Agent 并发，B 有权阻止
进入 Demo。

## 四、按日期倒排

### 7 月 23 日：锁定范围与并行起跑

共同：

- [ ] 冻结一句话、主赛道和 90 秒 Demo；
- [ ] 冻结 P0，建立 GitHub Issues；
- [ ] 冻结七个共享合同；
- [ ] 明确固定 Ableton Demo 工程和重置方法。

成员 A：

- [ ] 完成主界面低保真和视觉方向；
- [ ] 用 Mock Event 跑通 Conversation → Plan → Apply → Result；
- [ ] 准备赛道介绍页和用户测试脚本。

成员 B：

- [ ] 最多 Spike 两个 Runtime；
- [ ] 验证 Runtime → MCP 工具调用；
- [ ] 整理已可用 Ableton Tools；
- [ ] 固定一个编曲任务和音乐动作模板。

成员 C：

- [ ] 建 Electron Shell、Main、Preload 和 typed IPC；
- [ ] 接入 Mock Runtime / Mock MCP；
- [ ] 建 Event Hub 与 Process Manager 骨架；
- [ ] 配置最小 CI：typecheck、lint、test。

当天退出条件：

- Mock 主链在 Electron 中可见；
- Real MCP 链在命令行仍可运行；
- 三人对接口没有分歧。

### 7 月 24 日：跑通真实端到端

上午 12:00 前：

- [ ] B 锁定 Runtime；
- [ ] B + C 完成 Electron Host 到 MCP 的连接；
- [ ] A 的 UI 能显示真实连接状态和 Tool Event。

当天结束前：

- [ ] 在 App 中发起固定请求；
- [ ] 展示 Plan 并确认；
- [ ] Ableton 发生至少一次真实修改；
- [ ] 读回结果并进入 Action Log；
- [ ] 同一小节可播放 Before / After；
- [ ] 记录第一个完整 Demo 视频。

如果当天结束仍未端到端：

- 取消真实多 Agent；
- 取消持久化；
- 取消 MIDI Diff；
- 弹幕只保留预设输入；
- 使用一个 Orchestrator 和固定 Skill；
- 不再研究新的 Runtime。

### 7 月 25 日：产品化、赛道化和冻结

09:00–12:00：

- [ ] A 完成核心 UI 状态和视觉收口；
- [ ] B 完成固定音乐任务的音质验收；
- [ ] C 完成错误状态、重置和启动脚本；
- [ ] 三类用户测试至少完成两类。

12:00–15:00：

- [ ] 接入 3–5 条预设弹幕；
- [ ] 确认弹幕复用主执行链；
- [ ] 完成主赛道文案和团队介绍；
- [ ] 补录真实用户反馈。

15:00：功能冻结。

15:00–18:00：

- [ ] 连续运行主 Demo 三次；
- [ ] 测试 Ableton 未启动、MCP 断开、模型失败；
- [ ] 修复仅限 P0 阻塞问题；
- [ ] 生成安装包或冻结开发环境。

18:00–22:00：

- [ ] 录制 90 秒视频和备用长视频；
- [ ] 截图、架构图、README、团队分工；
- [ ] 赛道提交回答终审；
- [ ] 检查 GitHub 仓库；
- [ ] 排练每个人的讲解段落。

### 7 月 26 日：提交缓冲

- 不增加功能；
- 不更换 Runtime / Model / Port；
- 不重构共享合同；
- 只处理提交、环境恢复和现场演示；
- 现场失败时立即切备用录屏，不在台上调试。

## 五、GitHub 协作

建议建立以下 GitHub Labels：

```text
area:ux
area:agent-daw
area:integration
priority:p0
priority:p1
blocked
demo-risk
```

分支：

```text
feat/ux-<task>
feat/agent-<task>
feat/integration-<task>
fix/demo-<task>
docs/<task>
```

规则：

- `main` 不直接提交功能；
- 每个 P0 Issue 只有一位 Owner；
- PR 尽量控制在 300 行可审查变更以内；
- 普通 PR 至少一位同伴批准；
- 修改共享合同需要另一位技术成员批准；
- 修改产品一句话、Demo 顺序和赛道回答需要成员 A 与成员 B 同时确认；
- 使用 Squash Merge，合并后删除分支；
- 每次合并 P0 后立即运行一次最短 Smoke；
- Ableton 工程、音频和大文件使用共享盘或 Git LFS，不直接塞进普通 Git 历史。

## 六、每日 15 分钟同步

每人只回答：

1. 昨天/上一时段交付了什么可运行结果？
2. 下一时段唯一的 P0 是什么？
3. 现在被谁的哪个接口阻塞？
4. 这项工作若今天失败，降级方案是什么？

同步结束后，Owner 更新 GitHub Issue；不要用聊天记录代替任务状态。

## 七、功能砍除顺序

遇到延期时，依次砍掉：

1. 真实并行子 Agent；
2. Composer / Mix Engineer；
3. 会话搜索和完整持久化；
4. MIDI 可视化 Diff；
5. 真实 B 站 API；
6. 多候选方案；
7. 完整 Undo；
8. 第二个 DAW。

不能砍：

- Electron 中的真实产品入口；
- Agent → MCP → Ableton 的一条真实链路；
- Plan 与用户确认；
- 真实可编辑的 DAW 修改；
- 最小结果验证；
- 固定 Demo 重置；
- 备用录屏。

## 八、完成定义

- [ ] 三人职责不存在无人负责或两人同时主责的 P0；
- [ ] Electron 能启动并显示真实 Ableton 连接；
- [ ] 一个自然语言任务完整跑通；
- [ ] Agent 修改的是可编辑 DAW 工程，不是只生成文本；
- [ ] UI 不伪造不存在的 Agent、Tool Call 或 Undo；
- [ ] 主 Demo 连续成功三次；
- [ ] B 站 Skill 成功一次且不绕过主执行链；
- [ ] 所有重要操作默认不可用或必须确认；
- [ ] 安装、启动、重置和演示都有文档；
- [ ] 90 秒视频、备用录屏和提交材料齐全；
- [ ] GitHub 主分支包含最新稳定版本；
- [ ] 7 月 25 日 22:00 后不再开发新功能。

## 九、仍需三人确认

以下答案会影响任务拆分，但不阻塞当前开工：

1. 成员 A 能否独立实现 React / Electron Renderer，还是主要完成 Figma、视觉和交互稿？
2. 成员 C 最熟悉的是 Electron / Node、后端集成、测试打包中的哪一块？7 月 23–25 日每天可投入多少小时？
3. 团队是否已经确认报名 08 方向一和 05？若主办方只允许一个赛道，默认保留 08。

确认后只调整 Owner 和工作量，不扩大 P0 范围。
