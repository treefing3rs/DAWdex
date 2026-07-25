# DAWdex 完整产品定义

> 状态：正式产品方向
> 当前实现基线：0.3.0 / PR #17
> 最近核对：2026-07-25

## 一、最终结论

DAWdex 不是“Prompt 生成一个 Loop”，也不是给 openDAW 加一层聊天框。

> **DAWdex 是一个面向完整歌曲创作的 AI 虚拟录音棚 Harness。它把自然语言意图、音乐素材、编曲规则、角色协作和 openDAW 工程操作组织成可计划、可审批、可试听、可修改、可撤销的创作过程。**

它的前端也不是装饰性的 DAW 皮肤：

> **DAWdex 的前端把 openDAW 翻译成一部可以操作的动画片：DAW 功能成为录音棚房间和物件，播放与 Agent 状态成为乐队成员的动作，弹幕是用户指挥乐队的常驻自然语言入口。**

最终目标是让用户通过多轮对话完成一首有 Intro、Verse、Chorus、Bridge、Outro 和发展关系的歌曲，同时保留底层 MIDI、轨道、设备和 Undo，使作品仍然是可编辑工程，而不是一次性黑盒音频。

## 二、当前已经实现什么

0.3.0 是一条真实、可演示的垂直切片，不是完整歌曲系统。

当前已实现：

- 自然语言请求、工程快照、结构化计划、用户审批、执行和一步 Undo；
- 从 `midi/easy/` 的真实 MIDI 资产中检索、去重、选择并导入 openDAW；
- SQLite 元数据目录，以及目录缺失时的小规模回退扫描；
- 对既有角色轨道执行 upsert/replace，避免每轮只会无限新增；
- openDAW Studio 与 Agent Server 的计划和素材下载链路；
- `RealUiEventBridge` 将计划、执行、Undo、Transport 和可听轨道状态翻译为 UI 事件；
- 演奏真实性闸门：角色只有在轨道确认可听后才进入演奏状态；
- 明确触发的 90 秒 Mock 演示，默认真实模式；
- 五套角色素材、首次事件入场、电梯过场和六个录音棚频道；当前活跃轨道角色仍为 drums/bass/keys，制作人常驻控制室，guitarist 为扩展位；
- 五房间冒险游戏物件管线：28 个物件替身 sprite、轮廓命中、无遮罩 hover 与舞台内功能面板，以及走带播放时的演出态视频皮肤；
- Fig Mint 复古主机壳与键盘甲板承载舞台与物件面板；
- Agent Server 支持 Codex/Kimi/Qoder 本地 CLI 三运行时扫描、选择与严格路由，并用 MidiBundleRanker 对检索捆绑做质量排序；
- 演播厅外壳可以收起，直接操作底层真实 openDAW；`Esc`、工作台按钮和 `?workbench=1` 提供切换，收起期间真实事件仍持续同步；
- 屏幕内弹幕、采纳升格、乐队会议证据抽屉和真实干预入口。

当前 MIDI 资料事实：

- `midi/easy/` 共 194,553 个 MIDI 文件；
- 193,320 个文件通过当前目录校验并可进入完整索引；
- 当前角色主要为 `drums`、`bass`、`keys`；
- `midi/.dawdex/catalog.sqlite` 是本地生成物，不提交 Git，也不会随仓库下载。

## 三、当前没有实现什么

以下能力是正式方向，但不能写成已完成：

- 完整的 Song Blueprint 生成、保存和执行；
- Intro、Verse、Chorus、Bridge、Outro 等 Section 的跨段编排；
- Phrase、Region 和动机家族之间的发展关系；
- 对旋律进行 repetition、sequence、fragmentation、rhythmic displacement、call-and-response 等有约束的发展；
- 完整的吉他、Lead、弦乐和更多角色素材体系；
- 正式的乐器、SoundFont、Sampler、Synth、效果器与风格音色目录；
- 对真实音频峰值、电平和混音质量的分析；
- 房间物件热点与底层 DAW 操作的完整双向映射；
- 自动评价整首歌的结构张力、重复度、段落对比和混音完成度。

## 四、完整歌曲的核心模型

Loop 仍然有价值，但它只是 Phrase 或 Section 内部的局部材料。完整歌曲需要更高一层的持久结构：

```text
Song Blueprint
├── Global Constraints
│   ├── tempo / meter / key
│   ├── style / mood / energy curve
│   └── instrumentation / duration
└── Sections
    ├── Intro
    ├── Verse
    ├── Pre-Chorus
    ├── Chorus
    ├── Bridge / Breakdown
    └── Outro
```

工程层级统一为：

```text
Song
└── Section
    └── Phrase
        └── Region
            └── Notes
```

每次多轮对话不再等于“新增一条轨道”或“再叠一个 Loop”，而是对 Song Blueprint 提交 Patch，例如：

