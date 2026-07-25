# DAWdex Family Sequence 提交与合并交接

> 日期：2026-07-26
> 用途：在新的 Codex 对话中安全检查远端、提交当前工作树、推送新分支并创建 PR
> 当前工作树：尚未提交、尚未推送
> 重要约束：保留所有现有改动；禁止 `reset --hard`、`checkout --`、整批采用
> `ours/theirs`，禁止重写 Codex Provider

## 一、新对话开始时先完整阅读

按顺序阅读：

1. `AGENTS.md`
2. `docs/HANDOFF_2026-07-26_FAMILY_SEQUENCE_SUBMISSION.md`
3. `docs/HANDOFF_2026-07-25_SONG_DEVELOPMENT.md`
4. `docs/PHASE0_MIDI_FAMILY_AUDIT_2026-07-26.md`
5. `docs/HANDOFF_2026-07-24.md`

然后运行：

```powershell
git status --short --branch
git log --oneline --decorate -8
git diff --check
```

不要在阅读和检查之前执行 pull、merge、reset、checkout、clean、commit 或 push。

## 二、当前 Git 状态

编写本文时：

```text
branch: codex/generation-quality-bundles
HEAD:   d4d977373
main:   d4d977373
origin/main（本地记录）: d4d977373
```

`d4d977373` 是：

```text
Merge pull request #16 from treefing3rs/codex/generation-quality-bundles
```

因此当前分支名称对应一个已经合并过的旧 PR 分支，不应该继续直接推送并复用。
`git status` 显示的：

```text
[ahead 4]
```

是相对于旧的 `origin/codex/generation-quality-bundles`，不是相对于
`origin/main`。它本身不表示当前工作与 main 冲突。

提交本轮改动前应创建一个新的分支，例如：

```text
codex/family-sequence-arrangement-v2
```

## 三、本轮真正完成的功能

### 3.1 SQLite Index V2

本地索引现在保存：

- MIDI Family 与稳定 Family ID；
- 原始 Section 标签、标准化 Section Kind 和原始顺序；
- BPM、拍号、音域、密度和能量；
- 实际音符推断的 Key、Mode、置信度、Pitch Class Histogram；
- 每小节根音时间线和 Harmonic Signature；
- 标准化音乐指纹；
- Drum Source Profile、鼓件直方图和映射覆盖率。

生成数据库仍是：

```text
midi/.dawdex/catalog.sqlite
```

它已被 `.gitignore` 忽略，绝不能提交。

### 3.2 Family Sequence 检索

检索单位从“一个孤立 MIDI”升级为“一个带有序 Section 的素材 Family”：

```text
Style / BPM / Role
→ Family candidates
→ one verified Variant per ordered Section
→ model selects a Family anchor
→ Harness expands exact Section asset IDs and paths
```

当前规则：

- Family 至少需要三个可靠 Section；
- 保持素材包自己的 Section 顺序；
- 每个顺序只选择一个真实文件；
- 鼓 Family 必须达到至少 95% 可映射覆盖率，并包含 Kick、Snare、Hat；
- 找不到可靠 Family 时明确回退单段候选；
- 搜索词完全不匹配时不再静默返回任意 2000 条无关素材。

### 3.3 跨轨兼容

Bundle 排名现在使用：

- 实际 Key/Mode；
- 调性置信度；
- 全局最短移调；
- Bass/Keys 相对根音时间线距离；
- 模式冲突惩罚；
- BPM、密度、路径家族和 Section 线索。

这比只看路径名和 BPM 更可靠，但尚未达到逐 Section 完整和弦识别。

### 3.4 Plan 与 openDAW 多 Region

`upsert-role-track` 现在可以携带 `midiSections`。

执行结果仍然是每个角色一条 DAWdex 主轨，但一条轨道可以拥有多个连续 Region：

```text
DAWdex Keys
├─ Intro
├─ Theme / Establish
├─ Develop
├─ Peak
└─ Outro
```

执行器会：

1. 在修改工程前下载并解析该角色全部 Section；
2. 按共同时间槽位创建多个 Region；
3. Restyle 时原位替换旧角色轨，而不是新增重复轨；
4. 计算整条 Sequence 的 MIDI 指纹；
5. 保持一个批准计划对应一个 Undo；
6. 支持三个角色按 UI 顺序逐轨加入，每次加入的是该角色完整 Sequence。

### 3.5 TR-808 / TR-909 鼓映射

已修复的确定错误：

- GM Snare 38/40 现在映射到 Playfield 61，而不是 Low Tom 62；
- GM Low Tom 41/43 现在映射到 Playfield 62，而不是 Snare 61；
- TR-808 的 Crash/Cymbal 不再错误映射到 69 Cowbell；
- TR-808 和 TR-909 使用独立目标映射；
- 未识别 EZX articulation 会丢弃，不再通过 modulo 随机映射成其他鼓件。

当前链路为：

```text
EZ/Toontrack source note
→ Canonical Drum Role
→ selected TR-808 or TR-909 Playfield pad
```

## 四、必须保留并提交的核心实现文件

服务器侧：

