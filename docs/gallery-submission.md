# DAWdex — Gallery 提交文案

> 当前提交事实：0.3.0 / PR #12
> 完整歌曲是正式产品方向，不表述为已经交付

## 项目名称

DAWdex

## 标题

弹幕驱动的 AI 虚拟录音棚——让每一句话都变成可编辑的音乐操作

## 简介

DAWdex 让用户用“再炸一点”“钢琴柔一点”这样的弹幕指挥虚拟乐队。Agent 从 19 万级真实 MIDI 资料中检索素材，提出可审批的编排、音色和 DAW 操作，再把结果写入 openDAW。角色只有在轨道真实发声后才会演奏，产出始终是可继续编辑和撤销的工程。

## 详细描述

### 它是什么

DAWdex 是一个基于 openDAW 的完整歌曲 AI 虚拟录音棚 Harness。

当前 0.3.0 已跑通一条真实垂直切片：

```text
弹幕
→ Creative Brief
→ 真实 MIDI 检索
→ Agent Plan
→ 用户审批
→ openDAW 写入
→ 发声确认
→ 角色演奏
→ 再次干预或撤销
```

前端把 DAW 翻译成一部可以操作的动画片：轨道成为乐手，设备成为录音棚物件，Transport 成为走带，Plan 与 Undo 成为乐队会议中的证据。

### 当前亮点

- **真实 MIDI，不是固定模板**：本地资料共 194,553 个文件，193,320 个通过目录校验；Agent 只从候选中选择精确 Asset ID。
- **Codex 账号或 OpenAI API**：本机 Codex `app-server`、OpenAI-compatible Provider 和本地回退共同保证演示可用。
- **计划后执行**：用户先看到音乐方向、素材、音色和操作，再决定是否写入。
- **可编辑、可撤销**：角色轨道可以原位替换，一轮修改合并为一个 Undo 步骤。
- **安全 DAW 控制**：支持 Transport、Track、Region、MIDI Transform、Instrument、Effects、Automation、Bus、Send 和 Routing，全部经过 Capability 与目标 ID 校验。
- **音乐与画面同源**：没有轨道可听确认，就没有角色演奏动画。
- **可巡游的录音棚**：电梯进棚、五套角色素材、演播大厅与五个功能房间形成统一世界；当前活跃轨道角色为 drums/bass/keys。
- **一键证明真实 DAW**：收起演播厅外壳即可露出同一个 openDAW 工程，事件同步不会中断。

### 与 Prompt-to-Song 的区别

| Prompt-to-Song | DAWdex |
|---|---|
| 一次生成黑盒音频 | 多轮计划并修改可编辑工程 |
| 用户等待结果 | 用户持续指挥、审批和撤销 |
| 很难局部替换 | 指定角色、轨道和设备进行 Patch |
| 画面只是进度 | 角色与房间翻译真实工程状态 |
| 来源不可见 | MIDI Asset、Plan 和 Operation 可追踪 |

### 完整歌曲方向

当前版本仍以 4/8 小节垂直切片为主。下一阶段会增加：

```text
Song Blueprint
└── Section
    └── Phrase
        └── Region
            └── Notes
```

用户将能够锁定 Chorus、替换 Verse、让第二次副歌发展第一次的动机，并在控制室编曲白板上看见整首歌的结构。它是正式产品方向，不是本次 Demo 已完成能力。

### 音色边界

当前 Agent 可以为 Vaporisateur 设计合成器、Mixer 和效果链。SoundFont、Sampler 和其他资产型设备必须先有工程资产；完整的风格乐器/音色目录仍在下一阶段。

### 技术栈

openDAW · TypeScript · Rust/WASM · Vite · SQLite · Codex app-server · OpenAI-compatible API · Node.js · MIDI

### 团队

- **成员 A**：Experience & Story — UI/UX、虚拟录音棚、角色和 Demo。
- **成员 B**：Agent & Music Intent — Provider、Brief、Plan 和 MIDI 检索。
- **成员 C**：Music Pipeline & Integration — 数据、质量闸门和 openDAW 执行。

## 技术栈标签

openDAW, TypeScript, Rust, WebAssembly, SQLite, Codex, OpenAI, Node.js, Vite, MIDI, AI Music

## GitHub 仓库

https://github.com/treefing3rs/DAWdex

## 在线演示

部署后补充。
