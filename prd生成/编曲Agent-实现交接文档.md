# DAWdex 编曲 Agent 实现交接

## 一、方向变更

旧路线：

```text
Codex/Agent → MCP → Ableton Live
```

当前路线：

```text
观众弹幕
→ 制作人 Agent
→ 音乐意图编译器
→ 角色任务
→ MIDI 检索/变体
→ openDAW
```

Ableton MCP 已完成早期可行性验证，但不再是黑客松产品主链。当前原型直接基于 openDAW。

## 二、当前可运行能力

- 全屏 Agent Overlay；
- 弹幕移动；
- Prompt 输入；
- openDAW 工程快照；
- 本地 HTTP Agent Server；
- OpenAI Agents SDK；
- Zod 结构化输出；
- 网络失败时 LocalMusicPlanner；
- Plan 确认；
- 创建 openDAW Instrument 和 Note Region；
- 写入 Note Event；
- 一次编辑事务；
- Undo。

## 三、关键代码

```text
opendaw/packages/app/studio/src/agent/AgentOverlay.tsx
```

负责 UI、弹幕、提交、Plan 展示、Apply 和 Undo。后续应拆出角色 UI 和状态，不要继续膨胀。

```text
opendaw/packages/app/studio/src/agent/AgentClient.ts
```

请求 `http://localhost:8787/v1/plan`，12 秒超时，失败后调用本地 Planner。

```text
opendaw/packages/app/studio/src/agent/AgentProtocol.ts
```

当前协议只有 Tempo 和创建 Instrument。

```text
opendaw/packages/app/studio/src/agent/LocalMusicPlanner.ts
```

关键词本地回退。适合 Demo 保底，不是正式音乐理解。

```text
opendaw/packages/app/studio/src/agent/DawProjectAdapter.ts
```

读取工程摘要，编译固定 Pattern，并把动作写入 openDAW。

```text
opendaw/packages/server/dawdex-agent/src/server.ts
```

Node HTTP Server，使用 OpenAI Agents SDK 和 Zod。

## 四、当前限制

### 音乐重复

原因：

- 只有 `bass/chords/pulse/lead`；
- 固定和弦进行；
- 固定音符算法；
- 没有 Seed；
- 没有素材检索；
- 没有读取实际 MIDI；
- Snapshot 只包含轨道和 Region 数量。

仅更换模型不能解决。

### 角色只是 Producer

当前 Schema 只有 `rationale`，没有：

- MusicBrief；
- ProducerDecision；
- RoleTask；
- listenerExplanation；
- 角色播放状态。

### Provider 单一

当前只读取：

```text
OPENAI_API_KEY
OPENAI_MODEL
```

尚无：

- baseURL；
- Responses/Chat Completions 选择；
- 千问；
- 自定义中转；
- CLI Runtime。

### 循环体验未完成

当前创建 Region，但没有完整的：

- 固定基础 Loop；
- 下一循环边界调度；
- 三轨逐步加入；
- 角色动画与发声状态同步。

## 五、启动

Studio：

```powershell
cd opendaw
npm install
npm run build-wasm
npm run dev:dawdex-studio
```

默认：

```text
http://localhost:8080
```

模型 Server：

```powershell
cd opendaw
$env:OPENAI_API_KEY = "..."
$env:OPENAI_MODEL = "..."
npm run dev:dawdex-agent
```

默认：

```text
http://127.0.0.1:8787
```

不配置 Key 时前端自动使用 LocalMusicPlanner。

## 六、下一步实现顺序

### 1. 修复基础质量

- 检查并修复中文 UI/关键词乱码；
- 确保测试能够识别中文；
- 将当前 Agent 文件加入 Git；
- 运行 Agent Server TypeScript 检查；
- 运行 LocalMusicPlanner 测试。

### 2. 替换协议

增加：

```text
ProducerDecision
MusicBrief
RoleTask
MusicOperation
RolePlaybackState
AgentUiEvent
```

保留当前 `AgentPlan` 作为执行层或迁移适配器。

### 3. 角色工作回执

第一版：

```text
Producer
Arranger
Drummer
Bassist
Keyboardist
```

工作回执必须从 RoleTask 派生。

### 4. 三轨最短链

固定：

```text
128 BPM
A minor
4 bars
Drums → Bass → Keys
```

先用安全 Pattern 或本地 MIDI，跑通逐轨加入，再接智能检索。

### 5. MIDI 检索与变体

最少实现：

- 元数据；
- 按角色检索；
- 移调；
- 4 小节适配；
- 音域检查；
- 第四小节变化；
- Seed；
- 回退素材。

### 6. Provider

P0 不阻塞：

- OpenAI 原生；
- Local fallback。

P1：

- 千问；
- 自定义中转。

P2：

- Codex CLI 等 Runtime。

## 七、模型提示结构

不要使用一段无限增长的 Prompt。建议分层：

```text
System
  产品职责和禁止事项

Project Snapshot
  BPM、Key、Loop、已有角色和音符摘要

Audience Input
  原始文本、纠错文本、聚类和评分

Music Rules
  允许角色、动作、长度、音域和保留项

Output Schema
  ProducerDecision + MusicBrief + RoleTask[]
```

模型负责：

- 理解；
- 风格和情绪；
- 角色任务；
- 选择变体策略。

代码负责：

- BPM；
- Key/Scale；
- Bars；
- 音符合法性；
- 音域；
- 循环边界；
- Undo；
- 失败回退。

## 八、交接验收

- [ ] 新成员能在 30 分钟内启动 Studio；
- [ ] 无 Key 仍可生成本地 Plan；
- [ ] 有 Key 时能收到模型 Plan；
- [ ] Plan 可以创建可编辑 MIDI；
- [ ] Undo 成功；
- [ ] 能解释当前音乐为什么重复；
- [ ] 能定位 MusicBrief/RoleTask 下一步修改点；
- [ ] 不再依赖外部 Ableton；
- [ ] 不提交 Key、缓存和构建产物；
- [ ] README、PRD 和实现状态一致。
