# DAWdex 分工方案

> 默认：1 位主创 + Coding Agent，48 小时黑客松。
> 可选：第 2 位协作者负责 Electron / UI，主创聚焦 Agent、Ableton 与音乐验收。

---

## 一、目标

在 48 小时内完成：

```text
Electron App
→ Open Agent Runtime
→ Ableton MCP
→ Ableton Live
```

并演示完整循环：

```text
读取工程
→ 用户提出修改
→ Agent 制定计划
→ 角色分工
→ 用户确认
→ DAW 执行
→ 读回验证
→ Before / After
```

弹幕编曲作为附加 Demo Skill，只有主循环稳定后才做。

---

## 二、角色

### 主创 / Product & Music Director

负责：

- 产品定位；
- 音乐工作流；
- Agent 角色；
- Ableton 真实工程；
- 音乐结果验收；
- Demo；
- 赛道材料。

不可委托的决策：

- 什么是产品本体；
- 修改任务是否真实；
- 音乐结果是否可用；
- 哪些功能进入主 Demo；
- 是否允许 Agent 执行重要操作。

### Coding Agent / Virtual Engineering Team

负责：

- Runtime 候选研究；
- Electron；
- IPC；
- Agent Adapter；
- MCP Host；
- Ableton Adapter；
- UI；
- 测试；
- 文档；
- Debug。

### 可选 Person A：Desktop & UX

负责：

- Electron Shell；
- Renderer；
- 对话；
- DAW Context；
- Plan；
- Roles；
- Tool Calls；
- Approval；
- Action Log；
- Before / After。

### 可选 Person B：Agent & Ableton

负责：

- Runtime；
- MCP；
- Queue；
- Verification；
- Music Director；
- Role Skills；
- Demo 工程；
- Ableton Smoke。

---

## 三、48 小时计划

### Phase 0：产品与合同（0–3h）

- [ ] 锁定一句话；
- [ ] 锁定主 Demo；
- [ ] 锁定 Ableton 为唯一 DAW；
- [ ] 定义 Runtime Port；
- [ ] 定义 AgentUiEvent；
- [ ] 定义 DawContext；
- [ ] 定义 MusicIntent / AgentPlan；
- [ ] 定义 Approval；
- [ ] 定义 Tool risk。

验收：

- 所有人能说明弹幕只是 Skill；
- UI、Runtime 和 MCP 可基于合同并行开发。

### Phase 1：Runtime Spike（3–8h）

对两个候选运行相同 Spike：

- [ ] Windows 启动；
- [ ] 创建 Session；
- [ ] 流式消息；
- [ ] Tool；
- [ ] MCP；
- [ ] Approval；
- [ ] Cancel；
- [ ] Resume；
- [ ] Subagent / Task；
- [ ] 许可证。

T+8h 必须做出选择。若没有候选完整满足，选择最容易 Adapter 的一个，并对缺失能力自行补薄层。

### Phase 2：Electron Shell（3–10h，可并行）

- [ ] Main；
- [ ] Preload；
- [ ] Renderer；
- [ ] Context Isolation；
- [ ] typed IPC；
- [ ] Mock Runtime；
- [ ] Session 页面；
- [ ] Event stream；
- [ ] Settings；
- [ ] Child process cleanup。

验收：

```text
用户发消息
→ Mock Runtime 流式响应
→ Plan
→ Approval
→ Mock Tool Call
→ Action Log
```

### Phase 3：Ableton Host（8–16h）

- [ ] MCP lifecycle；
- [ ] 防止重复 Server；
- [ ] Diagnose；
- [ ] Tool discovery；
- [ ] Session / Track / Arrangement；
- [ ] Connection UI；
- [ ] 串行 Queue；
- [ ] Tool Event；
- [ ] 写后 Verification。

验收：

- App 内显示真实 Ableton 工程；
- 可创建一条测试 MIDI Track；
- 写后读回确认；
- App 退出不残留进程。

### Phase 4：Music Director（16–23h）

