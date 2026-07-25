# DAWdex 三人分工与 7 月 26 日前交付计划

> **历史执行计划。** 本文保存 2026-07-24 的三人分工与截止日期，不再代表
> 当前实现状态。PR #6、#7、#10、#11 后的权威状态见
> [`README.md`](./README.md)、[`PRODUCT_VISION.md`](./PRODUCT_VISION.md)
> 和 [`design/STAGE_UI.md`](./design/STAGE_UI.md)。文中的“全屏弹幕”已由
> “屏幕内弹幕”取代，三角色 Mock 也已扩展为真实事件桥、角色入场与六房间巡棚。

> 当前日期：2026-07-24。目标不是做完整 DAW 或完整多 Agent 平台，而是稳定完成“弹幕如何变成音乐”的一条可展示链路。

## 一、共同目标

7 月 26 日前完成：

```text
观众发送弹幕
→ 制作人采用
→ 音乐意图编译
→ 至少三个角色领取任务
→ 至少三条轨道逐步加入
→ 虚拟乐手进入演奏状态
→ 用户再次干预
→ 最终作品持续循环
```

完成标准：

- 90 秒内讲清；
- 不依赖外部 Ableton；
- 模型失败时有回退；
- 音乐不会明显错拍、跑调或爆音；
- UI、角色文案和真实音乐修改一致；
- `main` 可以由任意成员按 README 启动。

## 二、三位成员

### 成员 A：Experience & Story Lead

成员画像：擅长宣发、设计、前端页面、UI/UX 和交互。

负责：

- 整体视觉系统；
- 全屏弹幕表现；
- 制作人、总编曲师和虚拟乐手角色设计；
- 角色工作回执的对话体验；
- 专业术语与通俗解释；
- 演奏、等待、准备和失败状态；
- 逐轨加入时的动画与视觉反馈；
- Demo 脚本、录屏、路演和社交媒体素材；
- 目标用户快速测试。

接口：

```text
AgentUiEvent
RoleTask
RolePlaybackState
```

不负责：

- 在前端解析模型自由文本；
- 保存 API Key；
- 决定 MIDI 音符；
- 直接修改 openDAW 工程；
- 为了动画伪造成功状态。

7 月 24 日交付：

- 角色数量和视觉方向；
- 一张主界面高保真稿；
- 弹幕、编译、角色交接、演奏五种状态；
- 专业术语/白话双层文案模板。

7 月 25 日交付：

- 真实页面整合；
- 三个角色依次进入的完整动效；
- 固定 90 秒 Demo 视觉链；
- 初版宣传图和录屏布局。

7 月 26 日交付：

- 最终演示视频；
- Pitch 页面与提交截图；
- 现场讲解和备用话术。

### 成员 B：Agent & Music Intent Lead

成员画像：已完成 Codex → MCP → Ableton 早期验证，并完成当前 openDAW Agent 原型。由你负责。

负责：

- Agent Server 与 Provider；
- 制作人裁决；
- `MusicBrief`、`RoleTask` 和动作 Schema；
- 角色职责、提示词、Skills 和工作流；
- 角色工作回执与执行数据的一致性；
- openDAW Project Snapshot；
- AgentPlan 到 openDAW 操作；
- LocalMusicPlanner 回退；
- Prompt、模型错误和非法输出处理；
- 与成员 C 共同定义 MIDI 操作协议。

7 月 24 日交付：

- 冻结 MusicBrief/RoleTask Schema；
- 固定三个 P0 角色；
- 修复中文乱码；
- 让 Agent 返回角色任务，而不是只有 rationale；
- 明确当前 API 启动方式。

7 月 25 日交付：

- Prompt → 角色任务 → openDAW 三轨写入；
- 角色消息由任务派生；
- 模型失败走本地角色计划；
- 至少一条用户二次干预；
- 与 A 联调 UI Event。

7 月 26 日交付：

- 固定 Prompt 集与回退素材；
- 冷启动和断网 Smoke Test；
- 技术讲解；
- 锁定版本，不再扩展 Provider。

### 成员 C：Music Pipeline & Integration Lead

成员 C 的边界就是 A 与 B 之外仍然决定 Demo 成败的工程部分：音乐素材、轨道调度、集成和可靠性。

负责：

- 高质量 MIDI 素材整理和元数据；
- 素材许可证/来源记录；
- MIDI 索引和检索；
- 移调、裁剪、量化、音域和变体；
- 鼓/贝斯/键盘安全素材；
- 统一 BPM、调性、4/8 小节和循环；
- 新轨加入时间；
- 角色状态与轨道状态同步；
- 质量闸门；
- 构建、测试、固定 Demo 工程和启动脚本；
- 现场失败恢复。

这不是“剩余杂活”，而是把 Agent 的文字决定变成真正好听音乐的核心执行层。

7 月 24 日交付：

- 确定 3 个角色的安全 MIDI 素材；
- 为素材补充 BPM、Key、Bars、Role、Energy 元数据；
- 确定固定 Demo BPM、调性和循环长度；
- 设计检索与变体的最小接口。

