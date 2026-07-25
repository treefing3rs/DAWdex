# Phase 0 MIDI Family 与鼓映射盘点

> 日期：2026-07-26
> 数据库：`midi/.dawdex/catalog.sqlite`，schema `user_version = 2`
> 素材根目录：`midi/easy/`

## 结论

现有素材足以先实现发展型编排，不需要立即放弃 EZdrummer MIDI，也不需要让
模型运行时生成鼓谱。

- Bass 的 Family/Section 路径最完整；
- Drums 有大量可恢复的 Family，并且存在足够大的高映射覆盖率子集；
- Keys 当前目录只有少量文件直接带 Section 标签，截图中的 EZkeys 2
  `Melodic Progressive 102 BPM` 显示标签不在本机路径或数据库中；
- 当前 Playfield 目标映射确认有错，Snare 与 Low Tom 被写反；
- 第一版应只使用可以确定解析的 Family 和映射覆盖率高的鼓素材；
- 未解析的 Keys 仍可作为单段素材，但不能伪装成 Intro→Outro Family。

## 素材与 Family 覆盖率

| Role | Valid Assets | Family Assets | Family Coverage | Families |
|---|---:|---:|---:|---:|
| Bass | 8,053 | 8,009 | 99.45% | 467 |
| Drums | 164,424 | 93,473 | 56.85% | 3,546 |
| Keys | 20,843 | 876 | 4.20% | 121 |

Bass Family 中 234 个拥有 5 个 Section，是第一版验证“同一轨道持续发展”的
最佳入口。

Drums 中 913 个 Family 拥有 6 个 Section，另有大量 3–9 Section Family。
部分 Family 把 `FILLS`、`VARIATIONS` 等目录标记为 `custom`，检索时必须区分
主体 Groove 与 transition/fill，不能把 Fill 当作整段节奏。

Keys 的低覆盖率是素材事实，不是查询性能问题。当前磁盘路径没有截图中的
`Melodic Progressive 102 BPM` 可读名称；在找到 EZkeys 2 内部标签数据库或
补齐相应 Pack 前，只允许使用那 121 个可以确定解析的 Keys Family。

## 鼓映射覆盖率

按 Toontrack Standard/GM core 角色统计：

```text
总鼓击：10,376,533
已映射：7,727,870
未支持：2,648,663
加权覆盖率：74.47%
```

整体覆盖率不足以无条件转换整个库，但高质量子集规模足够：

| 最低覆盖率 | 同时包含 Kick/Snare/Hat 的 Assets | Families |
|---:|---:|---:|
| 80% | 17,534 | 1,124 |
| 90% | 14,963 | 962 |
| 95% | 14,086 | 904 |
| 99% | 12,972 | 831 |
| 100% | 12,786 | 811 |

在 95% 门槛下仍有 14,086 个鼓 MIDI、904 个 Family、至少 1,484 个可用
Family Section。因此第一版应过滤到：

```text
drum_coverage >= 0.95
AND has kick
AND has snare
AND has closed-hat OR open-hat
```

Latin Percussion 等低覆盖率来源不能进入默认 Playfield 808/909 自动路径。

## Playfield 实际 Pad

从 DAWdex 当前使用的 openDAW stock preset 直接解码：

| Note | TR-808 | TR-909 |
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
| 71–75 | Claves/Congas/Maracas | 空 |

当前 `MidiAsset.ts` 的 `38/40 → 62` 和 `41/43 → 61` 是错误的。未知音符的
modulo 映射也必须删除。

## Phase 0 决策

1. 保留 SQLite 和真实 MIDI 检索路线；
2. Bass、Drums 先启用 Family Sequence；
3. Keys 只对确定解析的 121 个 Family 启用 Sequence；
4. 没有 Keys Family 时明确降级为单段 Keys，不伪造段落；
5. 鼓只检索映射覆盖率至少 95% 且具备核心鼓件的素材；
6. 使用 `source profile → canonical role → target preset pad` 双阶段转换；
7. 删除未知鼓音符 modulo 映射；
8. 如果人工试听后高覆盖率子集仍不可靠，再建立离线制作、人工批准并进入
   SQLite 的 DAWdex Curated Drum MIDI Library；
9. 模型运行时仍不直接生成替代 MIDI。

## 实施门槛

进入 Phase 1–4 后必须保持：

- 未识别路径 `family_id = NULL`；
- 不使用模糊字符串把不同父目录合并为同一 Family；
- Section 使用素材原始顺序；
- Bass/Keys 低调性置信度不能被当作确定匹配；
- 不同和弦功能不能只靠全局移调强行兼容；
- 任一 Section 下载、解析或验证失败时，整次 Arrangement 回滚；
- 一个角色的多个 Section 写入同一轨道的多个 Region。
