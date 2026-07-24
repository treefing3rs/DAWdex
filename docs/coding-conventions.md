# DAWdex 编码与架构规范

> 适用范围：`opendaw/` 中的 DAWdex UI、Agent Server、音乐意图、MIDI 素材、角色编排与测试。

## 一、基本原则

1. 结构化数据是角色对话与音乐执行的唯一事实源。
2. 模型负责创意，代码负责音乐硬规则和工程安全。
3. Renderer 不接触 API Key、供应商 SDK 或任意文件系统权限。
4. 角色不能绕过编排器直接修改工程。
5. 当前行为、目标行为和模拟行为必须在 UI 与文档中区分。
6. 不为了“多 Agent”增加无法解释的调用。
7. 现场 Demo 的确定性高于功能数量。

## 二、目录

当前增量代码继续放在 openDAW Monorepo 内：

```text
opendaw/packages/app/studio/src/agent/
├─ protocol/          # MusicBrief、RoleTask、AgentEvent
├─ intent/            # 弹幕规范化、Producer、Compiler
├─ roles/             # 角色定义和工作回执映射
├─ midi/              # 索引、检索、变体、质量闸门
├─ playback/          # 循环边界与角色状态
├─ ui/                # Overlay 和角色组件
└─ adapters/          # openDAW Project Adapter

opendaw/packages/server/dawdex-agent/
├─ src/providers/
├─ src/runtime/
├─ src/schemas/
└─ src/server.ts
```

不要求在黑客松期间机械搬迁当前文件；新增模块按上述职责拆分，避免继续把全部逻辑放进 `AgentOverlay.tsx` 或 `server.ts`。

## 三、TypeScript 风格

遵循 openDAW 现有风格：

- 4 空格缩进；
- 无分号；
- 双引号；
- `readonly` 优先；
- 外部输入使用 `unknown`；
- 判别联合表示状态；
- 不传播 `any`；
- 单位写进变量名。

```ts
type LoopSchedule = {
    readonly startPpqn: number
    readonly lengthPpqn: number
    readonly queuedAtMs: number
}
```

Boolean 使用：

```text
isPlaying
hasSelectedIntent
canApplyPlan
shouldUseFallback
```

## 四、Schema 边界

以下输入必须经过 Zod 或等价 Schema：

- HTTP Body；
- LLM 输出；
- CLI 事件；
- Provider 配置；
- MIDI 元数据文件；
- 本地缓存；
- IPC 消息；
- 用户导入的工程信息。

Schema 不只用于 TypeScript 推断，还必须限制：

- 字符串长度；
- 数组数量；
- BPM、Pitch、Velocity 和 Bars 范围；
- 允许的角色；
- 允许的动作；
- 嵌套深度。

## 五、角色规则

每个角色定义：

```ts
type RoleDefinition = {
    readonly id: MusicRole
    readonly displayName: string
    readonly responsibility: string
    readonly allowedOperations: ReadonlyArray<MusicOperation["type"]>
}
```

必须：

- 只在职责范围内操作；
- 输出专业摘要和通俗解释；
- 引用全局 Music Brief；
- 声明保留项；
- 返回结构化任务；
- 被制作人或编排器合并。

禁止：

- 输出模型私有思维链；
- 角色自由发明工程能力；
- 鼓手修改全局调性；
- 混音师重写旋律；
- 工作回执与实际操作分开生成；
- 多个角色并发写工程。

## 六、音乐规则

### 硬规则进入代码

不得只靠 Prompt 保证：

- BPM；
- Key/Scale；
- 拍号；
- 小节长度；
- 音域；
- MIDI 合法性；
- 量化边界；
- 最大轨道数；
- 最大默认音量；
- Undo 事务。

### 可复现

随机变体必须使用显式 `seed`：

```ts
createVariation({assetId, seed, operations})
```

测试不能依赖未固定的 `Math.random()`。

### 素材来源

每个 MIDI 素材必须有来源和许可证字段。未确认可分发的素材不得提交到公开仓库。

## 七、openDAW Adapter

只有 Adapter 可以：

