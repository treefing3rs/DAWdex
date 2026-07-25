# DAWdex 产品需求文档

## 弹幕驱动的完整歌曲 AI 虚拟录音棚

| 项目 | 内容 |
|---|---|
| 文档状态 | 当前基线与正式产品方向 |
| 当前代码证据 | Structured Plan、SQLite Retriever、Approval、DAW Write/Rollback、Operation Ref |
| 当前可运行展示 | Drums / Bass / Keys 三角色 Guided Demo |
| 正在接入的展示切片 | 单乐器、单轨道、Intro → Verse → Chorus → Bridge |
| 正式下一阶段 | 多乐器、多轨道、Song Blueprint 驱动的完整歌曲创作 |
| 音乐底座 | openDAW |
| 核心输入 | 屏幕内弹幕及后续多轮对话 |

完整概念见 [`PRODUCT_VISION.md`](./PRODUCT_VISION.md)。

## 一、产品定义

> DAWdex 是一个面向完整歌曲创作的 AI 虚拟录音棚 Harness。用户用日常语言持续指挥，Agent 围绕 Song Blueprint 检索真实 MIDI、设计音色、安排角色并修改 openDAW 工程；所有结果可审批、可试听、可继续编辑、可撤销。

前端把 openDAW 的工程状态翻译为房间、物件和虚拟乐手动作。视觉反馈必须与真实计划、工程操作和发声状态共享同一事实来源。

## 二、用户与问题

### 核心用户

- 不熟悉 DAW 和乐理，但能描述感觉、场景和风格的人；
- 希望参与创作过程，而不是只等待一次生成结果的用户；
- 需要快速获取编曲素材和结构草案的音乐创作者。

### 核心问题

传统 DAW 专业但门槛高；Prompt-to-Song 容易得到不可解释、不可局部修改的黑盒音频。DAWdex 要同时解决：

- 用户不知道如何把“再炸一点”“更像 R&B”翻译成音乐操作；
- 单个好听 Loop 无法自然发展成完整歌曲；
- 多轮生成容易重复叠轨、破坏已确认内容或丢失上下文；
- AI 文字、角色动画与真正声音可能彼此脱节；
- MIDI 音乐性与最终音色经常被误认为同一件事。

## 三、产品原则

1. **完整歌曲优先**：Loop 是局部材料，不是最终产品结构。
2. **真实素材优先**：正式规划从已有 MIDI 资产检索，不用固定模板伪造替代。
3. **审批后执行**：Agent 先提出可解释计划，用户批准后才修改工程。
4. **局部 Patch**：多轮对话修改指定 Section、Phrase、Track 或设备，不默认无限新增。
5. **同一事实来源**：角色回执、动画、声音和 Undo 必须来自同一操作状态。
6. **没有发声就不演奏**：视觉不能抢先宣称音乐已经成功。
7. **可编辑、可撤销**：输出始终保留为 openDAW 工程。
8. **MIDI 与音色分离**：分别处理“演奏什么”和“听起来像什么”。
9. **模型自由度可调**：用户可以开放创作，也可以锁定结构、轨道或段落。

## 四、当前证据与展示边界

### 4.1 当前代码证据

- Agent Server 有结构化 Creative Brief / `AgentPlan` Schema 与解析器；
- `MidiCatalog` 有 SQLite 检索、排序、去重和候选校验实现；
- Studio 只有在用户点击“批准并执行”后才调用 DAW Adapter；
- Adapter 把工程修改写入一个 Undo 编辑，并在异常或写后校验失败时回滚；
- `RealUiEventBridge` 用 Plan ID / `operationRef` 关联角色任务和 Operation Result。

### 4.2 当前可运行 Guided Demo

点击 `↻` 会运行固定的 Drums、Bass、Keys 三角色时间线：弹幕被采纳，三个角色依次领任务并进入演奏状态，最后产生带 `operationRef` 的结果事件。它证明 UI 事件契约与叙事可以运行，不代表实时模型、MIDI 检索或真实三轨 DAW 写入已经发生。

### 4.3 正在接入的最小展示切片

目标体验是从 Drums、Bass、Keys 中选择一种乐器，用一条轨道按 `Intro → Verse → Chorus → Bridge` 推进。当前公有分支没有对应 Flow 控制器、View 或演示 MIDI 资产，因此它是界面设计目标和正在接入的验证路径，不是当前功能。

## 五、完整歌曲体验

### 5.1 Song Blueprint

完整歌曲由持久化 Blueprint 驱动：

