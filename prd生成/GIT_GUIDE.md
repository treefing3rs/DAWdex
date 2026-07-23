# 🚀 通用 Git & GitHub Pages 配置与最佳实践指南

本指南旨在为您在**任何新项目/未来项目**中提供一套标准且通用的 Git 协作流、版本号规范，以及 GitHub Pages 静态网站配置流程。您可以将其复制到任意项目的根目录中作为参考模板。

---

## 👤 一、 GitHub 个人账号与全局基础配置

在新的电脑或新项目中，建议配置全局的 Git 提交作者信息，以确保 GitHub 贡献度（绿墙/草坪）与您的账号正确关联。

### 1. 您的 GitHub 基础信息
*   **GitHub 用户名**：`treefing3rs`
*   **常用 Git 提交作者**：`Moonn`
*   **常用邮箱**：`2775107519@qq.com`

### 2. 全局 Git 身份配置命令
在您的终端（Terminal / PowerShell）中运行以下命令，即可全局绑定该身份：
```bash
# 配置全局用户名
git config --global user.name "Moonn"

# 配置全局邮箱
git config --global user.email "2775107519@qq.com"

# 查看当前已生效的全局配置
git config --global --list
```
> [!NOTE]
> 如果某个特定项目需要使用不同的邮箱/用户名，可在该项目根目录下运行相同的命令，但去掉 `--global` 参数（这会将其写入本地 `.git/config`，覆盖全局设置）。

---

## 🌐 二、 GitHub Pages 部署与配置方法 (通用)

GitHub Pages 提供了两种主流的静态页面部署方式。请根据您的项目类型选择适合的配置：

### 方法 A：基于 GitHub Actions 自动编译部署 (推荐用于 React/Vue/Vite 等构建类项目)
如果您的项目使用了 Vite、Webpack 等构建工具，不能直接运行源码，需要运行 `npm run build` 打包后才能预览：

1.  **修改构建配置中的 Base Path**：
    以 Vite 项目为例，您必须在 `vite.config.js` 中添加 `base` 路径，格式为 `/<仓库名>/`。例如，若仓库名为 `my-new-app`：
    ```javascript
    // vite.config.js
    export default defineConfig({
      base: '/my-new-app/', // 注意两边有斜杠
    })
    ```
2.  **创建自动部署工作流**：
    在项目根目录下新建路径 `.github/workflows/deploy.yml`，并写入标准部署配置（以下为通用模版）：
    ```yaml
    name: Deploy App to Pages
    on:
      push:
        branches: ["master", "main"] # 监听 master 或 main 分支的推送
      workflow_dispatch:
    permissions:
      contents: read
      pages: write
      id-token: write
    concurrency:
      group: "pages"
      cancel-in-progress: false
    jobs:
      deploy:
        environment:
          name: github-pages
          url: ${{ steps.deployment.outputs.page_url }}
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with:
              node-version: 20
              cache: npm
          - run: npm ci
          - run: npm run build
          - uses: actions/configure-pages@v5
          - uses: actions/upload-pages-artifact@v3
            with:
              path: './dist' # 指向您项目打包出的静态目录
          - id: deployment
            uses: actions/deploy-pages@v4
    ```
3.  **在 GitHub 网页端激活**：
    *   进入 GitHub 仓库页面，点击 **Settings**。
    *   在左侧导航栏点击 **Pages**。
    *   在 **Build and deployment** -> **Source** 下，将下拉菜单修改为 **"GitHub Actions"**。
    *   此后每次 `git push`，Actions 都会自动接管打包和上线部署。

---

### 方法 B：直接基于分支部署 (适用于纯 HTML/CSS/JS 项目，或已打包直接推送到分支的项目)
如果您写的是纯原生网页，或者您把打包后的代码单独提交到了某个分支：

