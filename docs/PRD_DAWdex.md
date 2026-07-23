# DAWdex PRD
## 一个为音乐制作定制的 Codex：用自然语言直接操控 DAW

> 版本：v0.1（AdventureX 2026 Hackathon MVP）
> 日期：2026-07-23
> 产品名：**DAWdex**
> 首个支持的 DAW：Ableton Live 12

---

## 一、产品定义

### 一句话描述

**DAWdex 是一个直接操控 DAW 的桌面 Agent App，相当于为音乐制作定制的 Codex：它理解用户的创作与修改意图，读取 Ableton Live 工程，制定可解释的制作计划，并通过 MCP 在 DAW 中完成可继续编辑的编曲操作。**

### 英文描述

> A Codex-like desktop agent for music production that understands creative intent and operates your DAW directly.

### 核心类比

Codex 把“我要实现什么软件”转成：

```text
读取代码库
→ 制定计划
→ 修改文件
→ 运行验证
→ 展示变更
```

DAWdex 把“我想让这段音乐变成什么”转成：

```text
读取 DAW 工程
→ 理解音乐意图
→ 制定制作计划
→ 操作轨道 / Clip / MIDI / 音色
→ 播放并核验
→ 展示 Before / After
```

### 产品本质

DAWdex 不是：

- 一个 Prompt-to-Song 音频生成器；
- 一个只有聊天框的 Ableton 遥控器；
- 一个弹幕触发音效网页；
- 一个试图重新实现完整 DAW 的应用；
- 一个不可解释地自动修改工程的黑盒。

DAWdex 是：

- 一个桌面 Agent 工作台；
- 一个理解 DAW 上下文的对话式制作环境；
- 一个可以规划、调用工具、核验结果的 Agent Host；
- 一个把自然语言反馈翻译为可编辑音乐动作的执行系统；
- 一个为作曲、编曲、演奏、混音流程定制过的 Codex-like UX。

---

## 二、用户问题

### 问题 1：音乐意图很难直接落到 DAW 操作

用户常说：

- “副歌更炸，但别太满。”
- “这里高级一点。”
- “让吉他在人声空位回答。”
- “鼓往后推一点，贝斯更主动。”
- “保留主旋律，重做和声。”
- “帮我做一个 8 小节 build。”

这些要求包含段落、能量、密度、配器、和声、节奏和审美约束。传统 DAW 要求用户自己把它们拆成大量操作。

### 问题 2：现有 AI 音乐工具停在成品生成

许多产品输出一段扁平音频。用户一旦不满意，只能重新生成，很难：

- 精确修改某个段落；
- 保留某条旋律；
- 只改变鼓或和声；
- 查看执行了哪些操作；
- 回到原版本；
- 在专业 DAW 中继续制作。

### 问题 3：通用 Coding Agent 不懂音乐制作 UX

通用 Agent 可以调用工具，但不会天然提供：

- 当前工程与轨道上下文；
- 小节与段落选择；
- 音乐角色与制作阶段；
- 修改前计划预览；
- DAW 操作权限分级；
- Before / After 播放；
- 轨道与 Clip 级 Action Log；
- 多个音乐角色 Agent 的协作视图。

### 核心机会

> 不重新发明 Agent，也不重新发明 DAW；把成熟 Agent 工作流和 Ableton MCP 连接起来，再为音乐制作设计一套真正合适的用户体验。

---

## 三、目标用户

### v0.1 核心用户

- 独立音乐人；
- 编曲人和制作人；
- 熟悉基础 DAW、但不想手工完成所有重复操作的创作者；
- 使用 AI 音乐素材后，希望继续控制和修改的人；
- 为视频、直播、游戏或客户项目快速制作版本的内容创作者。

### 用户特征

- 已经在使用 Ableton、FL Studio、Cubase 或其他 DAW；
- 有审美判断，但不一定擅长所有乐器与制作环节；
- 更需要“修改已有工程”，而不是“从零生成成品”；
- 希望 AI 的结果可解释、可撤销、可继续编辑；
- 接受 Agent 在执行前展示计划；
- 愿意把重复劳动交给 Agent，但保留最终决定权。

### 首个场景

优先支持：

> 用户已有一段 16 或 32 小节 Ableton 多轨 MIDI 工程，选择副歌并说：“副歌更炸，但不要太满，保留铃音主题。”Agent 读取工程、展示计划、经确认后修改鼓、贝斯和和弦，并播放 Before / After。