```text
Song
└── Section
    └── Phrase
        └── Region
            └── Notes
```

Blueprint 至少包含：

- 全局 BPM、拍号、调性、风格、情绪和目标时长；
- Section 顺序、长度、功能和能量；
- 每个 Section 的角色、密度、和声与动机任务；
- 已锁定、可替换和待生成范围；
- MIDI 来源、变换记录和版本关系。

### 5.2 多轮对话

用户可以说：

- “把第二段主歌缩短四小节。”
- “副歌保留 Lead，只让鼓和 Bass 更有冲击力。”
- “Bridge 使用 Verse 的钢琴动机，但做碎片化处理。”
- “锁定第一遍副歌，重新做 Intro。”
- “不要再加轨，先把当前三轨发展成一首歌。”

系统必须把请求转为有边界的 Patch，并清楚显示：

- 修改对象；
- 保留对象；
- 素材来源；
- 变换方式；
- 预期音乐作用；
- 可撤销操作。

### 5.3 动机发展

系统不只检索相似 Loop，还需要支持：

- 原样重复与变化重复；
- sequence；
- fragmentation；
- rhythmic displacement；
- register change；
- call-and-response；
- thinning / filling；
- orchestration transfer。

每一种发展都要保留源动机和变换记录，并检查与整曲其他 Section 的重复度。

## 六、功能需求

以下条目同时记录仓库已有工程契约和下一阶段产品要求；代码存在不等于 clean clone 已完成端到端产品验证。

### FR-01：弹幕与自然语言输入

- 弹幕只在录音棚屏幕世界内显示；
- 输入条位于屏幕外控制台，是唯一常驻自然语言输入；
- 用户原文立即回显；
- 制作人采纳、拒绝和系统状态有明确身份；
- AI 乐迷必须标记，不得冒充真人；
- 专业视图展开时，弹幕不得遮挡编辑内容。

### FR-02：Creative Brief

Brief 必须表达开放风格，而不是只允许 Dubstep/R&B：

- style 与 alternatives；
- moods；
- BPM、key、bars；
- energy 与 swing；
- instrumentation；
- target roles；
- preserve/lock 范围；
- 用户可读 decision summary。

### FR-03：真实 MIDI 检索

- 只从授权资料库返回精确 Asset ID 与路径；
- 按 role、长度、节拍、密度、音域和音乐特征过滤排序；
- 去除重复 fingerprint；
- 不允许模型编造路径；
- 正式路径不得回到固定 Bass/Chord/Pulse/Lead 模板。

`MidiCatalog` 与索引命令已在仓库实现，但授权 MIDI 文件和生成的 SQLite 数据库不随 Git 分发。clean clone 只能核对实现，不能直接复现完整资料库检索。

### FR-04：编排与变换

- 创建角色轨道或替换已有生成轨道；
- 不覆盖用户轨道；
- 支持移调、量化、力度、humanize、裁剪、循环和音域适配；
- 下一阶段支持 Section/Phrase Patch 与动机发展；
- 所有变换记录来源和参数。

### FR-05：音色与工程控制

仓库控制契约包括：

- Vaporisateur 合成器结构化参数；
- Mixer、Compression、Delay、Reverb、Stereo 和 Maximizer 等安全效果；
- Transport、Loop、Track、Region、MIDI Transform、Instrument、Effect、Parameter、Automation、Bus、Send 和 Routing 操作。

要求：

- 只使用 Snapshot 暴露的真实 ID 和 Capability；
- Soundfont、Nano、Playfield、Apparat 需要现有兼容资产；
- 不创建不能发声的空乐器；
- 完整的风格音色目录作为独立后续能力。

### FR-06：计划审批与执行

- 默认先计划、后执行；
- Plan 显示音乐理由和具体动作；
- 1–8 个高层动作；
- 工程修改以一个 Undo 步骤提交；
- Transport 等即时操作不伪装为可撤销工程历史；
- 失败时保留之前可播放的工程。

### FR-07：虚拟乐手状态

轨道角色至少包含：

```text
idle -> thinking -> preparing -> queued -> performing
                                      \-> failed
```

- `performing` 必须通过 `TrackAudibleChanged(audible=true)`；
- Pause/Stop 时动作冻结或退出演奏；
- 状态、角色回执与同一个 `operationRef` 可追踪；
- 制作人不是普通轨道角色。

### FR-08：证据与可解释性

