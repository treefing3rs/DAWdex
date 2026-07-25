# DAWdex 轨道发展与 MIDI Family 升级交接

> 日期：2026-07-25
> 性质：下一轮音乐生成升级的实施交接
> 优先级：P0
> 前置阅读：`README.md`、`PRODUCT_VISION.md`、`architecture.md`、
> `DAWdex_TechSpec.md`、`HANDOFF_2026-07-24.md`

## 实施状态（2026-07-26）

本交接中的主链已经完成第一版落地：

- SQLite Index V2 已保存 Family、Section、实际音符调性/根音时间线、音乐指纹、
  能量和鼓映射覆盖率；
- `MidiCatalog.sequences()` 会按风格、速度、角色查询至少三个 Section 的素材
  Family，并为每个原始顺序只选一个真实 Variant；
- 模型仍负责 Creative Brief、Family 锚点、跨轨 Bundle、音色和效果选择；
  Harness 将模型选中的锚点展开成同 Family 的精确 Asset ID/Path，模型不能编造
  Section 路径；
- Bass/Keys Bundle 排名已加入实际调式置信度、模式与相对根音时间线距离；
- `MusicPlan` 的角色动作已能携带 `midiSections`；
- Studio 会预加载一个角色的全部 Section，并在同一角色轨上创建多个连续
  Note Region；替换仍使用原轨，整个计划仍可一次 Undo；
- EZ/Toontrack GM Core 鼓谱已改为
  `source note → Canonical Drum Role → TR-808/TR-909 Pad`，Snare/Low Tom
  反置和 808 Crash 错位已修复，未知 articulation 会丢弃而不再取模乱映射；
- Family 顺序、多 Region 写入、808/909 独立映射与未知鼓音符均已有回归测试。

已验证的 Phase 0 数字见 `PHASE0_MIDI_FAMILY_AUDIT_2026-07-26.md`。当前仍需
诚实保留以下限制：

- Keys 可可靠解析的 Family 覆盖率只有约 4.2%；找不到 Family 时会明确回退为
  单段候选，不能假装已经拥有截图中的插件内部标签；
- 当前跨轨评分使用全局调式和相对根音时间线，尚未达到逐 Section 完整和弦
  识别与拒绝的最终标准；
- 第一版由 Harness 稳定选择每个 Section 的最高排名 Variant；模型尚未在合法
  Variant 列表内逐段决定休止、Fill 或替换单一 Section；
- EZX 非 GM 特殊 articulation 仍需来源专属 Mapping Layout 或人工试听的
  Curated Drum Library 才能扩大覆盖。

## 一、这次纠正的产品理解

DAWdex 的目标不是把一个 4/8 小节 MIDI Loop 重复铺满一条轨道。

目标是：

> 从 EZkeys、EZbass、EZdrummer 素材包已经组织好的 Song/Groove Family
> 中，按原始段落顺序为每个角色挑选多个片段，在同一条轨道上创建多个
> Region，让 Drums、Bass、Keys 随时间持续发展。

例如一个 Keys 素材家族在 EZkeys 2 中显示为：

```text
Epic Metal
└─ Straight 4/4
   └─ Melodic Progressive 102 BPM
      ├─ Intro
      ├─ Theme
      ├─ Pad Progression
      ├─ Arpeggio
      └─ Outro
```

DAWdex 应在同一个 `Melodic Progressive 102 BPM` Family 内：

1. 从 `Intro` 选择一个真实 MIDI；
2. 从 `Theme` 选择一个真实 MIDI；
3. 从 `Pad Progression` 选择一个真实 MIDI；
4. 从 `Arpeggio` 选择一个真实 MIDI；
5. 从 `Outro` 选择一个真实 MIDI；
6. 按原始顺序放入同一条 Keys 轨道的连续 Regions。

其他包可能使用：

```text
Intro → Verse → Pre-Chorus → Chorus → Bridge → Outro
```

或者：

```text
Intro → Theme → Pad Progression → Arpeggio → Outro
```

系统不能把段落名称写死成唯一一种流行歌曲结构。它需要保留素材 Family
自己的段落顺序，同时把不同角色映射到统一的时间槽位。

## 二、已经验证的本地素材事实