不把“从零生成整首歌”设为首个场景。

---

## 四、核心体验

### 主界面

整体结构参考 Codex、OpenCode 等 Agent 产品，但以音乐工程为上下文：

产品设计方式类似“OpenDesign 把 Codex-like Agent 定制给设计工作流”：DAWdex 不重做底层 Agent 范式，而是把上下文、工具、角色、审批和结果呈现全部换成音乐制作语言。

```text
┌────────────────────────────────────────────────────────────┐
│ Project / Session                                  Status  │
├──────────────┬───────────────────────────┬─────────────────┤
│ DAW Context  │ Conversation & Plan       │ Agent Team      │
│              │                           │                 │
│ Tracks       │ User request              │ Music Director  │
│ Sections     │ Agent understanding       │ Composer        │
│ Clips        │ Plan / approvals          │ Arranger        │
│ Devices      │ Tool calls / results      │ Players         │
│ Selection    │ Action log                │ Mix Engineer    │
├──────────────┴───────────────────────────┴─────────────────┤
│ Transport / Selected Bars / Before-After / Playback        │
└────────────────────────────────────────────────────────────┘
```

### Codex-like 基础交互

- 对话式任务输入；
- 自动读取上下文；
- 任务计划；
- 工具调用卡片；
- 执行状态；
- 子任务 / 子 Agent；
- 权限确认；
- 失败恢复；
- 可审计日志；
- 会话历史；
- 可继续追问和迭代。

### 音乐制作定制

- Ableton 连接状态；
- 当前 BPM、拍号、播放位置；
- 轨道、Clip、设备与 Arrangement 摘要；
- 小节 / 段落选择；
- “保留什么”和“允许改什么”；
- 编曲计划预览；
- 轨道级修改摘要；
- 播放选定范围；
- Before / After；
- 角色 Agent 状态；
- 音乐动作而不是文件 diff；
- 后续支持 waveform、MIDI 片段和混音参数视图。

---

## 五、核心工作流

### Flow 1：连接与读取工程

1. 用户打开 Electron App；
2. App 启动 Agent Runtime 和 Ableton MCP Client；
3. 检查 Ableton Live 是否可连接；
4. 读取 Session、Track、Clip、Arrangement 和 Browser；
5. UI 显示工程摘要；
6. Agent 获得结构化 DAW Context。

### Flow 2：用户提出修改

用户可以：

- 直接输入自然语言；
- 在 UI 中选择 Bar 9–16；
- 选择“保留主旋律”；
- 指定允许修改的轨道；
- 选择仅规划或允许执行。

示例：

> 把第 9–16 小节做得更炸，但别太满。保留铃音主题，让鼓和贝斯推动，吉他只做回答。

### Flow 3：理解与计划

Agent 输出：

```text
我的理解
- 目标段落：Bar 9–16
- 目标：提高能量，控制整体密度
- 必须保留：Bells 主旋律
- 允许修改：Drums / Bass / Chords / Guitar

执行计划
1. Drums：打开 hi-hat，副歌入口加 crash，末尾加 fill
2. Bass：增加切分和经过音，不改变和声根基
3. Chords：扩大转位，降低持续音重叠
4. Guitar：只在人声 / 主旋律空位添加短 response
5. 执行后读取 Arrangement 验证，并播放 Bar 9–16
```

### Flow 4：确认与执行

用户点击 Apply 后：

1. Agent 保存或记录 Before 状态；
2. 所有 Ableton 写操作串行进入队列；
3. 每个阶段执行后读回核验；
4. UI 实时显示正在操作的轨道和工具；
5. 失败时停止后续相关步骤；
6. 展示已成功和未执行的动作。

### Flow 5：Before / After

用户可：

- 播放原版本；
- 播放修改版本；
- 查看改变了哪些轨道；
- 继续说“鼓很好，但和弦太亮”；
- 接受、再次修改或恢复。

---

## 六、Agent 团队

### Music Director / Orchestrator

主 Agent，负责：

- 理解用户目标；
- 读取工程上下文；
- 判断是否需要澄清；
- 拆分任务；
- 分配角色；
- 合并计划；
- 管理工具权限；
- 决定执行顺序；
- 汇总结果。