- 替换 Verse 的 Bass Phrase；
- 让第二次 Chorus 比第一次增加能量；
- 保留 Lead，但缩短 Bridge；
- 把 Keys 动机移交给 Guitar，并作节奏变体；
- 锁定 Chorus，只重新生成 Intro；
- 调整结构，不改已经确认的音符。

这使 Agent 可以在严格边界内工作，也可以在用户开放授权时进行更自由的编曲。

## 五、完整创作 Workflow

```text
用户自然语言
→ Creative Brief
→ Song Blueprint
→ 为当前 Section / Role 制定任务
→ 检索真实 MIDI 候选
→ 选择精确 Asset ID
→ 受约束地移调、裁剪、变奏和组合
→ 乐理、重复度、范围和工程规则校验
→ 用户审批
→ 以 Patch 写入 openDAW
→ 试听并读取新的工程状态
→ 评价段落功能与整曲发展
→ 下一轮继续、替换、锁定或撤销
```

Harness 的价值就在中间：它约束 Agent 何时检索、能改什么、如何验证、怎样写入，以及如何把结果反馈给下一轮。模型负责理解和提出音乐决策；Harness 负责把决策变成稳定、可追踪的工程操作。

## 六、Harness 的层级

### 1. Product State

保存歌曲目标、当前 Blueprint、已确认 Section、用户偏好、锁定内容和历史操作。没有这一层，多轮对话就会退化成无状态地反复生成。

### 2. Planning

把自然语言转为 Creative Brief、Section 目标、角色任务和 Patch。模型可以自由思考，但输出必须落入可验证结构。

### 3. Retrieval

从真实 MIDI 库选择候选。结构化字段优先使用 SQLite，不需要先给十几万文件做人工标签或全部向量化。

第一阶段索引应包括：

- role、track count、bar length、meter、tempo hint；
- pitch range、density、polyphony、onset/rhythm fingerprint；
- key/scale/chord hints；
- duplicate fingerprint、source path 和质量状态。

风格标签和 Embedding 是后续增强，而不是启动条件。更合理的路线是：

1. 自动解析全部 MIDI；
2. 结构化过滤和音乐特征排序；
3. 对高质量子集形成 motif/riff family；
4. 只对难以结构化的风格与听感信息增加 Embedding；
5. 人工只审核代表性家族和异常样本。

### 4. Music Transformation

变换必须受约束，而不是任意改音：

- 调性与音域适配；
- 小节对齐、量化和速度归一；
- 片段裁剪、延长和重新配器；
- 节奏位移、密度变化、删减和填充；
- 动机重复、序进、碎片化、反向回应和 Register 变化；
- 保留来源 Asset、变换记录和可撤销关系。

### 5. Validation

验证包括：

- 小节、PPQN、拍号和循环边界；
- 音域、重叠、异常时值和过密音符；
- 和声冲突与角色冲突；
- 与已有 Section 的相似度和重复度；
- 操作是否超出用户锁定范围；
- 工程写入和 Undo 是否真实成功。

### 6. Execution

通过稳定操作协议修改 openDAW。执行目标不是让模型直接操纵任意内部对象，而是暴露可审计的高层动作，例如：

- `create-section`
- `replace-phrase`
- `develop-motif`
- `assign-instrument`
- `set-device-parameter`
- `add-effect`
- `lock-section`
- `undo`

### 7. Evaluation

每轮写入后，读取新的工程事实，判断能量、对比、重复、留白和段落功能，再决定下一轮任务。没有评价闭环，Agent 只是在连续执行命令，不是在制作歌曲。

## 七、Prompt、Role、Subagent 与 Workflow

这些概念不能互相替代：

- **Prompt**：说明目标、规则、音乐审美和输出格式。
- **Role**：限定某个参与者的职责，例如 Producer、Arranger、Drummer、Bassist、Keyboardist、Mix Engineer。
- **Subagent**：在复杂任务中承担独立分析或候选提案的执行单元；它不是产品架构本身，也不是角色动画。
- **Workflow**：规定先后顺序、状态转移、审批点和失败恢复。
- **Harness**：把状态、工具、权限、素材、Workflow、验证和执行器组合起来。

早期不需要为了“多 Agent”而制造很多并行角色。一个强模型加明确的结构化阶段即可完成大部分 MVP；只有当任务能够独立验证、需要并行候选或角色责任确实不同，才值得拆成 Subagent。

## 八、前端不是皮肤，而是音乐状态翻译层

前端的核心原则是：

```text
每一个有意义的视觉状态都必须指出自己的真实事件来源。
没有发声确认，就没有演奏动画。
```

映射关系：

