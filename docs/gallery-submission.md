# DAWdex — Gallery 提交文案

## 项目名称

DAWdex

## 标题（一句话摘要）

弹幕驱动的 AI 乐队 Agent——让日常语言成为可追溯的 DAW 操作

## 简介（约 3 行）

DAWdex 是一个基于 openDAW 的弹幕驱动 AI 乐队 Agent。公有代码可以核对 Agent 结构化 Plan、SQLite 检索器、用户审批门、DAW 写入与回滚，以及 Plan 到实际操作的引用。一个选定乐器、一条可编辑轨道和固定的 `Intro → Verse → Chorus → Bridge` 是本次拟展示的前端切片，尚未作为公有分支可运行功能落地。

## 详细描述（Markdown）

### 它是什么

DAWdex 把 openDAW 的专业能力组织成一条可理解的音乐制作链路：观众用自然语言弹幕指挥，AI 制作人理解意图、设计编排、选择素材，并把计划连接到真实工程对象。

拟展示切片刻意收窄到一个选定乐器、一条可编辑轨道和四个固定段落，目的是清楚呈现"语言 → 意图 → 编排 → DAW 操作"。它目前是展示设计，不是公有代码已经跑通的端到端能力；虚拟鼓手、贝斯手、吉他手和键盘手组成的多乐器、多轨完整歌曲体验是更远的产品方向。

### 核心链路

```
公有代码：自然语言 → Creative Brief / 结构化 Plan
→ SQLite 检索器 → 用户审批 → DAW 写入或回滚
→ 对照 Plan、目标对象与 Operation Reference

拟展示切片：选定乐器 → 一条可编辑轨道
→ Intro → Verse → Chorus → Bridge
```

### 为什么不一样

| 传统方案 | DAWdex |
|---|---|
| Prompt → 黑盒音频 | 弹幕 → 可编辑 DAW 对象 |
| 只看生成结果 | 能看见意图、编排步骤和工程操作 |
| AI 文案与工程脱节 | Plan、目标轨道和操作引用可以相互对照 |
| 单人创作 | 多人弹幕共创是产品方向 |
| 公有代码证据 | Plan、检索、审批、写入/回滚与操作引用 |

### 产品体验

- **拟展示切片**：一个选定乐器、一条可编辑轨道，固定 `Intro → Verse → Chorus → Bridge`；尚未作为公有分支可运行功能落地
- **可理解计划**：Agent 先展示结构化音乐意图、素材选择和编排步骤，再连接到工程操作
- **公有代码证据**：结构化 Plan、审批门、DAW 写入/回滚和操作引用
- **产品方向**：扩展到虚拟鼓手、贝斯手、吉他手和键盘手协作的多乐器、多轨完整歌曲

### 技术亮点

- **结构化 Agent 链路**：自然语言 → Creative Brief → 编排 Plan → DAW 操作
- **SQLite MIDI 检索器**：公有仓库包含建库、结构化查询和候选排序代码；本地曾索引 193,320 条素材，但数据集与生成后的数据库不随仓库分发
- **openDAW 工程执行**：公有代码可核对获批 Plan 的写入、失败回滚和操作引用
- **Rust/WASM 音频引擎**：浏览器内运行 openDAW 的音频能力
- **操作可追溯**：Plan、目标对象与实际写入动作通过引用关联
- **Song Blueprint 方向**：未来把拟展示的四段式切片扩展为多乐器、多轨完整歌曲

### 技术栈

openDAW · TypeScript · Rust/WASM · Vite · SQLite · OpenAI Agents · Node.js

### 团队

三人 48 小时黑客松作品

- **成员 A**：Experience & Story Lead — 视觉系统、角色设计、录音棚 UI、Demo 脚本
- **成员 B**：Agent & Music Intent Lead — AI Agent Server、MIDI 索引、协议设计、Codex 集成
- **成员 C**：Music Pipeline & Integration Lead — 音乐数据处理、质量闸门、WASM 编译、工程集成

## 技术栈标签

openDAW, TypeScript, Rust, WebAssembly, SQLite, OpenAI, Node.js, Vite, MIDI, AI Music, DSP

## GitHub 仓库

https://github.com/treefing3rs/DAWdex

## 在线演示

提交前补充。当前文案不声明已经部署公开在线 Demo。