本地 `midi/easy/` 仍是唯一授权的生产 MIDI 来源，角色为：

```text
drums
bass
keys
```

EZbass 路径已经明确包含连续的 Family/Section 信息，例如：

```text
bass/MIDI/000500@EZbass/105@Straight_4#4/
├─ 066-S011@Intro
├─ 066-S012@Verse
├─ 066-S013@Pre_Chorus
└─ 066-S014@Chorus
```

这里的 `066` 是 Family 线索，`S011...S014` 同时编码了歌曲和段落顺序。
类似结构在不同 BPM、拍号和 Swing/Straight 目录下大量存在。

Keys 库也包含 Pack、Song、调性、BPM、Progression 等层级，例如：

```text
keys/MIDI/000970@Piano-Loops/000913@Pop_Piano_Vol_1/
└─ 009@Song1_F_124bpm_Prog_1
```

但是，本轮在当前 Windows 工作区中没有从路径名直接找到截图里的：

```text
Melodic Progressive 102 BPM
Intro / Theme / Pad Progression / Arpeggio / Outro
```

下一轮必须先确认以下二者之一：

1. 该 EZkeys 2 MIDI Pack 尚未同步进当前 `midi/easy/keys`；
2. 文件已经存在，但人类可读标签来自 EZkeys 内部数据库，磁盘路径只保存数字
   ID，需要读取 Toontrack 元数据或建立 ID 到显示名的映射。

不能在没有核实素材实际可定位性的情况下，把截图中的 Family 名称硬编码进
生产逻辑。

## 三、当前代码为什么做不到

当前链路是：

```text
Creative Brief
→ 每个角色检索少量独立 MIDI
→ 从 drums/bass/keys 各选一个
→ 组成一个 Bundle
→ 每个角色创建一个 Region
→ 不足目标小节时重复同一个片段
```

主要限制：

1. SQLite 把每个 MIDI 当作孤立 Asset，没有正式的 Family 和 Section 表；
2. `MidiCatalog` 没有“返回一个有序段落家族”的查询；
3. `MidiBundleRanker` 只给三个单文件组合评分；
4. `MusicPlan` 的角色动作只能引用一个 MIDI Asset；
5. `DawProjectAdapter` 每个角色只创建或替换一个 Note Region；
6. `fitToBars` 会重复同一片段，而不是拼接新的段落；
7. 调性大量从路径猜测，未分析实际音符；
8. Bass 与 Keys 只做全局移调，未比较和弦进行或调式；
9. 质量闸门只验证写入和重复，不验证纵向发展和跨轨和声。

因此，当前系统同时缺少：

- **横向发展**：同一轨 Intro 到 Outro 的连续变化；
- **纵向兼容**：同一时间位置的 Drums、Bass、Keys 能否一起演奏。

## 四、目标架构

下一版检索单位要从单个 Asset 升级为：

```text
Asset
→ Section Variant
→ Song/Groove Family
→ Role Sequence
→ Cross-role Arrangement
```

建议的数据关系：

```text
MidiFamily
├─ identity
│  ├─ role
│  ├─ vendor / library / pack
│  ├─ style
│  ├─ groove
│  ├─ meter
│  └─ source BPM
├─ ordered sections
│  ├─ section kind
│  ├─ section label
│  ├─ source order
│  └─ energy/function
└─ variants
   ├─ MIDI Asset ID
   ├─ key/mode/chord signature
   ├─ rhythm signature
   └─ quality state
```

一次生成的结果应是：

```text
ArrangementSequence
├─ timeline slots
│  ├─ slot 1: intro
│  ├─ slot 2: establish
│  ├─ slot 3: develop
│  ├─ slot 4: peak
│  └─ slot 5: outro
├─ drums sequence: 5 Regions
├─ bass sequence: 4–5 Regions
└─ keys sequence: 5 Regions
```

角色不必拥有相同的原始 Section 名称，但必须对齐到相同时间槽位和能量曲线。
某个角色可以在特定槽位休止，不能为了凑齐而随意复制上一段。

## 五、SQLite Index V2

### 5.1 Family 与 Section 字段

在现有 Asset 数据上增加或拆表保存：

```text
library
pack
family_id
family_label
groove
meter
source_bpm
section_label
section_kind
section_order
variant_label
```

