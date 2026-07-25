# DAWdex 文档索引

> 最近核对：2026-07-26 · 当前仓库证据：Agent/DAW 组件 + 三角色 Guided Demo

这个目录区分四类信息：当前事实、正式产品方向、实施契约和历史证据。阅读时不要把未来设计误认为已经完成，也不要用旧交接覆盖当前代码。

## 权威顺序

1. [`../README.md`](../README.md)：仓库入口、当前能力和启动方式。
2. [`PRODUCT_VISION.md`](./PRODUCT_VISION.md)：完整产品定义，以及从 Loop 走向完整歌曲的正式方向。
3. [`PRD_DAWdex.md`](./PRD_DAWdex.md)：产品范围、体验流程和验收标准。
4. [`architecture.md`](./architecture.md)：系统分层、数据流和当前/下一阶段边界。
5. [`DAWdex_TechSpec.md`](./DAWdex_TechSpec.md)：工程契约、MIDI 主链和验证命令。
6. [`design/README.md`](./design/README.md)：前端设计与当前舞台实现。

发生冲突时，以当前代码、已合并 PR、测试结果和以上顺序为准。

## 当前有效文档

| 文档 | 负责回答 |
|---|---|
| [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) | DAWdex 最终要成为什么 |
| [`PRD_DAWdex.md`](./PRD_DAWdex.md) | 用户体验、功能范围和完成标准 |
| [`architecture.md`](./architecture.md) | Agent、Harness、MIDI、openDAW 与前端如何协作 |
| [`DAWdex_TechSpec.md`](./DAWdex_TechSpec.md) | 当前代码、接口和后续技术契约 |
| [`design/DESIGN_DIRECTION.md`](./design/DESIGN_DIRECTION.md) | 前端世界观和发展方向 |
| [`design/STAGE_UI.md`](./design/STAGE_UI.md) | 舞台 UI 与 openDAW 工作台的设计和实现证据 |
| [`DEMO_RUNBOOK.md`](./DEMO_RUNBOOK.md) | 当前公开演示步骤与讲解边界 |
| [`coding-conventions.md`](./coding-conventions.md) | 编码约定 |
| [`gallery-submission.md`](./gallery-submission.md) | 对外提交文案 |
| [`track-strategy.md`](./track-strategy.md) | 比赛赛道策略 |

## 当前事实与正式方向

- **产品意义**：DAWdex 是弹幕驱动的 AI 乐队 Agent，把普通人的表达转成可理解、可追踪的音乐创作过程，而不是黑盒 Prompt-to-Audio。
- **当前代码证据**：结构化 Plan、SQLite 检索器、用户批准闸门、DAW 写入/回滚，以及带 `operationRef` 的真实 UI 回执桥。
- **当前可运行展示**：`↻` 启动固定的 Drums、Bass、Keys 三角色 Guided Demo；它演示 UI 事件叙事，不冒充实时 Agent/MIDI/DAW 执行。
- **正在接入的展示切片**：选择一种乐器，用一条轨道依次完成 Intro、Verse、Chorus 和 Bridge；当前公有分支尚无该 Flow/View/资产实现。
- **正式方向**：再扩展到多乐器、多轨道、Song Blueprint、Agent 编排和完整歌曲创作。

仓库只跟踪 MIDI 资料说明，不分发授权 MIDI 资产或生成的 SQLite 数据库。完整资料库检索需要在本地另行配置资产并建索引，clean clone 不能直接复现。