- [ ] UserMusicRequest；
- [ ] MusicIntent；
- [ ] 固定任务 Prompt；
- [ ] Music Director Skill；
- [ ] Plan；
- [ ] Preserve；
- [ ] Approval；
- [ ] MusicAction → Ableton Adapter；
- [ ] Partial Success。

固定任务：

> Bar 9–16 更炸但别太满，保留 Bells，鼓和贝斯推动，吉他只做回答。

验收：

- Plan 可读；
- 受影响轨道正确；
- 不允许的轨道未修改；
- 写后验证。

### Phase 5：Music UX（23–32h）

- [ ] Codex-like Conversation；
- [ ] Project header；
- [ ] DAW Context Panel；
- [ ] Bar Range；
- [ ] Plan Card；
- [ ] Approval；
- [ ] Tool Call；
- [ ] Roles；
- [ ] Action Log；
- [ ] Transport；
- [ ] Before / After。

UI 验收：

- 10 秒内知道它是 DAW Agent；
- 当前连接和工程清楚；
- Plan 和 Result 不混；
- Agent 角色是真实状态；
- Ableton 与 App 变化对应。

### Phase 6：角色任务（32–37h）

优先：

- [ ] Arranger；
- [ ] Drum Player；
- [ ] Bass Player；
- [ ] Guitar Player；
- [ ] QA Auditor。

可选：

- [ ] Composer；
- [ ] Mix Engineer。

v0.1 角色只输出 Proposal，由 Music Director 合并。DAW 写入仍串行。

### Phase 7：Demo 与弹幕 Skill（37–43h）

先完成：

- [ ] 固定 Ableton Demo；
- [ ] 重置方式；
- [ ] 主 90 秒流程；
- [ ] 连续运行；
- [ ] 备用录像。

有时间再做：

- [ ] 预设弹幕；
- [ ] 聚合；
- [ ] 转 UserMusicRequest；
- [ ] 复用主 Agent 执行。

禁止为弹幕另写第二套 MIDI / Audio Engine。

### Phase 8：提交与排练（43–48h）

- [ ] 修阻塞 Bug；
- [ ] 安全检查；
- [ ] 打包；
- [ ] 新机器 / 新用户流程；
- [ ] 连续三次；
- [ ] 断网或模型失败兜底；
- [ ] 视频；
- [ ] 截图；
- [ ] 赛道回答；
- [ ] 用户反馈。

最后 5 小时不做：

- 换 Runtime；
- 换 Electron 脚手架；
- 接第二个 DAW；
- 接真实 B 站；
- 增加不可逆工具；
- 大改 Prompt / Schema。

---

## 四、两人并行

### Person A：Desktop / UX

主文件：

```text
apps/desktop/src/main/**
apps/desktop/src/preload/**
apps/desktop/src/renderer/**
packages/shared-contracts/**
```

任务：

- Electron；
- IPC；
- UI；
- Session View；
- Event；
- Approval；
- Roles；
- Action Log；
- Packaging。

### Person B：Agent / DAW

主文件：

```text
packages/agent-runtime/**
packages/mcp-client/**
packages/ableton-adapter/**
packages/music-domain/**
skills/**
```

任务：

- Runtime；
- MCP；
- Ableton；
- Queue；
- Verification；
- Music Director；
- Role Skills；
- Demo 工程。

### 共同文件

```text
packages/shared-contracts/src/events.ts
packages/shared-contracts/src/session.ts
packages/shared-contracts/src/daw.ts
package.json
docs/**
```

修改共同合同前同步。

---

## 五、Mock

### UI Mock

Mock Runtime 产生：

- assistant delta；
- plan；
- role runs；
- approval；
- tool call；
- result；
- error。

UI 不等待真实模型。

### Runtime Mock Tool

先注册：

```text
mock_get_session
mock_create_track
mock_write_clip
mock_verify
```

验证 Agent Loop。

### Ableton Mock

内存工程：

- Tempo；
- Tracks；
- Devices；
- Clips；
- Arrangement。

支持：

- 成功；
- 失败；
- 超时但已执行；
- 部分执行；
- 读回不一致。

### Role Mock

固定输出：