1.  **在 GitHub 网页端激活**：
    *   进入 GitHub 仓库页面，点击 **Settings** ➡️ **Pages**。
    *   在 **Build and deployment** -> **Source** 下，保持默认的 **"Deploy from a branch"**。
    *   在下面的 **Branch** 下拉框中，选择您用于展示页面的分支（例如 `main` 或专用的 `gh-pages` 分支），并选择目录（一般为 `/` 根目录，或者 `/docs` 目录）。
    *   点击 **Save**，GitHub 将在几分钟内自动生成预览链接（地址格式通常为：`https://<您的用户名>.github.io/<仓库名>/`）。

---

## 🛠️ 三、 通用 Git 版本管理与协作规范

在所有项目中坚持以下规范，能够极大提高项目的规范性，方便历史回溯。

### 1. 语义化版本（SemVer）规范
使用 `v[主版本号].[次版本号].[修订号]` 标记版本节点：
*   **主版本号 (Major - X.0.0)**：项目发生结构重构、底层技术替换，或发生不兼容的重大 API 变更。
*   **次版本号 (Minor - 0.Y.0)**：在保持向下兼容的前提下，上线了新页面、新模块或新功能。
*   **修订号 (Patch - 0.0.Z)**：纯视觉样式微调、非逻辑性布局优化或小 Bug 修复。

### 2. 约定式提交信息（Commit Message）规范
规范化的 Commit 信息能够让人一目了然地知道每次提交改动了什么。推荐格式：`前缀: 简短描述`。
常用的前缀包括：
*   `feat:` ➡️ 新增功能、新页面、新模块（例：`feat: 增加用户登录模块`）
*   `fix:` ➡️ 修复代码、渲染或逻辑 Bug（例：`fix: 解决移动端侧边栏滑动卡顿问题`）
*   `style:` ➡️ 仅修改样式、配色、字体、间距，不改变业务逻辑（例：`style: 主页背景调整为淡雅磨砂灰`）
*   `refactor:` ➡️ 代码重构（既不新增功能，也不修复 Bug，仅优化结构）（例：`refactor: 提取表单验证逻辑`）
*   `perf:` ➡️ 提高性能的优化改动（例：`perf: 优化首页图片懒加载`）
*   `docs:` ➡️ 仅修改、补充项目相关的 Markdown 文档（例：`docs: 完善项目安装运行步骤说明`）
*   `chore:` ➡️ 杂事、更新依赖、修改打包配置、忽略规则等（例：`chore: 更新 vite 依赖版本`）

### 3. Git 里程碑（Tag）标记
每发布一个稳定版本，在当前 Commit 上打上 Tag，这会让您的 GitHub 仓库的 Release 页面非常规范：
```bash
# 1. 在本地打上版本标签
git tag v1.0.0

# 2. 将标签推送至远程 GitHub 仓库
git push origin v1.0.0

# 3. 如果需要删除本地和远程标签（万一打错了）
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
```

---

## 🔍 四、 提交前防污染自检三步法

无论 AI 助手还是您在提交前，请在终端执行这三步，以保证每次 Commit 都是健康的：

1.  **文件状态自检 (`git status`)**
    *   检查是否有非必要文件进入 Stage 区域（如临时调试日志、编辑器自动生成的 `.idea/` 或 `.vscode/` 目录、`dist/` 编译目录、或者敏感的 `.env` 配置文件）。
    *   如果误加入了，使用如下命令撤销追踪并将其记录入 `.gitignore`：
        ```bash
        git rm --cached <文件名或目录名>
        ```
2.  **提交链与版本号对齐 (`git log` & `git tag`)**
    *   运行 `git log -n 5 --oneline` 审查最近提交，保持提交历史树线性的清晰度。
    *   运行 `git tag -l` 确保新打的版本号（SemVer）是在之前版本基础上的规范递增，不跳号、不重号。
3.  **Commit 信息自检**
    *   确认使用的前缀是否符合 `feat:` / `fix:` / `style:` 等，且内容描述清晰明了。