`family_id` 必须稳定且可重建。优先从：

1. 共同父目录；
2. 数字前缀；
3. `S011/S012/...` 一类连续编号；
4. Toontrack 元数据；
5. 规范化路径；

推导，不能只使用模糊字符串相似度。

### 5.2 实际 MIDI 音乐分析

Bass 和 Keys 必须从音符本身提取：

```text
key_root
mode
key_confidence
pitch_class_histogram
chord/root timeline
normalized harmonic signature
polyphony
register
note density
onset/rhythm signature
velocity statistics
pickup and phrase length
```

Drums 必须提取：

```text
kick/snare/hat/tom/cymbal hit histogram
onset grid
swing
syncopation
fill likelihood
energy
```

索引中的音乐指纹应基于标准化音符内容。原始文件 SHA-256 可以继续保留用于
字节去重，但不能继续被当作唯一的“音乐指纹”。

### 5.3 Section 归一化

保留原始标签，同时映射到可比较的功能：

```text
Intro                → intro
Verse / Theme        → establish
Pre-Chorus / Build   → develop
Chorus / Arpeggio    → peak 或 develop（由能量分析决定）
Bridge / Breakdown   → contrast
Outro / Ending       → outro
Fill                 → transition
```

映射不是绝对规则。原始 `section_order` 优先，标准化 `section_kind` 用于跨角色
对齐和缺失段落补位。

## 六、Family Sequence Retrieval

检索不再分别给每个角色返回 12 个无关文件，而应分两级。

### 第一级：选择 Role Family

根据 Creative Brief 查询：

```text
style/mood
tempo range
meter
straight/swing
target section count
energy arc
role
```

返回每个角色的候选 Family，而不是孤立 Asset。

### 第二级：在 Family 内选择 Section Variant

对 Family 的每个有序 Section：

1. 选择一个真实 MIDI Variant；
2. 保留原始 Section 顺序；
3. 避免连续选择音乐指纹相同的 Variant；
4. 优先保持共同 Motif/Groove；
5. 不允许把一个 Section 无限复制成整首轨道。

如果 Family 缺少 Outro 或中间段落，可以：

- 允许角色休止；
- 使用同 Family 中功能最接近的 Section；
- 使用明确标记的 transition/fill；
- 降低 Family 评分并选择另一个更完整的 Family。

不得静默使用任意无关文件补齐。

## 七、跨轨和声与节奏兼容

### 7.1 Keys 作为和声锚点

第一版建议让 Keys Sequence 提供：

```text
target key/mode
per-section chord/root timeline
harmonic rhythm
energy arc
```

所有 Keys Section 应来自同一个 Family，并使用一致的整体移调量。

### 7.2 Bass 兼容

Bass Family 不能只因为 BPM 接近就入选。至少比较：

```text
mode compatibility
normalized root sequence
chord-change positions
phrase length
groove/onset similarity
register
```

全局移调只能改变调高，不能修复不同的和弦功能。例如：

```text
i–VI–III–VII
```

和：

```text
i–iv–VII–III
```

即使都标成 Minor，也不是同一进行。若根音序列不兼容，应拒绝该 Bass Family，
而不是强行移调后导入。

### 7.3 Drums 兼容

Drums 不参与调性，但需要匹配：

```text
meter
straight/swing
tempo feel
section energy
fill/transition position
kick density versus bass onset
```

### 7.4 鼓映射审计结论：当前映射表确实有错

2026-07-25 对当前代码和实际预设进行了重新核验。

当前 `MidiAsset.ts` 假定：

```text
Playfield 60 kick
Playfield 61 low tom
Playfield 62 snare
```

但 DAWdex 当前代码实际下载的两个 openDAW stock preset UUID 是：

```text
TR-808 7095d4f6-737d-42b7-b182-76d512b1ac8a
TR-909 bdd30b37-2d5c-4c72-b72d-fe2ba65a193e
```

直接下载并使用 openDAW 自己的 `BoxGraph` 解码后，真实 Pad 为：

