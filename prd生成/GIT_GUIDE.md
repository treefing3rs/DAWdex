# DAWdex GitHub 与三人协作指南

仓库：

```text
https://github.com/treefing3rs/DAWdex
```

本文同时解决两件事：

1. Codex/终端如何获得 GitHub 身份验证；
2. 三个人如何避免互相覆盖代码。

## 一、检查环境

```powershell
git --version
gh --version
git remote -v
git status --short --branch
```

期望 Remote：

```text
origin  https://github.com/treefing3rs/DAWdex.git
```

如果 Remote 不对：

```powershell
git remote set-url origin https://github.com/treefing3rs/DAWdex.git
```

## 二、GitHub CLI 网页授权

执行：

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

终端会显示：

1. 一次性验证码；
2. `https://github.com/login/device`；
3. 等待浏览器确认的状态。

如果浏览器没有自动打开：

1. 手动打开 `https://github.com/login/device`；
2. 输入终端显示的验证码；
3. 登录正确的 GitHub 账号；
4. 点击授权 GitHub CLI；
5. 回到终端等待完成。

验证码可以输入 GitHub 页面，但不要把 Personal Access Token 发到聊天、Issue 或 Commit。

授权后：

```powershell
gh auth status
gh auth setup-git
```

`gh auth setup-git` 会让 HTTPS Git 使用 GitHub CLI 凭据，避免 `gh` 已登录但 `git push` 仍然要求密码。

## 三、授权失败排查

### 没出现授权页面

重新执行登录命令，复制一次性验证码，并手动打开：

```text
https://github.com/login/device
```

设备验证码有效期有限，过期后重新生成，不要重复使用旧码。

### 登录了错误账号

```powershell
gh auth logout --hostname github.com
gh auth login --hostname github.com --git-protocol https --web
```

### `gh auth status` 成功但 Push 失败

```powershell
gh auth setup-git
git remote -v
git ls-remote origin
```

确认当前账号对 `treefing3rs/DAWdex` 有 Write 权限。仓库 Owner 需要在：

```text
Settings → Collaborators → Add people
```

邀请其他两名成员。成员必须接受邮件或 GitHub 通知中的邀请。

### 系统里有旧凭据

先运行：

```powershell
gh auth setup-git
```

如果仍然使用错误账号，再检查 Windows“凭据管理器”中的 GitHub 旧凭据。删除前确认目标是 `github.com` 的旧 Git 凭据，不要删除无关系统凭据。

### 使用 Token

网页设备授权是首选。只有设备授权不可用时才使用 Fine-grained Personal Access Token：

```powershell
gh auth login --hostname github.com --git-protocol https --with-token
```

通过标准输入粘贴 Token，不要把 Token 写进命令历史、`.env` 或文档。Token 至少需要目标仓库的 Contents 读写权限。

## 四、第一次同步

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
```

如果本地已有未提交工作，不要先 Pull。先：

```powershell
git status
```

然后提交到自己的功能分支。

## 五、每个人的分支

成员 A：

```text
feat/virtual-band-ui
```

成员 B：

```text
feat/music-intent-agent
```

成员 C：

```text
feat/midi-pipeline
```

实际工作仍建议每个小任务开更短的分支，不长期占用上述分支。

创建：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/short-task-name
```

## 六、提交与推送

```powershell
git status
git diff
git add <明确的文件>
git diff --staged
git commit -m "feat(agent): add role task schema"
git push -u origin feat/short-task-name
```

不要习惯性提交 `.env`、`node_modules`、构建缓存和未授权素材。

## 七、Pull Request

```powershell
gh pr create --fill
```

PR 包含：

- 修改内容；
- 设计原因；
- 测试命令；
- UI 截图或视频；
- 音乐前后对比；
- 已知限制。

一名队友 Review 后 Squash and merge。影响共享协议、密钥或素材许可证时，两名队友都看。

## 八、每日工作流

开始：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/today-task
```

结束：

```powershell
git status
git add <files>
git commit -m "type(scope): message"
git push -u origin feat/today-task
```

未完成也要开 Draft PR，不要把唯一版本留在个人电脑。

## 九、冲突原则

- `AgentProtocol.ts`、`package.json`、`App.tsx` 同时只由一人改；
- 发现冲突先理解双方改动，不直接选择全部 Accept Current；
- 不使用 `git reset --hard` 或 `git checkout --` 清理队友工作；
- 不 Force Push `main`；
- 个人分支确需改历史时使用 `--force-with-lease`；
- 每天至少一次把已验证改动合回 `main`。

## 十、验证

```powershell
gh auth status
git status --short --branch
git remote -v
git ls-remote origin
git push
```

以上都成功，才说明 Codex/终端到 GitHub 的身份验证和推送链路真正解决。
