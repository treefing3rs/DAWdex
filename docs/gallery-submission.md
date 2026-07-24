# DAWdex — Gallery 提交文案

## 项目名称

DAWdex

## 标题（一句话摘要）

弹幕驱动的 AI 虚拟乐队——让不会音乐的人用一句话指挥一首歌

## 简介（约 3 行）

DAWdex 把观众的弹幕变成音乐：你说"再炸一点"，AI 制作人就会从 19 万条专业 MIDI 素材中检索、编排，指挥虚拟鼓手、贝斯手和键盘手逐轨演奏。产出不是黑盒音频，而是一份可继续编辑的 DAW 工程。每一条弹幕都是创作的一部分。

## 详细描述（Markdown）

### 它是什么

DAWdex 是一个基于 openDAW 的互动音乐创作产品。观众不需要懂乐理，只需发送自然语言弹幕——"像最终 Boss 出场"、"钢琴柔一点"、"换成 R&B"——制作人 Agent 会把这些外行表达编译为结构化编曲指令，从真实 MIDI 素材库中检索匹配片段，然后由虚拟乐手逐轨加入演奏。

### 核心链路

```
观众弹幕 → AI 理解意图 → 19 万 MIDI 素材库检索 → 编排计划（可审批）→ 写入 openDAW → 风格化音色 → 实时播放
```

### 为什么不一样

| 传统方案 | DAWdex |
|---|---|
| Prompt → 黑盒音频 | 弹幕 → 可编辑 MIDI 工程 |
| 用户无参与感 | 每条弹幕影响最终结果 |
| 产出不可修改 | 产出是完整 DAW 工程，可继续编辑 |
| 单人创作 | 多人弹幕共同驱动 |

### 技术亮点

- **AI Agent 双链路**：Codex CLI（零 API 费用）或 OpenAI 兼容 API（支持任意中转），自动 fallback
- **19 万 MIDI 素材库**：SQLite 索引 + 结构化检索（角色/风格/BPM/密度/音域），非向量 RAG
- **风格化音色系统**：不同风格（Dubstep / R&B / Lo-fi 等）自动切换合成器参数
- **轨道原位替换**：说"换成 R&B"不会叠加新轨，而是原位替换已有编排
- **全链路可编辑**：每次操作都是一个 Undo 步骤，用户可随时回退
- **WASM 音频引擎**：Rust 编译的实时合成引擎，浏览器内运行

### 技术栈

openDAW · TypeScript · Rust/WASM · Vite · SQLite · OpenAI Agents · Node.js

### 团队

- **成员 A**：Experience & Story Lead — UI/UX、视觉系统、角色设计、Demo 脚本
- **成员 B**：Agent & Music Intent Lead — AI Agent Server、MIDI 索引、协议设计
- **成员 C**：Music Pipeline & Integration Lead — 音乐数据处理、质量闸门、工程集成

## 技术栈标签

openDAW, TypeScript, Rust, WebAssembly, SQLite, OpenAI, Node.js, Vite, MIDI, AI Music

## GitHub 仓库

https://github.com/treefing3rs/DAWdex

## 在线演示

（如果部署了填这里）
