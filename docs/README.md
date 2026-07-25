# DAWdex 文档索引

> 最近核对：2026-07-26 · 代码基线：`0.3.0` / PR #17 + Family Sequence 集成分支

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
| [`design/STAGE_UI.md`](./design/STAGE_UI.md) | PR #17 后舞台 UI、五房间物件管线与 openDAW 工作台切换的真实实现 |
| [`DEMO_RUNBOOK.md`](./DEMO_RUNBOOK.md) | 现场演示、真实链与 Mock 兜底 |
| [`coding-conventions.md`](./coding-conventions.md) | 编码约定 |
| [`gallery-submission.md`](./gallery-submission.md) | 对外提交文案 |
| [`track-strategy.md`](./track-strategy.md) | 比赛赛道策略 |

## 历史证据

以下文件保留当时的任务、判断和分工，不再代表当前状态：

- [`HANDOFF_2026-07-24.md`](./HANDOFF_2026-07-24.md)
- [`division-of-labor.md`](./division-of-labor.md)
- [`design/DESIGN_BRIEFS.md`](./design/DESIGN_BRIEFS.md)

## 在制品分支

- `codex/dual-mode-stage-preview`（8 提交，工作台停靠舞台预览/共享 UI 会话）：**未合并、未提 PR**，其设计与实施计划文档只存在于该分支；采纳或搁置待决策，主干文档暂不描述其功能。

## 当前事实与正式方向

- **当前事实**：0.3.0 / PR #17 已跑通自然语言计划、真实 MIDI 素材检索与导入、审批、openDAW 写入、Undo、真实 UI 事件桥接、发声闸门、五套角色素材、电梯过场、六房间巡棚（顶栏 CH、舞台两侧箭头与方向键切台），以及可收起并露出真实 openDAW 的工作台模式；当前集成分支进一步加入 SQLite Index V2、Family/Section Sequence 检索、实际音符与鼓谱分析、跨轨 Bundle 排名、单角色多 Region 写入，以及 Codex/Kimi/Qoder 本地 CLI 三运行时适配；当前活跃轨道角色仍为 drums/bass/keys。
- **正式方向**：DAWdex 要创作可持续修改的完整歌曲，不以无限堆叠单一 Loop 为终点。
- **尚未完成**：持久 Song Blueprint 与可锁定的 Section/Phrase Patch、逐 Section 完整和弦识别、动机发展、正式乐器/音色目录、真实音频电平，以及房间物件与底层 DAW 的完整双向映射（物件面板已通，反向同步未完成）。

版本号和 PR 只能说明代码基线；产品完成度以这里的边界以及实际验证结果为准。