### Composer

负责：

- 旋律；
- 和声进行；
- 调式与张力；
- 主题发展；
- 动机变体。

### Arranger

负责：

- 段落结构；
- 能量曲线；
- 密度；
- 配器；
- 乐器进入与退出；
- Build、Drop、Transition。

### Player Agents

按乐器角色提供建议或事件：

- Drum Player；
- Bass Player；
- Keys Player；
- Guitar Player；
- Pad / Lead Player。

### Mix Engineer

后续负责：

- 音量平衡；
- Pan；
- Mute / Solo；
- Send；
- 基础 Automation；
- 设备与效果器参数；
- 混音检查。

### QA / Session Auditor

负责：

- 检查轨道和 Clip 是否真实写入；
- 检查播放范围；
- 对比计划与实际工程；
- 报告部分失败；
- 检查是否修改了禁止修改的内容。

### v0.1 多 Agent 边界

多 Agent 是产品方向，但不应在第一版过度实现。

v0.1 推荐：

- 一个真实 Orchestrator；
- 多个角色 Prompt / Skill；
- 子任务可以顺序执行；
- UI 能展示角色分工；
- 所有 DAW 写操作仍由单一执行队列负责。

后续再支持真正并行推理。不能让多个 Agent 并行写 Ableton。

---

## 七、功能需求

### FR-01：Electron 桌面应用

必须：

- Windows 首先可运行；
- 主窗口包含会话、工程上下文、计划和执行状态；
- 支持本地配置；
- 可启动 / 管理 Agent Runtime；
- 可启动 / 连接 MCP Server；
- Renderer 不直接获得 Node 全权限。

### FR-02：Agent Runtime

必须支持：

- 多轮对话；
- System Prompt / Skills；
- Tool Registry；
- MCP Client；
- 计划与任务状态；
- Tool Call 流式事件；
- Approval；
- Cancellation；
- 会话持久化；
- 模型 Provider 可替换。

具体开源 Agent 尚未选定。产品代码必须通过 Adapter 隔离 OpenCode-like Runtime。

### FR-03：Ableton 连接

必须显示：

- MCP Server 状态；
- Ableton Remote Script 状态；
- Host / Port；
- 当前工程是否可读；
- 最后一次自检；
- 失败原因和恢复建议。

当前已验证本机配置：

```text
Ableton Live 12.1.5
Ableton MCP Server
AbletonMCP Remote Script
127.0.0.1:8765
```

### FR-04：DAW Context

Agent 和 UI 至少读取：

- Tempo；
- 拍号；
- 播放状态；
- 轨道名称、类型和设备；
- Clip Slot；
- Arrangement Clip；
- Browser 中可用音色；
- 用户选择的小节范围。

### FR-05：音乐任务输入

用户可以输入：

- 从零创建某段；
- 修改已有段落；
- 增加 / 减少能量；
- 改变密度；
- 配器；
- 乐器回答；
- 和声变化；
- 音色选择；
- 播放与检查。

首版重点是“修改已有 Demo”。

### FR-06：计划预览

每次写操作前显示：

- Agent 的理解；
- 目标范围；
- 保留约束；
- 受影响轨道；
- 具体音乐动作；
- 工具调用概览；
- 风险；
- 是否需要用户确认。

### FR-07：权限

建议四级：

| 级别 | 行为 |
|---|---|
| Read | 读取工程、浏览音色 |
| Preview | 生成计划、MIDI Blueprint，不写 DAW |
| Apply | 创建轨道、Clip、音符、Arrangement |
| Important | 覆盖、删除、工程保存、批量不可逆修改 |

v0.1 中所有 DAW 写操作默认需要确认。

### FR-08：执行队列

- 写操作严格串行；
- 每个 Tool Call 有 ID；
- UI 显示 pending / running / succeeded / failed；
- 可取消尚未执行的步骤；
- 读回验证与写操作分开；
- 超时后先检查工程真实状态，不盲目重试。

### FR-09：Action Log

每次修改记录：

- 用户请求；
- Agent 理解；
- Plan；
- 使用的角色；
- Tool Call；
- 参数；
- 返回结果；
- 读回验证；
- 受影响轨道；
- 错误与恢复。

### FR-10：Before / After

v0.1 至少支持：