```text
opendaw/packages/server/dawdex-agent/src/DrumProfiles.ts
opendaw/packages/server/dawdex-agent/src/DrumProfiles.test.ts
opendaw/packages/server/dawdex-agent/src/MidiAnalysis.ts
opendaw/packages/server/dawdex-agent/src/MidiAnalysis.test.ts
opendaw/packages/server/dawdex-agent/src/MidiFamily.ts
opendaw/packages/server/dawdex-agent/src/MidiFamily.test.ts
opendaw/packages/server/dawdex-agent/src/MidiBundleRanker.ts
opendaw/packages/server/dawdex-agent/src/MidiCatalog.ts
opendaw/packages/server/dawdex-agent/src/MidiCatalog.test.ts
opendaw/packages/server/dawdex-agent/src/MusicPlan.ts
opendaw/packages/server/dawdex-agent/src/index-midi.ts
opendaw/packages/server/dawdex-agent/src/server.ts
```

Studio 侧：

```text
opendaw/packages/app/studio/src/agent/AgentProtocol.ts
opendaw/packages/app/studio/src/agent/DawProjectAdapter.ts
opendaw/packages/app/studio/src/agent/DawProjectAdapter.test.ts
opendaw/packages/app/studio/src/agent/music/MidiAsset.ts
opendaw/packages/app/studio/src/agent/music/MidiAsset.test.ts
opendaw/packages/app/studio/src/agent/music/MidiFingerprint.ts
opendaw/packages/app/studio/src/agent/music/MidiFingerprint.test.ts
```

下列删除是有意的，应随提交保留：

```text
opendaw/packages/app/studio/src/agent/music/PatternCompiler.ts
opendaw/packages/app/studio/src/agent/music/PatternCompiler.test.ts
```

原因：生产路径只检索并导入真实 MIDI，不能恢复固定模板或运行时合成替代音符。

文档侧至少包含：

```text
docs/HANDOFF_2026-07-25_SONG_DEVELOPMENT.md
docs/PHASE0_MIDI_FAMILY_AUDIT_2026-07-26.md
docs/HANDOFF_2026-07-26_FAMILY_SEQUENCE_SUBMISSION.md
```

当前工作树还包含之前已经形成的产品、架构、演示和设计文档修改。它们属于用户
现有成果，不能丢弃。提交前应审阅，但不得为了“清理 PR”而 reset 或 checkout。

## 五、Codex Provider 说明

`CodexAppServer.ts` 只有一个类型层面的调整：

```text
#runStructured<T>
→ #runStructured<TSchema, TResult>
```

目的是让“传给 Codex 的输出 Schema 类型”和“解析后返回给应用的 Plan 类型”
可以不同。登录、ChatGPT 账号连接、线程启动、超时、请求协议和 Provider 行为
均未改变。

不要在提交阶段顺手重构该文件。

## 六、绝对不能提交的本地文件

当前存在未跟踪文件：

```text
midi.zip
```

它是本地 MIDI 压缩包，绝不能加入 Git。

同样不得提交：

```text
midi/.dawdex/catalog.sqlite
midi/easy/**/*.mid
midi/easy/**/*.midi
opendaw/**/dist/
node_modules/
```

当前数据库已经确认不受 Git 跟踪：

```text
catalog.sqlite is not tracked
```

禁止使用未经检查的：

```powershell
git add -A
git add .
```

因为它们可能把 `midi.zip` 一起加入暂存区。

## 七、安全提交顺序

### 7.1 只刷新远端信息

```powershell
git fetch origin
git status --short --branch
git log --oneline HEAD..origin/main
git log --oneline origin/main..HEAD
git diff --stat HEAD..origin/main
```

这里只使用 `fetch`，不要在脏工作树上直接 `pull`。

### 7.2 创建新的提交分支

如果分支不存在：

```powershell
git switch -c codex/family-sequence-arrangement-v2
```

创建新分支不会覆盖当前未提交文件。创建后再次运行：

```powershell
git status --short --branch
```

### 7.3 精确暂存

先暂存所有已经被 Git 跟踪的修改和有意删除：

```powershell
git add -u
```

再精确加入本轮新增文件：

```powershell
git add -- `
  docs/HANDOFF_2026-07-25_SONG_DEVELOPMENT.md `
  docs/PHASE0_MIDI_FAMILY_AUDIT_2026-07-26.md `
  docs/HANDOFF_2026-07-26_FAMILY_SEQUENCE_SUBMISSION.md `
  opendaw/packages/app/studio/src/agent/music/MidiFingerprint.ts `
  opendaw/packages/app/studio/src/agent/music/MidiFingerprint.test.ts `
  opendaw/packages/server/dawdex-agent/src/DrumProfiles.ts `
  opendaw/packages/server/dawdex-agent/src/DrumProfiles.test.ts `
  opendaw/packages/server/dawdex-agent/src/MidiAnalysis.ts `
  opendaw/packages/server/dawdex-agent/src/MidiAnalysis.test.ts `
  opendaw/packages/server/dawdex-agent/src/MidiFamily.ts `
  opendaw/packages/server/dawdex-agent/src/MidiFamily.test.ts