| MIDI Note | TR-808 | TR-909 |
|---:|---|---|
| 60 | Bass Drum | Bass Drum |
| 61 | Snare Drum | Snare |
| 62 | Low Tom | Low Tom |
| 63 | Mid Tom | Mid Tom |
| 64 | Hi Tom | High Tom |
| 65 | Rim Shot | Rimshot |
| 66 | Hand Clap | Clap |
| 67 | Closed Hi-Hat | Closed Hat |
| 68 | Open Hi-Hat | Open Hat |
| 69 | Cowbell | Crash |
| 70 | Cymbal | Ride |
| 71 | Claves | 空 |
| 72 | Low Conga | 空 |
| 73 | Mid Conga | 空 |
| 74 | Hi Conga | 空 |
| 75 | Maracas | 空 |

因此当前转换存在确定错误：

```text
GM snare 38/40 → 62
```

会触发 Low Tom；而：

```text
GM low tom 41/43 → 61
```

会触发 Snare。808 中把 Crash 映射到 69 还会触发 Cowbell。

当前对未知音符执行：

```text
60 + modulo 12
```

也必须删除。它会把未知的 EZdrummer articulation 随机变成另一个鼓件。

### 7.5 之前查到的来源映射为什么不够

当前仓库没有记录旧映射表的引用来源，不能证明之前查看的网站对应当前
EZdrummer 3/EZX 素材。

Toontrack 官方资料说明：

- EZdrummer 3 的 `Toontrack Standard` 是 GM compatible；
- EZdrummer 3 提供 MIDI Mapping Layout 窗口；
- EZdrummer 2 的 MIDI Layout 是按 Sound Library/EZX 分别提供；
- EZX 可能有额外 articulation、alias，以及同一按键在不同演奏法下的含义。

参考：

- <https://www.toontrack.com/faq/release-notes-for-ezdrummer-3-0-3/>
- <https://www.toontrack.com/forums/topic/problem-getting-ezdrummer-3-to-return-to-gm-midi-keyboard-layout/>
- <https://www.toontrack.com/forums/topic/included-keyboard-style-drum-maps-for-ezdrummer-2-products/>

所以问题由两部分组成：

1. **目标端确定错误**：openDAW Playfield 的真实 Pad 被写错；
2. **来源端信息不足**：一张通用 GM 表不能完整描述所有 EZdrummer/EZX
   articulation。

这不是当前就可以宣布“无解”的问题，但不能再用一张未经来源区分的表直接
转换整个鼓库。

### 7.6 正确的双阶段鼓映射

鼓转换应拆成：

```text
EZdrummer/EZX source note
→ Canonical Drum Role
→ 当前 Playfield preset 的真实 Pad
```

Canonical Drum Role 至少包括：

```text
kick
snare
low-tom
mid-tom
high-tom
rim
clap
closed-hat
open-hat
crash
ride
auxiliary
unsupported
```

来源映射：

1. 根据 Asset 路径识别 EZdrummer 版本、EZX/Pack；
2. 优先读取对应产品的官方 MIDI Mapping Layout；
3. 对 Toontrack Standard/GM 范围使用已验证的 GM 基础角色；
4. 对额外 articulation 显式折叠到最接近角色或标记为 unsupported；
5. 不知道含义的音符必须丢弃并记录，不能取模。

目标映射：

1. 加载 Playfield preset 后读取实际 `PlayfieldSampleBox.index` 和样本标签；
2. 通过真实标签建立 `Canonical Drum Role → MIDI Note`；
3. 808 和 909 分开生成映射；
4. 不能假定任何 stock preset 永远占用相同 Pad；
5. Kick、Snare、Closed Hat、Open Hat 缺失时直接拒绝该 preset。

### 7.7 如果 EZX 映射覆盖率仍不够

如果 Phase 0 证明大量鼓 MIDI 无法可靠恢复 articulation，采用受控降级方案：

> 离线提前制作一套 DAWdex Curated Drum MIDI Library，专门使用当前
> Playfield 808/909 的已验证 Pad，而不是让模型在用户请求时现场生成鼓音符。

建议结构：

```text
midi/easy/drums/dawdex-curated/
└─ <style>/<family>/
   ├─ 01@Intro/
   ├─ 02@Verse_or_Theme/
   ├─ 03@Build/
   ├─ 04@Chorus_or_Peak/
   ├─ 05@Fill/
   └─ 06@Outro/
```

