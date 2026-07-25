# DAWdex 编码与架构规范

> 适用基线：0.3.0 / PR #12
> 适用范围：Studio Agent UI、Agent Server、MIDI、音色、DAW 控制与未来 Song 层

## 一、不可破坏的原则

1. 结构化 Plan、openDAW Snapshot 和执行回执是唯一事实源。
2. 模型负责音乐判断；Schema、Capability、质量规则和事务负责安全。
3. 生产规划必须检索真实 MIDI，不得回到固定 Pattern 生成替代音符。
4. Renderer 不接触 API Key、Codex Token 或任意文件系统权限。
5. 每个外部 ID、路径、设备和操作都必须验证。
6. UI 状态、角色文案和真实音乐修改必须同源。
7. 没有 `TrackAudibleChanged(audible=true)`，不得显示角色正在演奏。
8. 当前能力、Mock、Fallback 和未来方向必须明确区分。
9. 不为了“多 Agent”制造没有独立责任和验证方式的调用。
10. 一轮工程修改默认是一个 Undo 单元。

## 二、当前目录

```text
opendaw/packages/server/dawdex-agent/src/
├─ server.ts             # HTTP 与规划编排
├─ CodexAppServer.ts     # Codex app-server 生命周期
├─ MusicPlan.ts          # Zod Schema、Prompt 与解析
├─ MidiCatalog.ts        # SQLite 检索
└─ index-midi.ts         # 索引构建

opendaw/packages/app/studio/src/agent/
├─ AgentClient.ts
├─ AgentProtocol.ts
├─ AgentOverlay.tsx
├─ DawProjectAdapter.ts
├─ DawCapabilityRegistry.ts
├─ DawControlExecutor.ts
├─ LocalMusicPlanner.ts
├─ RealUiEventBridge.ts
├─ ui-contract.ts
├─ music/
└─ pipeline/
```

不要为符合旧文档中的理想目录而机械搬迁文件。新增模块按单一责任拆分，避免继续扩大 `AgentOverlay.tsx`、`server.ts` 或 `DawControlExecutor.ts`。

未来 Song 层建议独立于 Loop/Track 执行层：

```text
agent/song/
├─ SongBlueprint.ts
├─ SongPatch.ts
├─ SongValidator.ts
└─ SongEvaluator.ts
```

实际创建前必须先冻结 Schema 和调用边界。

## 三、TypeScript

遵循 openDAW 现有风格：

- 4 空格缩进；
- 无分号；
- 双引号；
- `readonly` 优先；
- 外部输入使用 `unknown`；
- 判别联合表示状态；
- 避免传播 `any`；
- 单位写入字段名；
- 使用显式、可复现 seed。

```ts
type SectionRange = {
    readonly startBar: number
    readonly bars: number
}
```

Boolean 使用明确前缀：

```text
isPlaying
hasProject
canApplyPlan
shouldUseFallback
```

## 四、Schema

以下输入必须经过 Zod 或等价校验：

- HTTP Body；
- Codex/OpenAI 输出；
- Project Snapshot；
- MIDI 目录记录；
- DAW Control Action；
- Provider 状态；
- 用户导入资产；
- 未来 Song Blueprint/Patch。

Schema 必须限制：

- 字符串长度和数组数量；
- BPM、Pitch、Velocity、Bars 和归一化值；
- 角色、命令和操作枚举；
- ID/Path 是否来自当前 Snapshot 或 Catalog；
- 嵌套深度；
- 一轮最大动作数。

解析模型输出时，先校验 Wire Schema，再转换为内部严格类型。不要把宽松模型对象直接传给执行器。

## 五、MIDI

### 来源

每个生产动作必须包含：

```text
midiAssetId
midiAssetPath
role
source fingerprint
transform receipt
```

Asset 必须来自 `MidiCatalog` 给出的候选。模型不得编造路径，也不得在选中后丢弃素材并用 `PatternCompiler` 重建音符。

### 变换

允许的变换要：

- 有显式参数；
- 使用固定 seed；
- 符合角色音域；
- 保持小节/PPQN 合法；
- 写入 Transform Receipt；
- 可通过 Undo 恢复。

### 数据分发

- `midi/.dawdex/catalog.sqlite` 不提交；
- 未确认分发授权的 MIDI/音频不提交；
- 完整库和代码仓库分离；
- README 只记录数量、构建方式和本地路径规则。

## 六、DAW Adapter 与控制

业务层不能直接持有任意 openDAW 内部对象。通过：

```text
AgentPlan
→ validate action envelope
→ resolve exact IDs
→ open editing transaction
→ execute
→ read back
→ emit OperationResult
```

要求：

