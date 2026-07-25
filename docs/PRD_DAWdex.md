# DAWdex 产品需求文档

## 弹幕驱动的完整歌曲 AI 虚拟录音棚

| 项目 | 内容 |
|---|---|
| 文档状态 | 当前基线与正式产品方向 |
| 当前实现 | 0.3.0 / PR #12 |
| 当前产品形态 | Loop 导向的真实垂直切片 |
| 正式下一阶段 | Song Blueprint 驱动的完整歌曲创作 |
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

## 四、当前 0.3.0 体验

### Flow A：真实计划与执行

1. 用户在录音棚界面输入弹幕；
2. Studio 读取当前工程 Snapshot；
3. Codex、OpenAI 或本地 Planner 生成 Creative Brief 和 Plan；
4. Agent 从 SQLite 目录给出的真实 MIDI 候选中选择精确资产；
5. Plan 显示 MIDI、音色、效果和 DAW 操作；
6. 用户批准；
7. Studio 以一个 Undo 事务写入 openDAW；
8. `RealUiEventBridge` 同步执行、走带和轨道可听状态；
9. 角色在真实发声后进入演奏状态；
10. 用户可以再次干预、替换或撤销。

### Flow B：90 秒演示

Mock 不默认运行。只有 `?mock=1` 或点击 `↻` 才启动固定时间线，用于现场演示与故障兜底。Mock 与真实链共用同一 UI 事件签名，不能被描述为真实模型已完成的操作。

### Flow C：巡棚

用户可以切换演播大厅、鼓棚、吉他贝斯棚、键盘阁楼、控制室和休息室。当前房间展示对应角色和全局走带/弹幕状态；控制室是制作人与未来编曲白板的主要空间。

### Flow D：掀开舞台地板

用户可以点击“工作台”、按 `Esc` 或使用 `?workbench=1` 收起演播厅外壳，直接操作底层真实 openDAW。外壳收起时事件桥继续同步；返回演播厅后立刻显示最新工程状态。工作台与投屏模式互斥。

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
- 完整索引缺失时明确使用小规模回退；
- 正式路径不得回到固定 Bass/Chord/Pulse/Lead 模板。

### FR-04：编排与变换

- 创建角色轨道或替换已有生成轨道；
- 不覆盖用户轨道；
- 支持移调、量化、力度、humanize、裁剪、循环和音域适配；
- 下一阶段支持 Section/Phrase Patch 与动机发展；
- 所有变换记录来源和参数。

### FR-05：音色与工程控制

当前支持：

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
- Mock、Fallback 和真实模型来源必须明确区分。

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

当前可使用 Vaporisateur 自动设计安全音色；外部 SF2 和采样必须先导入工程。浏览器不能直接访问用户电脑里的任意 AU/VST。

## 八、范围

### 当前已交付

- 真实 MIDI 目录检索与资产下载；
- Prompt → Brief → Plan → Approval → openDAW → Undo；
- 角色轨道 create/replace；
- 安全 DAW 控制平面；
- 真实 UI 事件桥接和发声闸门；
- 五套角色素材、电梯过场、六房间巡棚；当前活跃轨道角色为 drums/bass/keys；
- 可收起演播厅外壳并露出真实 openDAW 的工作台模式；
- 明确触发的 Mock 兜底。

### 正式下一阶段

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

### 0.3.0 垂直切片

- [x] 用户请求生成结构化计划；
- [x] Plan 使用真实 MIDI Asset ID；
- [x] 用户批准后写入 openDAW；
- [x] 替换生成角色时不无限叠轨；
- [x] 操作为一个 Undo 步骤；
- [x] 角色仅在轨道可听后演奏；
- [x] Mock 不默认冒充真实链；
- [x] 六个房间可切换；
- [ ] 完成代表性风格的人工听感验收。

### 完整歌曲 P1

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

用户应在 90 秒内看到完整因果链：

```text
弹幕
→ 采纳
→ 真实素材与计划
→ 角色准备
→ openDAW 写入
→ 真实发声
→ 可以继续修改或撤销
```

产品长期成功的标准不是生成多少 Loop，而是用户能否在不掌握传统 DAW 的前提下，对一首完整歌曲持续做出有意义、可控和可恢复的音乐决策。