每个 Section 可以有多种能量和 Variation。优先使用 808/909 共同可靠的
60–68 Pad；Crash/Ride 等需要按目标 Kit 分版本。

这些 MIDI 是**提前制作并人工试听批准的真实资产**，随后进入同一个 SQLite
索引，模型仍然只负责检索和选择 exact Asset ID。生产规划时不允许模型临时
合成鼓谱，这样既保留当前“真实资产检索”的架构，也避开不可靠的 EZX 映射。

采用该方案前应明确更新 `AGENTS.md` 和正式文档，说明鼓角色允许使用这套
预先制作的 DAWdex 资产；不能在代码中悄悄恢复运行时 Pattern Compiler。

## 八、规划协议升级

`CreativeBrief` 增加：

```ts
type CreativeBrief = {
    // existing fields...
    readonly arrangementMode: "developing-sequence"
    readonly targetSectionCount: number
    readonly energyArc: ReadonlyArray<number>
}
```

增加 Family/Sequence 结构：

```ts
type SectionSelection = {
    readonly slot: number
    readonly sectionKind: string
    readonly sectionLabel: string
    readonly assetId: string
    readonly sourceOrder: number
    readonly startBar: number
    readonly bars: number
    readonly transposeSemitones: number
}

type RoleSequence = {
    readonly role: "drums" | "bass" | "keys"
    readonly familyId: string
    readonly familyLabel: string
    readonly sections: ReadonlyArray<SectionSelection>
}

type ArrangementPlan = {
    readonly bpm: number
    readonly key: string
    readonly meter: string
    readonly sequences: ReadonlyArray<RoleSequence>
}
```

模型负责：

- 理解用户意图；
- 选择风格、情绪、能量曲线；
- 在 Harness 给出的合法 Family/Variant 中选择；
- 决定某角色在哪些 Section 进入或休止；
- 选择音色和受支持的效果。

Harness 负责：

- 只提供真实存在的 Family/Asset；
- 保证 Section 原始顺序；
- 计算和声、节奏和范围兼容性；
- 拒绝低置信度或不兼容组合；
- 生成确定且可验证的 Region 时间线。

模型不能编造 Family、Section、Asset ID 或路径。

## 九、openDAW 执行升级

每个角色仍只维护一条 DAWdex 主轨，但一条轨道拥有多个 Region：

```text
DAWdex Keys
├─ Region 1: Intro
├─ Region 2: Theme
├─ Region 3: Pad Progression
├─ Region 4: Arpeggio
└─ Region 5: Outro
```

执行规则：

1. 一个批准计划仍是一个 Undo 事务；
2. 先下载并解析所有 Section Asset；
3. 全部通过验证后才修改工程；
4. 按 `startBar` 创建多个 Note Region；
5. Region 名称包含角色、Family 和 Section；
6. Restyle 替换目标角色的整条 Region Sequence；
7. “保留 Keys，只改鼓”必须保持 Keys/Bass Track ID、Region 和指纹不变；
8. 失败时回滚整个 Sequence，不能留下半条歌；
9. 三个角色可以按 UI 体验逐轨写入，但每次写入的是该角色的完整发展序列。

当前 `fitToBars` 不再负责把单个 Asset 铺满整首轨道。它只能在单个 Section
内部做安全裁剪，并且必须尊重 Phrase/小节边界。

## 十、真实思考过程与前端事件

前端不应继续只展示轮播式等待文字。新流程应发布真实阶段事件：

```text
已识别目标：Melodic Progressive，Straight 4/4，约 102 BPM
正在查找带完整 Intro→Outro 结构的 Keys Family
已找到 18 个候选 Family，淘汰 7 个缺少结束段
正在分析 Keys 调性与和弦进行
Keys 锚点：E minor，置信度 0.87
正在比较 Bass 根音序列与调式
淘汰 23 个 Bass Family：和弦功能不兼容
正在匹配 Drums 的段落能量与 Fill 位置
已形成 3 套跨轨 Arrangement
已选择 5 段 Keys、4 段 Bass、5 段 Drums
```

这些文本必须由索引、检索、淘汰和评分结果生成，不展示模型私有思维链。

## 十一、实施顺序

### Phase 0：素材结构盘点