- 乐队会议显示 Plan、角色任务、执行回执和失败；
- 每个公开结论可以追溯到 Plan、Asset 或 openDAW 操作；
- 用户可定位受影响轨道；
- AI 生成内容与真实工程状态必须明确区分。

### FR-09：完整歌曲状态

下一阶段必须实现：

- Song Blueprint 创建、读取和 Patch；
- Section 新增、移动、复制、替换、锁定和删除；
- Phrase 与 Region 来源关系；
- 当前播放 Section 与 UI 编曲白板同步；
- 只修改获准范围；
- 结构变化与音符变化可以分别审批。

## 七、MIDI 与音色边界

MIDI 提供音符和节奏，不能保证风格音色。R&B 的 Bass MIDI 如果套用炸裂 Lead Synth，结果仍然不符合目标。

正式 Sound Catalog 至少需要：

- role / instrument family；
- style / mood；
- SoundFont、Sampler 或 Synth 来源；
- Preset 与参数；
- 效果链与 Mixer；
- 音域与复音限制；
- 资产是否已导入、可用和可分发。

技术路径可以使用 Vaporisateur 设计安全音色；外部 SF2 和采样必须先导入工程。浏览器不能直接访问用户电脑里的任意 AU/VST。当前 Guided Demo 不据此宣称正式风格音色目录已经完成。

## 八、范围

### 当前仓库可证

- 结构化 Brief / Plan Schema 与解析；
- SQLite Retriever 实现；
- 用户批准后执行的 UI 闸门；
- DAW Adapter 写入、Undo 与失败回滚；
- 带 `operationRef` 的角色任务和执行回执；
- 固定 Drums、Bass、Keys 三角色 Guided Demo。

### 正在接入

- 单乐器、单轨道选择与状态流；
- `Intro → Verse → Chorus → Bridge` 固定段落推进；
- 对应 View、演示 MIDI 资产和结果交付。

### 正式下一阶段

- 多乐器、多轨道协作；
- Song Blueprint 与 Patch；
- 48–64 小节完整歌曲实验；
- 5–7 个 Section；
- 动机家族、发展操作和重复度检查；
- 编曲白板；
- 正式 Sound Catalog。

### 暂不优先

- 完整 VST Host；
- 自研 DAW 音频引擎；
- 为全部 19 万 MIDI 做人工标签；
- 为“多 Agent”展示而强行拆分大量角色；
- 无法追溯的自动发布；
- 以黑盒音频替代可编辑工程。

## 九、验收标准

### 当前仓库证据

- [x] Structured Plan 通过 Schema 解析；
- [x] `MidiCatalog` 实现 SQLite 检索与去重；
- [x] Plan 必须经过用户批准按钮才交给 Adapter；
- [x] Adapter 支持一个 Undo 编辑与失败回滚；
- [x] UI 回执使用 Plan ID / `operationRef`；
- [x] Guided Demo 运行 Drums、Bass、Keys 三角色固定事件时间线。

### 最小展示切片

- [ ] 用户可以选择 Drums、Bass 或 Keys；
- [ ] 一次旅程只使用一种乐器和一条轨道；
- [ ] 段落严格按 Intro、Verse、Chorus、Bridge 推进；
- [ ] 界面显示当前、完成与待进行状态；
- [ ] Bridge 结束后进入单轨完成态；
- [ ] 完成代表性素材的人工听感验收。

### 完整歌曲 P1

- [ ] 多种乐器可以形成多条可独立编辑的轨道；
- [ ] 生成 48–64 小节 Blueprint；
- [ ] 至少包含 Intro、Verse、Chorus、Bridge/Breakdown 和 Outro；
- [ ] 第二次 Chorus 与第一次有关联但不完全复制；
- [ ] 用户可以锁定一个 Section 并只替换另一个；
- [ ] 多轮对话不会无限新增同一角色轨道；
- [ ] 每个 Phrase 都有素材来源和变换记录；
- [ ] 工程可试听、可局部编辑、可撤销；
- [ ] 控制室白板与真实 Section 状态一致。

## 十、成功标准

用户应在 10 秒内理解：“我可以用一句话指挥这支乐队。”

最小展示切片接入后，用户应在 90 秒内看到：

```text
选择一种乐器
→ 创建一条轨道
→ Intro
→ Verse
→ Chorus
→ Bridge
→ 单轨完成结果
```

产品长期成功的标准不是生成多少 Loop，而是用户能否在不掌握传统 DAW 的前提下，对一首完整歌曲持续做出有意义、可控和可恢复的音乐决策。