- 创建 Instrument；
- 创建 Note Region；
- 创建 Note Event；
- 修改 Transport；
- 执行 Undo；
- 读取工程快照。

业务层使用稳定的 `MusicOperation`，不直接依赖 openDAW Box 或 Adapter 类型。

所有动作：

```text
validate
→ open one editing transaction
→ apply
→ read back
→ emit result
```

一次计划默认是一个 Undo 单元。

## 八、Provider

Provider 配置不得进入 Renderer Bundle。

环境变量使用：

```text
DAWDEX_PROVIDER
DAWDEX_API_PROTOCOL
DAWDEX_API_BASE_URL
DAWDEX_API_KEY
DAWDEX_MODEL
DAWDEX_AGENT_PORT
DAWDEX_STUDIO_ORIGIN
```

为了兼容当前实现，可以暂时读取 `OPENAI_API_KEY` 和 `OPENAI_MODEL`，但新代码以统一配置为目标。

日志禁止出现：

- API Key；
- Authorization Header；
- 完整私有 Prompt；
- 完整 MIDI 文件；
- 用户本地绝对路径；
- CLI 登录 Token。

## 九、Renderer

UI 组件只负责：

- 展示状态；
- 发送用户意图；
- 渲染角色工作回执；
- 控制保留、重做和撤销；
- 显示公开错误。

不要在 UI 中：

- 解析 LLM JSON；
- 推断音乐动作；
- 保存 Key；
- 直接构造 openDAW Note Event；
- 使用定时文案假装操作已成功。

角色进入演奏状态必须由真实工程事件或成功回执驱动。

## 十、中文与编码

所有源码和 Markdown 使用 UTF-8。提交前必须检查：

- 中文占位文案；
- 正则表达式中的中文关键词；
- 箭头、引号和省略号；
- Windows PowerShell 读取是否造成误判；
- 文件本身是否真的出现乱码。

禁止提交 `锛`、`鈫`、`绔` 等明显 mojibake。检查命令可以使用支持 UTF-8 的编辑器或脚本，不要仅依赖旧版 PowerShell 默认编码。

## 十一、错误与回退

错误必须是可区分状态：

```ts
type PublicAgentError =
    | { readonly code: "SERVER_UNAVAILABLE"; readonly message: string }
    | { readonly code: "MODEL_TIMEOUT"; readonly message: string }
    | { readonly code: "INVALID_PLAN"; readonly message: string }
    | { readonly code: "NO_MIDI_CANDIDATE"; readonly message: string }
    | { readonly code: "QUALITY_GATE_FAILED"; readonly message: string }
    | { readonly code: "DAW_APPLY_FAILED"; readonly message: string }
```

每种错误必须有明确回退或终止策略，不能无限重试。

## 十二、测试

每个新增动作至少测试：

1. 合法输入；
2. 边界输入；
3. 非法模型输出；
4. openDAW 执行；
5. Undo；
6. UI 工作回执一致性；
7. 本地回退。

影响音乐生成时，补充固定 Seed Snapshot 或音符列表断言。

影响 UI 时，提交截图或短视频。

## 十三、Git

提交信息使用 Conventional Commits：

```text
feat(agent): compile audience intent into role tasks
feat(midi): add weighted material retrieval
feat(ui): show virtual player handoffs
fix(playback): queue tracks on loop boundary
fix(text): restore utf-8 chinese labels
docs(prd): align plan with virtual band direction
```

不提交：

- `.env`；
- API Key；
- `node_modules`；
- `dist`、`target` 和构建缓存；
- 本地 Codex/GitHub 认证信息；
- 未确认许可证的 MIDI/音频；
- 大型临时测试工程。

## 十四、PR 检查

- [ ] 角色对话是否来自实际结构化任务；
- [ ] 外部输入是否经过 Schema；
- [ ] 音乐硬规则是否进入代码；
- [ ] 失败时旧 Loop 是否继续；
- [ ] 是否提供本地回退；
- [ ] 中文是否无乱码；
- [ ] 是否泄漏密钥或路径；
- [ ] 是否增加不必要的模型调用；
- [ ] 是否更新测试和相关文档；
- [ ] 是否在固定 Demo 工程验证。