```text
Arranger: energy up, density controlled
Drums: open hats + crash + fill
Bass: more movement
Guitar: short response only
```

---

## 六、关键对齐点

### T+3h：合同

冻结：

- Runtime Port；
- UI Event；
- DawContext；
- Plan；
- Tool Call；
- Approval。

### T+8h：Runtime

必须选型，不能无限研究。

### T+16h：Ableton

必须从 Electron Host 读取真实工程并完成一次可验证写入。

### T+23h：主 Loop

必须跑通：

```text
Request → Plan → Approval → Write → Verify
```

### T+32h：产品体验

必须看起来是音乐定制 Agent，不是通用聊天壳。

### T+37h：功能冻结

之后只做 Demo、弹幕 Skill 和修复。

### T+43h：演示冻结

固定：

- Runtime；
- Model；
- App build；
- Ableton 工程；
- MCP；
- Port；
- Prompt；
- 脚本；
- 录像。

---

## 七、优先级

### P0

- Electron；
- Runtime；
- Ableton MCP；
- Connection；
- Context；
- Music Director；
- Plan；
- Approval；
- Queue；
- Verification；
- Action Log；
- Before / After。

### P1

- Arranger；
- Player Roles；
- Range；
- Session persistence；
- Demo reset；
- Packaging。

### P2

- 弹幕 Skill；
- Composer；
- Mix Engineer；
- MIDI diff；
- 多候选。

### P3

- 真实弹幕；
- 音频监听；
- 多 DAW；
- 多人协作；
- 完整 Undo；
- VST。

---

## 八、失败兜底

### Runtime 失败

- Runtime 可重启；
- Session 保存；
- 固定 Demo 可用预先生成 Plan；
- 备用视频。

### MCP 失败

- Diagnose；
- 明确启动顺序；
- 检查 Ableton Control Surface；
- 检查 8765；
- 防止重复 Server；
- 备用录屏。

### Tool timeout

- Queue 暂停；
- 读回；
- 不盲目重试；
- UI 标记 uncertain；
- 人决定。

### 多 Agent 不稳定

- 降级为一个 Orchestrator；
- 角色使用固定 Skill 顺序；
- UI 如实显示 Role Task；
- 不影响主执行。

### Before / After 不完整

- 使用预保存 Before 工程；
- Agent 创建新 Track / Clip；
- 播放固定范围；
- 不承诺完整 Undo。

### 弹幕未完成

直接不演。产品主 Demo 不依赖弹幕。

---

## 九、Demo 排练

### 环境

- [ ] Ableton Live 12.1.5
- [ ] 官方许可 / 试用
- [ ] AbletonMCP Control Surface
- [ ] 127.0.0.1:8765
- [ ] 单个 MCP Server
- [ ] Electron build
- [ ] 固定 Runtime / Model
- [ ] 固定 Demo 工程
- [ ] 音频输出
- [ ] 通知关闭

### 主流程

- [ ] App 启动
- [ ] Connection 绿色
- [ ] 工程 Context
- [ ] 选择 Bar 9–16
- [ ] 输入修改
- [ ] Plan
- [ ] Roles
- [ ] Approve
- [ ] Tool Calls
- [ ] Verification
- [ ] Before
- [ ] After
- [ ] 下一条追问

### 讲解

- [ ] 一句话先说“为音乐制作定制的 Codex”
- [ ] 弹幕不作为开场
- [ ] 强调读取真实工程
- [ ] 强调计划与确认
- [ ] 强调可编辑结果
- [ ] 强调音乐角色
- [ ] 不夸大音频监听和 Undo

---

## 十、完成条件

- Runtime 已选并有 ADR；
- Electron 安全配置通过；
- Ableton 连接自检；
- 真实 Context；
- 固定修改任务；
- Plan；
- Approval；
- 串行写入；
- 写后验证；
- Partial / Uncertain 可见；
- Before / After；
- 至少一个角色任务；
- 连续三次主 Demo；
- 备用视频；
- 弹幕被正确放在附加 Skill；
- 文档、UI 和 Pitch 使用同一产品定义。