- 修改前状态摘要；
- 修改后状态摘要；
- 播放同一范围；
- UI 标记新增的 Track / Clip；
- 一键回到原播放位置。

若 MCP 还不支持完整 Undo，必须明确标注限制，并使用预保存 Demo 工程或新 Clip / 新轨道策略。

### FR-11：子 Agent 视图

UI 显示：

- 角色；
- 当前任务；
- 状态；
- 输出摘要；
- 是否需要确认；
- 是否已合并到主计划。

不应伪造实际没有发生的并行 Agent 活动。

### FR-12：会话与项目

- 新建 Agent 会话；
- 关联当前 Ableton 工程；
- 保存对话和 Action Log；
- 重开应用后可查看历史；
- 不把 Ableton 工程文件复制进应用数据库。

### FR-13：弹幕实时编曲 Demo

弹幕功能是一个内置 Demo / Skill，不是产品主页。

流程：

```text
模拟弹幕
→ 聚合为用户意图
→ 主 Agent / Arranger 生成计划
→ Ableton MCP 执行
→ DAW 中实时出现编曲变化
```

首版只需预设弹幕，不接真实 B 站 API。

可展示动作：

- “燃” → Build；
- “切一下” → Full Band Cut；
- “别太满” → Dropout；
- “吉他回答” → Call & Response；
- “哭了” → Emotional Shift。

该功能的意义是证明同一个 DAWdex 不只接受单个用户命令，也能把群体反馈转成 DAW 操作。

---

## 八、MVP 范围

### Must Have

- Electron App；
- Codex-like 对话界面；
- Ableton 连接自检；
- 读取 Session / Track / Arrangement；
- 一个可替换的 Agent Runtime Adapter；
- 一个 Music Director 主 Agent；
- 结构化音乐意图与计划；
- Apply 前确认；
- Ableton 写操作串行队列；
- 创建 Track / Clip、写入 MIDI、加载音色、放入 Arrangement；
- 写后读回验证；
- Action Log；
- Before / After 播放；
- 固定 Demo 工程；
- 90 秒稳定演示。

### Should Have

- Arranger 与 Player 角色；
- 子 Agent / 子任务 UI；
- 小节范围选择；
- 预设修改任务；
- 弹幕编曲 Demo；
- 会话持久化；
- 重置 Demo；
- MIDI Blueprint 导出。

### Nice to Have

- Composer 角色；
- Mix Engineer；
- 可视化 MIDI 差异；
- 多个候选方案；
- 用户偏好；
- 音频监听闭环；
- FL Studio / Reaper Adapter；
- 真实弹幕接口。

### 不做

- 重新开发完整 DAW；
- 从零训练音乐模型；
- 通用 VST 控制；
- 完整混音和母带；
- 同时支持多个 DAW；
- 真实多人协作；
- 真实 B 站 API；
- 自动执行不可逆删除；
- 宣称 Agent 能像人一样听完整音频并评价。

---

## 九、90 秒 Demo

### 0–10 秒：定义产品

> Coding agents can edit software.
> DAWdex brings the same workflow to your DAW.

打开 Electron App，Ableton 在旁边。

### 10–25 秒：读取工程

Agent 自动显示：

- 104 BPM；
- D minor；
- 4 条 MIDI Track；
- Bar 9–16 为副歌；
- Bells 是主旋律。

### 25–40 秒：提出任务

输入：

> 副歌更炸，但别太满。保留铃音主题，让鼓和贝斯推动，吉他只做回答。

### 40–55 秒：计划与角色

UI 显示：

- Music Director 拆解目标；
- Arranger 设计能量与密度；
- Drum / Bass / Guitar Player 提供动作；
- 合并为一个执行计划；
- 用户点击 Apply。

### 55–75 秒：执行

Ableton 中可见：

- Drums、Bass、Chords 被修改；
- Guitar Response Clip 出现；
- Bells 保留；
- Tool Calls 与验证状态在 App 中滚动。

### 75–90 秒：Before / After

播放修改前后，展示：

- 计划；
- 实际修改；
- 工程仍可编辑；
- Agent 可以继续接收下一条意见。

### 弹幕 Demo

弹幕功能可以作为第二段短演示或展台互动，不占主 Pitch 的产品定义。

---

## 十、成功指标

### 技术