1. 统计三个角色的目录深度和 Section 命名；
2. 找到 Family 编号和 Section 编号规律；
3. 核实截图中的 EZkeys 2 Pack 是否已经位于本地；
4. 如果标签来自插件数据库，定位可合法读取的元数据；
5. 统计 drum Asset 的 EZdrummer/EZX 来源和实际 MIDI Note 分布；
6. 收集对应来源产品的官方 MIDI Mapping Layout；
7. 解码并记录当前 Playfield TR-808/TR-909 的真实 Pad；
8. 输出 Family 解析覆盖率和鼓映射覆盖率报告。

完成标准：

- 至少能稳定解析 EZbass 的连续 Section Family；
- 能说明 Keys/Drums 各有多少 Asset 可以进入 Family 模式；
- 未识别路径不会被错误归为同一 Family；
- 基础 Kick/Snare/Tom/Hat 不再互换；
- 每个来源映射都有明确产品范围；
- 未识别的 articulation 被计数，不被随机映射；
- 根据覆盖率证据决定继续转换 EZdrummer MIDI，还是启用 Curated Drum
  Library。

### Phase 1：SQLite Index V2

1. 增加 Family、Section 和音乐分析字段；
2. 建立 `families`、`family_sections` 或等价索引；
3. 保存原始标签与标准化功能；
4. 重新索引本地库；
5. 增加数据库迁移/版本检查。

### Phase 2：Sequence Retrieval 与调式校验

1. 新增 Family 查询；
2. 新增 Section Variant 查询；
3. Keys 作为和声锚点；
4. Bass 比较实际调式和根音序列；
5. Drums 比较 Groove 和段落能量；
6. 返回 Top-N Arrangement Sequence。

### Phase 3：Plan Schema 与 Agent

1. 让 Plan 引用 Family 和有序 Sections；
2. 模型只从提供的精确候选中选择；
3. Validator 校验顺序、Asset ID、跨度和重复；
4. 保留 create/add/restyle/modify/preserve 语义。

### Phase 4：Studio 多 Region 执行

1. 预加载全部 Section MIDI；
2. 在每条角色轨创建多个 Region；
3. 事务化 upsert/replace；
4. 保留一次 Undo；
5. 逐轨发布真实执行和可听事件。

### Phase 5：质量闸门与听感验收

1. 不同调式的 Bass/Keys 必须被拒绝；
2. 不兼容根音序列必须被拒绝；
3. Section 顺序必须保持；
4. 不得使用同一片段重复充满全轨；
5. 角色音域和鼓映射正确；
6. 完成一组人工 A/B 听感测试。

## 十二、必须编写的测试

### Family Parser

- `S011 Intro → S012 Verse → S013 Pre_Chorus → S014 Chorus` 解析为同一 Family；
- 数字前缀相同但父目录不同，不能误合并；
- `Intro/Theme/Pad Progression/Arpeggio/Outro` 保持源顺序；
- 缺失 Section 可以表示，不得复制伪造。

### Harmonic Analysis

- 正确区分 Major 与 Minor；
- 调性置信度过低时不能伪装成确定结果；
- 全局移调后和弦功能签名不变；
- 两个不同根音序列不能仅因同为 Minor 而视为兼容；
- Keys 和弦整体移调，不逐音折叠破坏 Voicing。

### Sequence Retrieval

- 返回同一 Family 的多个不同 Section Asset；
- 每个 Section 只选择真实存在的 Asset；
- Section 顺序稳定且可复现；
- 搜不到完整 Family 时明确降级或失败；
- 无风格匹配时不静默退回任意 2000 条素材。

### Drum Mapping

- 当前 stock TR-808/909 preset 解码结果与映射表一致；
- GM Snare 38/40 必须触发实际 Snare Pad；
- GM Low Tom 41/43 不得触发 Snare；
- TR-808 的 69 不得被当成 Crash；
- TR-808 与 TR-909 使用独立目标映射；
- 未知 source note 不得执行 modulo 映射；
- EZX 特殊 articulation 必须有来源 Profile 或被明确丢弃；
- 如果采用 Curated Drum Library，其每个 Asset 必须只使用目标 Kit 支持的
  Pad，并通过人工试听。

### openDAW Execution