7 月 25 日交付：

- 至少三种真实变换；
- 三轨长度和调性校验；
- 轨道依次加入；
- 旧 Loop 在失败时继续；
- 固定 Demo 工程可重复重置。

7 月 26 日交付：

- 在另一台机器或干净终端启动验证；
- 模型失败、素材为空、轨道失败测试；
- 预录备用视频；
- 构建和提交材料检查。

## 三、接口冻结

### B → A

B 提供稳定 UI 事件：

```ts
type AgentUiEvent =
    | DanmakuReceived
    | ProducerSelected
    | BriefReady
    | RoleStarted
    | RoleReady
    | RolePerforming
    | AgentFailed
```

A 不解析模型响应。

### B → C

B 提供：

```ts
type RoleTask = {
    readonly role: MusicRole
    readonly operation: MusicOperation
    readonly constraints: ReadonlyArray<string>
}
```

C 返回：

```ts
type PreparedMusicPart = {
    readonly taskId: string
    readonly notes: ReadonlyArray<CompiledNote>
    readonly transformReceipt: MidiTransformReceipt
    readonly quality: QualityGateResult
}
```

### C → A

C 发出真实播放状态。A 只在收到 `role.performing` 后启动对应演奏动画。

### 共享文件

以下文件修改前在群里说明：

```text
AgentProtocol.ts
package.json
package-lock.json
App.tsx
docs/architecture.md
docs/PRD_DAWdex.md
```

## 四、倒排计划

### 7 月 24 日：冻结产品与协议

共同：

- [ ] 确认一句话介绍；
- [ ] 只保留 3 个 P0 乐手；
- [ ] 固定 Demo Prompt；
- [ ] 固定 BPM、调性、4 小节 Loop；
- [ ] 冻结 RoleTask/MusicOperation；
- [ ] 确认 MIDI 素材可以用于演示；
- [ ] 所有人成功启动当前仓库。

当天退出条件：

> 不再讨论产品主线，所有人围绕同一条 90 秒链路开发。

### 7 月 25 日上午：最短真实链路

- [ ] 输入一条弹幕；
- [ ] Producer 选中；
- [ ] 返回 Drums/Bass/Keys 任务；
- [ ] 创建三条 openDAW MIDI；
- [ ] 三条轨道处于同一 BPM、调性和长度；
- [ ] 本地 Planner 可替代模型。

上午退出条件：

> 不看动效也可以完整跑通，且音乐不会明显出错。

### 7 月 25 日下午：产品化

- [ ] 接入角色 UI；
- [ ] 角色工作回执与实际任务一致；
- [ ] 轨道逐步加入；
- [ ] 演奏动画与轨道同步；
- [ ] 用户完成一次二次干预；
- [ ] 修复中文、布局和错误提示；
- [ ] 完成第一次 90 秒录屏。

下午退出条件：

> 一个第一次看到产品的人可以理解自己的弹幕如何改变音乐。

### 7 月 25 日晚上：冻结

- [ ] 只修 P0 Bug；
- [ ] 固定模型和回退；
- [ ] 固定工程和素材；
- [ ] 提交全部代码；
- [ ] `main` 可启动；
- [ ] 录制无剪辑成功版本。

### 7 月 26 日：提交缓冲

- [ ] 三人分别完整演示一次；
- [ ] 断网模式演示；
- [ ] 替换最终截图和视频；
- [ ] 检查赛道回答；
- [ ] 提交链接和仓库；
- [ ] 不临时增加功能。

## 五、优先级与砍除

按此顺序砍：

1. CLI Runtime；
2. 千问和多 Provider；
3. 真正独立多 Agent；
4. AI 乐迷自动附和；
5. 多弹幕聚类；
6. 主奏角色；
7. 混音师角色；
8. 高级变体；
9. Electron 打包；
10. 专业模式。

不能砍：

- 一条真实弹幕；
- 一次可见意图编译；
- 三个职责不同的角色；
- 三条真实可编辑轨道；
- 循环中逐步加入；
- 角色与音乐状态一致；
- 本地回退；
- 90 秒完整叙事。

## 六、每日协作

每天至少两次 10 分钟同步：

```text
我完成了什么？
今天只负责哪一个交付？
我会改哪些共享文件？
阻塞接口是什么？
当前 main 能否演示？
```

不要用“差不多完成”汇报。必须给出：

- 分支或 PR；
- 截图/录屏；
- 可执行命令；
- 明确失败条件。

## 七、完成定义

- [ ] A 能在不打开开发工具的情况下演示完整 UI；
- [ ] B 能解释弹幕如何成为结构化角色任务；
- [ ] C 能解释 MIDI 如何被检索、变换和安全加入；
- [ ] 任意成员可以按 README 启动；
- [ ] 模型无 Key 时仍可演示；
- [ ] 角色说的内容与实际音乐一致；
- [ ] 最终作品至少包含三条逐步加入的轨道；
- [ ] 现场故障有预录视频；
- [ ] GitHub 中不存在 API Key、缓存和未授权素材；
- [ ] `main` 对应最终提交版本。