| 指标 | 目标 |
|---|---:|
| Ableton 连接自检成功率 | 100%（演示环境） |
| 读取工程成功率 | 100% |
| 固定 Demo 执行成功率 | ≥ 95% |
| Tool Call 与结果匹配 | 100% |
| 写后读回覆盖率 | 100%（核心写操作） |
| 连续完整 Demo | 3 次无中断 |

### 体验

- 用户 10 秒内理解“为音乐制作定制的 Codex”；
- 用户知道 Agent 将修改哪些轨道；
- 用户能区分计划、执行和验证；
- 用户能看到 Before / After；
- 用户知道弹幕只是一个示例 Skill；
- 用户愿意把真实 MIDI 工程交给它做一次修改。

---

## 十一、风险

| 风险 | 缓解 |
|---|---|
| Agent Runtime 选型未定 | 先定义 Runtime Adapter 与能力合同；做短期 Spike |
| 多 Agent 过度复杂 | v0.1 一个 Orchestrator + 角色任务；写操作单队列 |
| MCP 响应错位 | 工具调用串行；请求 ID；写后读回 |
| Ableton 不支持完整 Undo | Demo 工程预备份；创建新 Clip / 新轨道；重要操作确认 |
| Agent 没有真实听觉 | 不夸大；首版基于工程、MIDI 和用户反馈 |
| Electron 权限过大 | Context Isolation；Preload 白名单；Renderer 无 Node 权限 |
| UI 只是聊天框 | 加 DAW Context、Range、Plan、Roles、Action Log、Before/After |
| 弹幕抢走产品叙事 | 只作为 Demo Skill；主 Demo 先展示用户直接操控 DAW |
| 音乐结果不好听 | 固定高质量 Demo 工程与动作模板；主创人工验收 |
| 现场 Ableton 连接失败 | 一键诊断；固定端口；预录备用视频 |

---

## 十二、路线图

### v0.1：Ableton Agent MVP

- Electron；
- Agent Runtime；
- Ableton MCP；
- 主 Agent；
- Plan / Approval / Execution / Verification；
- MIDI 编曲 Demo；
- Before / After。

### v0.2：Music Team

- Composer；
- Arranger；
- Player Agents；
- Mix Engineer；
- Skills；
- 可见的角色协作；
- 候选方案。

### v0.3：Listening & Versioning

- Bounce / Stem；
- 音频特征；
- 修改前后评价；
- 工程版本；
- Undo / Rollback；
- 更可靠的保存与导出。

### v0.4：More DAWs & Inputs

- FL Studio Adapter；
- Reaper Adapter；
- 客户评论入口；
- 弹幕和社区反馈；
- 远程协作。

---

## 十三、参赛叙事

### 核心叙事

> 我们不是把一个聊天框放到 DAW 旁边，而是把 Codex 的“理解上下文、制定计划、调用工具、验证结果”完整工作流带进音乐制作。

### Reverse

- 传统 AI 音乐：Prompt → 扁平音频；
- DAWdex：意图 → 可编辑 DAW 工程。

- 传统 DAW：人逐个执行操作；
- DAWdex：人负责审美目标，Agent 负责规划和执行。

### Qoder / 一个人一支团队

产品本身就是一个虚拟音乐制作团队，同时项目开发也可展示 AI 在产品、前端、Agent、MCP 和测试中的协作。

### Superun / Context to Code

核心 Context 是音乐人对 DAW、AI 音乐和真实修改工作流的理解。问题不在“再生成一首歌”，而在“把人话稳定变成可编辑音乐操作”。

### B 站

弹幕实时编曲是 DAWdex 的一个展示 Skill，证明社区反馈也能成为 DAW 可执行输入，但不把产品限制为 B 站工具。

---

## 十四、完成定义

v0.1 只有在以下条件满足时完成：

- Electron App 可启动；
- Agent Runtime 可替换，不与某个实现写死；
- Ableton 自检清楚；
- 能读取真实工程；
- 用户请求能转为计划；
- 写操作前有确认；
- MCP 写操作串行；
- 核心写操作都有读回验证；
- Ableton 中出现真实、可编辑的多轨修改；
- Before / After 可播放；
- Action Log 能解释发生了什么；
- 固定演示连续成功三次；
- 弹幕功能被明确放在 Demo / Skill 层；
- 文档不再把 Danmaku Orchestra 当作产品本体。
