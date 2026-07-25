# DAWdex — Gallery 提交文案

## 项目名称

DAWdex

## 标题（一句话摘要）

弹幕驱动的 AI 虚拟录音棚——用日常语言制作可编辑的音乐 Loop

## 简介（约 3 行）

DAWdex 是一个基于 openDAW 的 AI 虚拟录音棚。你不需要懂乐理——发一条
弹幕“再炸一点”或“换成 R&B”，制作人 Agent 就会从 19 万级授权 MIDI
素材中检索、编排，让虚拟鼓手、贝斯手和键盘手逐轨进入。当前 0.3.0 交付
4/8 小节 Loop 垂直切片，产出不是黑盒音频，而是可继续编辑、可撤销的
openDAW 工程。

## 详细描述（Markdown）

### 它是什么

DAWdex 把 openDAW 的专业能力翻译成一个沉浸式虚拟录音棚：用户用自然语言
弹幕指挥，AI 制作人理解意图、设计编排、选择素材、调配音色，然后让鼓手、
贝斯手和键盘手依次进入。制作人是控制室角色；吉他手目前只有视觉素材，是
未来轨道扩展位。

每一步都可审批、可试听、可撤销。你看到的角色动画和你听到的声音来自同一份工程事实——不是表演性文案。

### 核心链路

```
用户弹幕 → AI 理解意图 & 生成 Creative Brief
→ 19 万 MIDI 素材库结构化检索（SQLite 索引）
→ 编排计划（可预览、可审批）
→ 一键写入 openDAW（风格化音色 + 角色化混音）
→ 虚拟乐手实时演奏 → 用户再次干预或撤销
```

### 为什么不一样

| 传统方案 | DAWdex |
|---|---|
| Prompt → 黑盒音频 | 弹幕 → 可编辑 MIDI 工程 |
| 一次生成、不可修改 | 多轮请求、角色轨局部替换、事务级 Undo |
| AI 文字与声音脱节 | 角色动画、计划文案和发声共享同一事实来源 |
| 视觉演出容易伪造 | 没有轨道可听确认，就没有演奏动画 |
| 当前只出 Loop | 以 Song Blueprint 作为明确的完整歌曲下一阶段 |

### 产品体验

- **虚拟录音棚**：六个房间（演播大厅、鼓棚、吉他贝斯棚、键盘阁楼、控制室、休息室），角色有入场动画和状态变化
- **审批制**：Agent 先提出可解释计划，展示所选 MIDI 和音色参数，用户批准后才执行
- **掀开地板**：随时切换到底层 openDAW 工作台直接编辑，外壳收起时事件桥继续同步
- **风格切换**：说"换成 dubstep"会原位替换已有轨道的素材和音色，不是叠加新轨
- **事务级 Undo**：每轮批准的工程修改合并为一个撤销步骤
- **当前范围透明**：当前是 4/8 小节 Loop；完整歌曲、Section 和 Motif
  发展属于下一阶段

### 技术亮点

- **双 Provider 链路**：Codex app-server 使用 ChatGPT 账号额度；也可配置
  OpenAI-compatible API。只有备用 Provider 实际配置并可用时才会回退
- **19 万 MIDI 素材库**：SQLite 索引，按角色/风格/BPM/密度/音域结构化检索，非向量 RAG
- **受控声音规划**：模型在真实 Capability 内规划声音；鼓轨固定在经试听批准的
  Playfield TR-808 / TR-909 中选择，Bass/Keys 可设计 Vaporisateur 参数
- **WASM 音频引擎**：Rust 编译的 25 个 DSP 设备插件，浏览器内实时合成
- **RealUiEventBridge**：DAW 工程事件 → 角色动画状态的单向同步，保证"没发声就不演奏"
- **明确扩展契约**：Song Blueprint → Section → Phrase → Region → Notes
  已作为下一阶段架构定义，但尚未声称已经交付

### 技术栈

openDAW · TypeScript · Rust/WASM (25 DSP plugins) · Vite · SQLite · OpenAI Agents · Node.js

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

（如果部署了填这里）
