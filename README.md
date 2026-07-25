# DAWdex

> 用弹幕指挥一座 AI 虚拟录音棚，创作可继续编辑的完整歌曲。

DAWdex 基于 [openDAW](https://github.com/andremichelle/openDAW)，把自然语言、真实 MIDI 素材、Agent 规划、DAW 操作和动画录音棚组织成一个可审批、可试听、可修改、可撤销的创作过程。

当前 0.3.0 已经跑通从请求到真实 MIDI 工程写入的垂直切片。正式产品方向不是无限叠加同一个 Loop，而是围绕 Song Blueprint，通过多轮对话发展 Intro、Verse、Chorus、Bridge 和 Outro，最终完成一首歌。

完整定义见 [DAWdex 完整产品定义](docs/PRODUCT_VISION.md)。

## 核心体验

```text
用户弹幕
→ Creative Brief
→ 检索真实 MIDI 候选
→ Agent 选择素材、音色与 DAW 操作
→ 用户审批
→ 写入 openDAW
→ 真实发声与角色动作同步
→ 再次干预、替换或撤销
```

完整歌曲阶段会在这条链上增加 Song Blueprint：

```text
Song
└── Section
    └── Phrase
        └── Region
            └── Notes
```

多轮对话因此会修改歌曲结构和指定段落，而不是每轮只新增一条轨道。

## 0.3.0 当前能力

音乐与 Agent：

- Codex ChatGPT 账号、OpenAI 兼容 API 和本地回退三种规划来源；
- Creative Brief 与结构化 Plan；
- 用户审批、单事务执行和 Undo；
- 从本地 SQLite 目录检索真实 MIDI，返回精确 Asset ID 与路径；
- 按角色创建或替换生成轨道，不覆盖用户轨道；
- Vaporisateur 合成器音色、Mixer 与最多四个效果的结构化设计；
- Transport、Loop、Track、Region、MIDI Transform、Instrument、Effect、Parameter、Automation、Bus、Send 和 Routing 控制平面；
- 所有 DAW 控制在执行前经过能力目录和目标 ID 校验。

前端与演示：

- 复古监视器外壳、像素录音棚和屏幕内弹幕；
- 默认真实模式；`?mock=1` 或顶栏 `↻` 才进入 90 秒演示；
- `RealUiEventBridge` 同步 Plan、Apply、Undo、Transport 和轨道可听状态；
- 没有真实发声确认，角色不会显示为正在演奏；
- 五套角色素材、首次事件入场、2.6 秒电梯过场；当前活跃轨道角色仍是 drums/bass/keys，制作人常驻控制室，guitarist 为扩展位；
- 演播大厅、鼓棚、吉他贝斯棚、键盘阁楼、控制室和休息室六个频道；
- 乐队会议证据抽屉与真实干预入口。

## MIDI 资料库

授权资料位于 `midi/easy/`：

- 194,553 个 MIDI 文件；
- 193,320 个文件通过当前目录校验；
- 当前角色为 `drums`、`bass`、`keys`。

完整索引保存在 `midi/.dawdex/catalog.sqlite`。它是本地生成物，不提交 Git，也不会随仓库下载。新克隆或 MIDI 内容变化后运行：

```bash
cd opendaw
npm run index:midi -w @dawdex/agent-server
```

Agent Server 成功打开完整索引时应报告大约：

```text
DAWdex opened 193320 indexed MIDI assets
```

如果数据库不存在，系统会回退扫描较小的精选目录。该回退只保证可运行，不代表完整资料库已经参与检索。

## MIDI 不等于音色

MIDI 决定音高、节奏、时值和力度；乐器、SoundFont、Sampler、Synth、效果器与 Mixer 决定最终音色。

当前正式、安全的自动音色路径是 Vaporisateur 参数与效果链。openDAW 也支持 Soundfont、Nano、Playfield 等设备，但需要工程内存在对应资产；SoundFont/SF2 或采样通常需要用户导入。面向 R&B、House、Jazz 等风格的正式 Instrument & Sound Catalog 尚未完成。

## 尚未完成

- Song Blueprint、Section/Phrase/Patch 执行器；
- 跨段落编曲与动机发展；
- 正式的乐器和风格音色目录；
- 吉他、Lead 和更多角色的完整音乐素材；
- 真实音频峰值/电平事件；
- 房间物件热点与 DAW 操作的完整映射；
- 整首歌的结构、重复度与混音评价闭环。

这些是正式下一阶段，不应被描述为 0.3.0 已交付能力。

## 本地启动

要求 Node.js 23 或更高版本。

```bash
cd opendaw
npm install
npm run build-wasm
npm run dev:dawdex-studio
```

Studio 默认地址为 `http://localhost:8080`。

另开终端启动 Agent Server：

```bash
cd opendaw
npm run dev:dawdex-agent
```

浏览器中的“连接 Codex”使用本机 Codex `app-server` 和 ChatGPT 登录；也可以配置：

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

默认 Provider 顺序为 Codex → OpenAI；计划链路失败时 Studio 使用本地回退。不要把密钥写入源码、提交 Git 或存入浏览器 Local Storage。

### 本地资源修复

- Vite 在扫描静态资源前生成 `build-info.json`，避免首次启动出现 “Error loading build info”。
- 本地开发通过同源代理加载 Stock Soundfont 和 Demo Bundle，避免 `localhost` 被云端 CORS 拦截。

## 文档

- [文档权威索引](docs/README.md)
- [完整产品定义](docs/PRODUCT_VISION.md)
- [产品需求文档](docs/PRD_DAWdex.md)
- [系统架构](docs/architecture.md)
- [技术方案](docs/DAWdex_TechSpec.md)
- [前端设计](docs/design/README.md)
- [演示彩排脚本](docs/DEMO_RUNBOOK.md)
- [GitHub 协作](CONTRIBUTING.md)

## 仓库结构

```text
docs/          当前产品、架构、技术和设计文档
midi/easy/     本地授权 MIDI 资料；完整数据不依赖 Git 分发
opendaw/       DAWdex Studio、Agent Server 与 openDAW 底座
prd生成/       原始资料和历史辅助计划
patches/       早期 Ableton MCP 验证补丁
third_party/   本地第三方检出，不提交
```

`patches/ableton-mcp-localhost-8765.patch` 是早期可行性证据，不代表当前执行链。

## 上游与协作

`opendaw/` 保留 openDAW 的上游目录结构、版权和许可证声明。发布、部署和分发时必须继续遵守 openDAW 及第三方依赖许可。

团队使用短生命周期分支和 Pull Request；`main` 必须始终可演示。不要提交密钥、`node_modules`、构建产物、SQLite 索引或未确认可分发的音频/MIDI 资产。