- 一条角色轨包含多个连续 Region；
- Intro 到 Outro 的位置和长度正确；
- 三个角色的 Section 时间槽位对齐；
- Restyle 原位替换 Sequence，不新增重复角色轨；
- Preserve Keys 时 Keys 全部 Region 不变；
- 中间任何 Asset 失败时整个操作回滚；
- 一次 Undo 恢复操作前工程。

## 十三、验收场景

输入：

> 给我做一段 melodic progressive，音乐从安静进入，逐渐展开，最后自然结束。

必须满足：

1. Agent 选择一个带多个有序 Section 的 Keys Family；
2. Keys 轨至少有 Intro、发展段、高潮/主要段、Outro；
3. Bass 与 Keys 实际调式相容；
4. Bass 根音变化与 Keys 和弦功能相容；
5. Drums 的能量和 Fill 随段落发展；
6. 每条角色轨包含多个 Region，而不是重复一个 8 小节 Region；
7. UI 显示真实 Family、Section、调性分析和淘汰原因；
8. 用户可以只重做某一角色或某一 Section；
9. 操作可审批、可撤销。

## 十四、明确不做

本轮不要：

- 放弃 MIDI 数据库；
- 改成模型直接生成全部 MIDI 音符；
- 改成 MCP 架构；
- 先做 48 小节固定 Song Blueprint；
- 先做通用向量 RAG；
- 重写现有 Codex Provider；
- 把截图中的 Family 名称硬编码成唯一模板；
- 为了演示继续复制同一个 8 小节 Loop。

SQLite 仍是正确基础。首先把素材已有的层级、段落、调性和节奏信息提取出来；
Embedding 只在结构化检索完成后用于情绪和听感重排。

## 十五、给下一段 Codex 对话的开场提示

```text
请先完整阅读：
1. docs/HANDOFF_2026-07-25_SONG_DEVELOPMENT.md
2. docs/HANDOFF_2026-07-24.md
3. docs/PRODUCT_VISION.md
4. docs/architecture.md
5. docs/DAWdex_TechSpec.md

然后检查 git status。保留全部未提交改动，不要 reset、checkout、覆盖或重写
现有 Codex Provider。

这轮继续原来的 SQLite 真实 MIDI 检索路线，不考虑模型直接生成 MIDI，也不考虑
MCP。目标不是重复一个 4/8 小节 Loop，而是利用 EZkeys/EZbass/EZdrummer
素材包中的 Family/Section 层级，让每条 Drums、Bass、Keys 轨道按
Intro→发展→高潮→Outro 创建多个连续 Region。

先完成 Phase 0 素材结构盘点，并核实截图中的 EZkeys 2
“Melodic Progressive 102 BPM / Intro / Theme / Pad Progression /
Arpeggio / Outro”在当前本地库中是文件夹、数字 ID，还是插件数据库标签。
同时重新审计鼓映射：当前代码把 Snare 和 Low Tom 的 Playfield Pad 写反，
并错误地把 TR-808 的 69 当作 Crash。先实现
“EZdrummer/EZX source profile → Canonical Drum Role → 实际 Playfield Pad”
双阶段映射并统计覆盖率；如果 EZX articulation 无法可靠恢复，则建立提前制作、
人工试听的 DAWdex Curated Drum MIDI Library，作为 SQLite 中的真实资产，
不得恢复运行时 Pattern Compiler。

随后按交接文档实施 SQLite Index V2、Family Sequence Retrieval、实际调式/
和弦兼容、Plan 多 Section Schema 和 openDAW 多 Region 执行。

不要提交或推送，除非我明确要求。涉及音乐执行路径的改动完成后运行 AGENTS.md
规定的 Agent Server build/test、Studio build/test 和 git diff --check。
```

## 十六、最终判断

这次升级的核心不是“把 Loop 拉长”，而是改变检索和编排的基本单位：

```text
过去：每个角色一个 MIDI 文件
现在：每个角色一个有序 MIDI Family Sequence
```

并同时满足：

```text
横向：同一轨道从 Intro 到 Outro 自然发展
纵向：同一时间槽位的 Drums、Bass、Keys 调式、和声、节奏兼容
```

只有这两条同时成立，DAWdex 才会从“随机叠放三个 Loop”升级为“利用真实素材
组织一段会发展的音乐”。