```

随后必须确认：

```powershell
git status --short
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only | Select-String -Pattern 'midi\.zip|catalog\.sqlite|\.mid$|\.midi$'
```

最后一条命令应当没有输出。`midi.zip` 应继续显示为未跟踪，而不是 staged。

### 7.4 提交

建议提交标题：

```text
feat(agent): arrange MIDI families as multi-region sequences
```

提交后确认：

```powershell
git status --short --branch
git show --stat --oneline HEAD
```

### 7.5 合并最新 main

提交成功后再把远端 main 合进新分支：

```powershell
git merge origin/main
```

如果产生冲突：

1. 先列出 `git status --short`；
2. 逐文件理解双方修改；
3. 保留 main 的新页面/前端重构；
4. 保留本轮 Family Sequence、MIDI Index V2、鼓映射和多 Region 主链；
5. 不允许对目录整体使用 `--ours` 或 `--theirs`；
6. 解决后重新运行全部检查，再完成 merge commit。

不要通过 reset、checkout 或重写历史来“解决”冲突。

### 7.6 推送与 PR

所有检查通过后：

```powershell
git push -u origin codex/family-sequence-arrangement-v2
```

创建以 `main` 为 base 的新 PR，不要复用已经合并的 PR #16。

PR 标题建议：

```text
feat(agent): Family Sequence retrieval and multi-region arrangement
```

PR 描述应包括：

- SQLite Index V2 与本地重建说明；
- Family/Section 检索；
- Bass/Keys 和声兼容评分；
- 808/909 双阶段鼓映射；
- Plan `midiSections`；
- Studio 单轨多 Region、原位替换与 Undo；
- 测试结果；
- Keys Family 覆盖率和逐段和声识别的现有限制；
- MIDI 数据库和 MIDI 文件不进入仓库。

## 八、提交前已经通过的检查

本轮最后一次完整结果：

```text
Agent Server build: passed
Agent Server tests: 6 files, 23 tests passed
Studio build: passed
Studio tests: 10 files, 35 tests passed
git diff --check: passed
```

对应命令：

```powershell
cd opendaw
npm.cmd run build -w @dawdex/agent-server
npm.cmd run test -w @dawdex/agent-server
npm.cmd run build -w @opendaw/app-studio
npm.cmd run test -w @opendaw/app-studio
cd ..
git diff --check
```

Studio build 有以下非阻断警告：

- 当前 Node.js 是 22.11.0，而 Vite 建议 22.12+；
- `nam.wasm` 与 `grid16.svg` 为已有构建期解析警告；
- 大 Chunk 和 `jszip` 动态/静态混用为已有警告。

这些警告没有导致构建或测试失败。

在合并最新 `origin/main` 后必须重新运行同一组检查，不能只沿用本次结果。

## 九、团队机器上的数据库重建

SQLite 是本地生成物。队友拉取 PR 后，在各自已有 `midi/easy/` 的机器上运行：

```powershell
cd opendaw
npm.cmd run index:midi -w @dawdex/agent-server
```

Agent Server 正常启动时应输出约：

```text
DAWdex opened 193320 indexed MIDI assets
```

如果 `catalog.sqlite` 缺失，服务器只会使用小型目录回退路径；不能把该回退误认为
完整 19 万 MIDI 检索。

## 十、当前已知限制

提交 PR 时需要诚实说明：

1. Keys Family 可可靠解析覆盖率约 4.2%，明显低于 Bass 和 Drums；
2. 截图中的 EZkeys 2 人类可读标签尚未在本地路径或插件数据库中定位；
3. 找不到 Family 时仍会回退单段素材，但会明确报告；
4. 当前和声兼容使用调式、置信度和相对根音时间线，不是完整逐段和弦识别；
5. 模型选择 Family 锚点、音色和效果器，Harness 第一版确定性选择 Family 内
   各 Section 的最高排名 Variant；
6. EZX 非 GM articulation 需要来源专属映射或人工试听的 Curated Drum Library。

## 十一、新对话可直接使用的开场指令

```text
请先完整阅读：
1. AGENTS.md
2. docs/HANDOFF_2026-07-26_FAMILY_SEQUENCE_SUBMISSION.md
3. docs/HANDOFF_2026-07-25_SONG_DEVELOPMENT.md
4. docs/PHASE0_MIDI_FAMILY_AUDIT_2026-07-26.md
5. docs/HANDOFF_2026-07-24.md

然后检查 git status、当前分支、最近提交和远端 main。保留工作区全部修改，
不要 reset、checkout、clean、重写 Codex Provider，也不要把 midi.zip、
catalog.sqlite 或任何 .mid/.midi 文件加入暂存区。

当前旧分支对应已经合并的 PR #16。请先 git fetch，只读检查与 origin/main
是否分叉，再创建新的 codex/family-sequence-arrangement-v2 分支。

按照交接文档中的精确文件列表暂存，检查 cached diff，提交：
feat(agent): arrange MIDI families as multi-region sequences

提交后合并最新 origin/main，逐文件解决冲突，重新运行 Agent Server build/test、
Studio build/test 和 git diff --check。全部通过后推送新分支并创建以 main 为
base 的新 PR。不要复用 PR #16。
```