| 音乐/系统概念 | 录音棚中的表达 |
|---|---|
| openDAW 工程 | 整座虚拟录音棚 |
| Track / Role | 乐队成员及其房间 |
| Instrument / Device | 房间中的乐器、音源和设备 |
| Transport | 全局走带、节拍和 REC 状态 |
| Agent State | 等待、思考、准备、排队、演奏、失败动作 |
| User Request | 屏幕内弹幕与采纳灯牌 |
| Operation Evidence | 乐队会议和证据抽屉 |
| Song Blueprint | 控制室编曲白板 |
| Section State | 白板上的 Intro / Verse / Chorus 卡片 |
| Locked Section | 被图钉锁定的卡片 |

弹幕是唯一常驻自然语言输入，不代表唯一操作方式。房间物件、快速干预按钮、专业工程视图和 openDAW 原界面仍然可以作为直接操作或证据入口。

openDAW 保留三种身份：

1. 底层音频与工程引擎；
2. 可展开的专业编辑器；
3. 证明 Agent 真的修改了音乐的证据层。

## 九、MIDI 与音色是两条不同的系统

MIDI 决定“演奏什么”：音高、节奏、时值、力度和结构。

音色系统决定“听起来像什么”：

- SoundFont / SF2；
- Nano 或其他 Sampler；
- Vaporisateur 等 Synth；
- Drum Kit；
- 效果器链、空间、动态和混音参数。

因此，R&B MIDI 不应只凭文件名获得 R&B 音色。正式系统需要独立的 Instrument & Sound Catalog，把风格、角色、音域、音源、Preset、效果链和授权状态绑定起来。

浏览器不能直接加载用户电脑中的任意本地 VST/AU。可行路径是：

- 导入 SF2/SoundFont；
- 导入 WAV/AIFF 采样并交给 Sampler；
- 使用 openDAW 内置合成器和效果器；
- 未来通过受控的本地 Bridge 连接桌面音源。

## 十、为什么这个构想可行

难点不在于让模型“想出一首歌的结构”。Codex、Claude 等模型已经能提出 Verse、Chorus、Bridge、动机发展和配器方案。

真正困难的是：

- 状态能否跨多轮持续；
- 模型能否只修改获准范围；
- MIDI 候选能否稳定检索；
- 变体能否保持音乐性；
- Section 之间能否形成发展而不是复制；
- 音色能否符合风格；
- 写入、试听、撤销和视觉反馈能否保持同一事实。

这正是 Harness 的工作。因此这份构想不是文字包装；它已经给出了产品的核心对象、边界、Workflow 和可验证方向。它还不是完成的工程规格，但足以指导下一阶段实现。

## 十一、实施优先级

### P0：巩固 0.3.0

- 保证真实 MIDI 索引、Agent Server、Studio 和演示链稳定；
- 修正文档与实现事实；
- 完成听感验收和 Demo 兜底。

### P1：从 Loop 跨到 Song

- 定义 Song Blueprint、Section、Phrase 和 Patch Schema；
- 先完成一首 48–64 小节、5–7 个 Section 的固定实验；
- 支持锁定、替换、复制后发展和跨段落复用；
- 在控制室增加编曲白板；
- 让多轮对话围绕 Blueprint 修改，而不是新增 Loop。

### P2：提升音乐性

- 建立 motif/riff family 与相似度；
- 加入动机发展操作和整曲重复度评价；
- 扩展吉他、Lead 与更多角色；
- 建立正式 Instrument & Sound Catalog；
- 加入更完整的效果、自动化、真实电平和混音评价。

### P3：扩展产品形态

- 协作弹幕与多用户裁决；
- 版本树、A/B 候选和可恢复分支；
- 本地桌面音源 Bridge；
- 更丰富的房间物件和完整动画系统。

## 十二、不重复造轮子的边界

DAWdex 不需要重新实现：

- DAW 时间线、音频引擎和基础设备；
- 通用大模型推理能力；
- 向量数据库本身；
- 通用 MIDI 解析；
- 完整 VST Host。

DAWdex 应集中实现：

- 面向歌曲的音乐状态；
- 素材检索与音乐变换策略；
- 用户意图到受控 Patch 的编译；
- 工程执行、验证和评价闭环；
- 将这些真实状态翻译成可操作动画世界的前端。

## 十三、最终产品定义

> **DAWdex 是一个以 openDAW 为音乐引擎、以真实 MIDI 与音色资产为材料、以 Agent Harness 为调度核心、以虚拟录音棚为交互界面的完整歌曲创作系统。用户通过弹幕持续指挥，Agent 围绕 Song Blueprint 检索、安排、发展、验证并修改音乐；每一次角色动作、声音变化和工程操作都来自同一份可追踪状态。**

当前 0.3.0 证明了这条链可以真实运行；下一阶段的任务，是让它从“会生长的 Loop”跨越到“会发展的完整歌曲”。
