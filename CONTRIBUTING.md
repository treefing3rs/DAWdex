# Contributing to DAWdex

DAWdex 使用适合三人黑客松团队的轻量 GitHub Flow。

## 团队分区

| Lane | 主要职责 | 典型路径 |
|---|---|---|
| Experience & Story | 弹幕、角色 UI、动画、UX、路演 | `opendaw/packages/app/studio/src/agent/`、设计资产 |
| Agent & Intent | Agent Server、Schema、角色编排、openDAW Adapter | `opendaw/packages/server/dawdex-agent/`、Agent Protocol |
| Music & Reliability | MIDI 素材、检索变体、循环、质量、构建测试 | MIDI 模块、播放调度、脚本和测试 |

共享文件：

```text
opendaw/package.json
opendaw/package-lock.json
opendaw/packages/app/studio/src/agent/AgentProtocol.ts
opendaw/packages/app/studio/src/ui/App.tsx
docs/architecture.md
docs/PRD_DAWdex.md
```

修改共享文件前在团队群里说明。

## 分支

`main` 必须始终可演示。每个任务使用短生命周期分支：

```text
feat/role-task-schema
feat/virtual-player-ui
feat/midi-retrieval
fix/chinese-encoding
fix/loop-boundary
docs/update-pitch
```

Codex 自动创建的分支使用 `codex/` 前缀。

不要使用长期个人分支，也不要直接把未验证代码推到 `main`。

## 开始任务

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/short-task-name
```

一个任务应有：

- 一名 Owner；
- 明确验收标准；
- 影响的共享文件；
- 预期截图、测试或音乐结果。

## Commit

使用 Conventional Commits：

```text
feat(agent): compile audience intent into role tasks
feat(ui): add virtual bassist state
feat(midi): transpose retrieved clips to project key
fix(playback): align new track to loop boundary
fix(text): restore chinese agent labels
docs(prd): update virtual band direction
```

不要在一个 Commit 混入无关格式化和大范围重构。

## 提交前

```bash
git status
git diff --check
git diff
```

在 `opendaw/` 中执行与改动相关的检查：

```bash
npm run build -w @dawdex/agent-server
npm test -- --run
```

影响 Studio 时至少执行对应构建或固定 Smoke Flow。由于上游 Monorepo 较大，PR 中写明实际运行了哪些命令，不要假装运行了全部检查。

## Pull Request

```bash
git push -u origin feat/short-task-name
```

PR 必须说明：

- 修改了什么；
- 为什么修改；
- 如何验证；
- UI 截图或视频；
- 音乐前后结果；
- 已知限制；
- 回退方式。

至少一名队友 Review 后再合并。影响 Agent Schema、音乐硬规则、密钥、安全或素材许可证的 PR 建议两名队友都看。

## 合并

普通功能使用 Squash and merge。合并后：

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/short-task-name
```

不要 Force Push `main`。个人分支确有必要时使用 `--force-with-lease`。

## 冲突处理

- 小 PR，每天合并；
- 一个共享协议同时只由一人修改；
- 不格式化无关上游 openDAW 文件；
- `package-lock.json` 冲突由实际安装依赖的人解决；
- 先更新协议，再让 UI 和音乐管线分别实现；
- 发现上游文件被误改时先沟通，不使用破坏性的 reset。

## 绝不提交

- `.env` 和 API Key；
- GitHub/Codex Token；
- `.codex/`、`.agents/`；
- `node_modules/`；
- `dist/`、`target/`、缓存和日志；
- 未确认许可证的 MIDI 或音频；
- 本地绝对路径和私人配置；
- 仅用于临时实验的大型文件。

## 音乐改动 Review

每个新音乐动作必须说明：

1. 输入 Schema；
2. 允许的参数范围；
3. BPM、调性、小节和音域约束；
4. 如何进入循环；
5. 失败回退；
6. Undo；
7. 角色工作回执如何与动作保持一致。

## 每日节奏

早上：

- 昨天完成什么；
- 今天只交付什么；
- 会改哪些共享文件；
- 当前阻塞。

中午：

- 合并最短链路；
- 刷新所有分支；
- 跑固定 Prompt Smoke Test。

晚上：

- 关键工作不得只留在本地；
- 未完成任务开 Draft PR；
- `main` 必须能够启动；
- 录制一次成功 Demo。

## GitHub 身份验证

每名成员在自己的电脑执行：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh auth setup-git
```

详细排障见 [prd生成/GIT_GUIDE.md](prd生成/GIT_GUIDE.md)。不要在群聊、Issue、Commit 或 Prompt 中发送 Token。

## 发布

首个黑客松版本：

```text
v0.1.0
```

Tag 只从经过验证的 `main` 创建。
