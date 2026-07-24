# DAWdex

> 让不会音乐的人通过弹幕指挥一支 AI 虚拟乐队。

DAWdex 是一个基于 [openDAW](https://github.com/andremichelle/openDAW) 的互动音乐创作产品。观众不需要理解乐理或传统 DAW，只需要发送“再炸一点”“像最终 Boss 出场”“钢琴不要这么温柔”这样的自然语言意见。制作人 Agent 会筛选弹幕，音乐意图编译器会把外行表达转换为结构化编曲任务，再由虚拟鼓手、贝斯手、键盘手和主奏逐轨演奏。

DAWdex 不直接生成一段不可编辑的成品音频。它计划以高质量 MIDI 素材为托底，对素材进行检索、移调、裁剪、节奏和音符变体，并把结果保留为 openDAW 中可以继续编辑的轨道。

## 核心体验

```text
观众弹幕
  → 纠错、去重、聚类
  → 制作人 Agent 裁决
  → 音乐意图编译器
  → 角色 Agent 工作回执
  → MIDI 检索与受约束变体
  → 乐理与工程规则校验
  → 在下一循环边界逐轨加入
  → 虚拟乐手开始演奏
```

角色对话和音乐修改必须来自同一份结构化指令。用户看到的“鼓手将加入四拍底鼓”不能只是一句表演性文案；同一条指令也必须驱动实际 MIDI 或工程操作。

## 产品定位

- 核心用户：不会音乐，但对音乐制作感兴趣、希望以游戏化方式参与创作的观众。
- 次要用户：需要快速获得编曲灵感的音乐创作者。
- 黑客松核心：弹幕驱动、角色化音乐制作流程、逐轨生长的沉浸式反馈。
- 核心能力：把非专业语言稳定转换为可解释、可执行、受乐理约束的音乐决策。

一句话介绍：

> DAWdex 是一个由弹幕驱动的 AI 虚拟乐队：制作人 Agent 将观众的日常语言编译成专业音乐任务，并带领虚拟乐手在统一乐理框架中逐轨完成一首作品。

## 当前原型状态

当前仓库已包含一个可运行的 openDAW 原型：

- openDAW Studio 中的全屏弹幕遮罩和 Agent 侧栏；
- Prompt 与工程快照提交；
- 本地 Agent Server，使用 OpenAI Agents SDK 返回结构化计划；
- 无 API 或请求失败时自动使用本地 Planner；
- `set-tempo` 与 `create-instrument` 两类可执行动作；
- 计划确认、一次事务应用和一步 Undo；
- 生成的 MIDI 音符直接写入 openDAW 工程。

当前版本还没有完成：

- 弹幕聚类和制作人评分；
- 角色化结构化输出；
- 高质量 MIDI 素材库索引、检索与变体；
- 鼓手等更多乐器角色；
- 新轨在循环边界自动加入；
- OpenAI、千问和中转站的统一 Provider 配置；
- Codex CLI 等本地 Agent Runtime；
- Electron 打包。

因此，目前生成结果容易雷同：现有协议只有四种固定 Pattern，音符编译器也是确定性的。相关限制在 [技术方案](docs/DAWdex_TechSpec.md) 中明确记录。

## 本地启动

要求 Node.js 23 或更高版本。

```powershell
cd opendaw
npm install
npm run build-wasm
npm run dev:dawdex-studio
```

Studio 默认地址为 `http://localhost:8080`。不启动模型服务也能使用本地 Planner。

如需使用模型，在另一个 PowerShell 窗口中运行：

```powershell
cd opendaw
$env:OPENAI_API_KEY = "你的 API Key"
$env:OPENAI_MODEL = "模型 ID"
npm run dev:dawdex-agent
```

Agent Server 默认监听 `http://127.0.0.1:8787/v1/plan`。不要把 API Key 写入源码、提交到 Git，或存入浏览器 Local Storage。

## 文档

- [产品需求文档](docs/PRD_DAWdex.md)
- [技术方案](docs/DAWdex_TechSpec.md)
- [系统架构](docs/architecture.md)
- [编码与架构规范](docs/coding-conventions.md)
- [三人分工与交付计划](docs/division-of-labor.md)
- [参赛赛道策略](docs/track-strategy.md)
- [GitHub 协作](CONTRIBUTING.md)
- [GitHub CLI 与身份验证指南](prd生成/GIT_GUIDE.md)

## 仓库结构

```text
docs/          当前有效的产品与工程文档
opendaw/       基于 openDAW 的 DAWdex 原型
prd生成/       参赛原始资料、交接说明和辅助计划
patches/       早期 Ableton MCP 验证留下的可复现补丁
third_party/   本地第三方检出，不提交
```

`patches/ableton-mcp-localhost-8765.patch` 是早期可行性验证材料，不再代表当前产品主链。

## 上游与许可证

DAWdex 的内置 DAW 原型基于 openDAW。`opendaw/` 保留其上游目录结构、版权信息和许可证声明；在发布、部署或分发前，必须继续遵守 openDAW 及其第三方依赖的许可证。

## 协作

三人团队通过短生命周期分支和 Pull Request 协作，`main` 必须始终保持可演示。不要提交密钥、`node_modules`、构建产物、缓存、未确认可分发的音频或 MIDI 素材。

具体流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。