- `DawCapabilityRegistry` 是命令和操作白名单；
- Target ID 必须存在于当前 Snapshot；
- Asset 型 Instrument 必须引用当前工程资产；
- 不覆盖用户轨道；
- `replace` 只针对 DAWdex 生成轨道；
- 一轮失败时回滚，不破坏旧工程；
- Transport 即时操作不伪装成可撤销历史。

## 七、Provider

实际环境变量：

```text
DAWDEX_AGENT_PROVIDER
DAWDEX_AGENT_PORT
DAWDEX_STUDIO_ORIGIN
DAWDEX_CODEX_CWD
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_BASE_URL
```

Provider 配置不得进入 Renderer Bundle。

日志禁止出现：

- API Key、Authorization Header 或登录 Token；
- 完整私有 Prompt；
- 用户私有绝对路径；
- 整个 MIDI 文件内容；
- Codex 认证数据。

`CodexAppServer` 负责进程、登录、请求和超时；不要在 UI 组件中调用本机 CLI。

## 八、UI

UI 只负责：

- 发送用户意图；
- 展示 Plan、角色状态和执行证据；
- 提供审批、干预与 Undo；
- 翻译 Transport 和可听状态；
- 区分 Codex、OpenAI、Local、Mock。

UI 不得：

- 解析模型 JSON；
- 推断 MIDI 或和声结果；
- 保存密钥；
- 直接创建 Note Event；
- 用计时器假装工程成功；
- 从时间线猜测未来 Song Section。

当前事件类型以 `ui-contract.ts` 为准。未来完整歌曲事件必须增量版本化，不能破坏现有 v0.1 事件。

## 九、Song Blueprint

未来 Song 层必须遵守：

- Blueprint 有 `revision`；
- Patch 带 `baseRevision`；
- target 与 preserve/locked 范围不得冲突；
- Section、Phrase、Region、Notes 层级清晰；
- 每个 Phrase 记录素材来源和发展关系；
- Patch 翻译为现有 DAW Actions 后再次校验；
- 结构修改与音符修改可以分别审批；
- 执行后重新读取并评价整曲状态。

模型不能直接覆盖完整 Blueprint；必须提交可审计 Patch。

## 十、音色

MIDI 与 Sound Profile 使用独立数据结构。

当前自动路径是 Vaporisateur + Mixer + Effects。选择 Soundfont、Nano、Playfield 或 Apparat 前必须确认 Snapshot 中存在兼容 Asset ID。

Sound Profile 至少记录：

```text
role
styles
instrument kind
asset/preset
range
effects
availability
license
```

不要根据风格名称随意选择音色，也不要创建无资产、不能发声的设备。

## 十一、中文与编码

源码和 Markdown 使用 UTF-8。提交前检查：

- 中文占位文案；
- 正则中的中文关键词；
- 箭头、引号和省略号；
- `锛`、`鈫`、`绔` 等 mojibake；
- macOS、Windows PowerShell 与 CI 的实际读取结果。

## 十二、错误与回退

错误必须可区分：

```text
SERVER_UNAVAILABLE
MODEL_TIMEOUT
INVALID_PLAN
NO_MIDI_CANDIDATE
MIDI_ASSET_MISSING
QUALITY_GATE_FAILED
CAPABILITY_REJECTED
DAW_APPLY_FAILED
```

每种错误必须终止或进入明确回退，不得无限重试。Fallback 必须进入公开 UI 状态。

## 十三、测试

每个新动作至少覆盖：

1. 合法输入；
2. 边界输入；
3. 非法模型输出；
4. Capability 拒绝；
5. openDAW 执行；
6. Undo/回滚；
7. UI 回执一致性；
8. 本地回退。

音乐变换使用固定 Seed 与音符/指纹断言。UI 变化除单元测试外应有浏览器截图或录屏验证。

主链验证：

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
npm run build -w @opendaw/app-studio
npm run test -w @opendaw/app-studio
git diff --check
```

## 十四、Git 与 PR

使用 Conventional Commits，例如：

```text
feat(song): add blueprint patch validation
feat(midi): group candidates by motif family
feat(ui): render section state on arrangement board
fix(agent): reject invented asset identifiers
docs(vision): align full-song architecture
```

不提交：

- `.env`、Token、认证数据；
- `node_modules`、`dist` 和构建缓存；
- `catalog.sqlite`；
- 未确认授权的 MIDI/音频；
- 临时浏览器产物；
- 与当前 PR 无关的大规模格式化。

PR 检查：

- [ ] 当前事实与目标方向是否区分？
- [ ] MIDI 是否来自真实 Asset？
- [ ] 外部输入是否校验？
- [ ] Target ID 与 Capability 是否验证？
- [ ] 用户锁定/保留范围是否尊重？
- [ ] UI 是否来自真实事件？
- [ ] 失败是否回滚并公开？
- [ ] 测试和文档是否同步？
