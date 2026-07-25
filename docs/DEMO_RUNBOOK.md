# DAWdex 公开演示脚本

> 当前可运行：Drums / Bass / Keys 三角色 Guided Demo
> 正在接入：单乐器、单轨道、`Intro → Verse → Chorus → Bridge`

## 一、演示边界

- DAWdex 的产品意义是把观众表达转成可理解、可追踪的音乐创作过程；
- 当前 `↻` 会运行固定的三角色 UI 事件时间线；
- Guided Demo 不调用实时 Agent Plan、SQLite Retriever 或 DAW Adapter 写入；
- 单乐器、单轨、四段落是产品展示切片和界面设计目标，当前公有分支尚无对应运行时与资产；
- 多乐器、多轨道和完整歌曲是更后的产品方向。

## 二、开机检查

- [ ] Studio 可以打开；
- [ ] 顶栏可见 `↻`；
- [ ] 点击 `↻` 后弹幕与制作人采纳事件出现；
- [ ] Drums、Bass、Keys 三个角色依次收到任务；
- [ ] UI 依次显示角色状态和 Operation Result；
- [ ] 讲解中明确称其为 Guided Demo，不称为实时 Agent/DAW 执行。

本地启动：

```bash
cd opendaw
npm run dev:dawdex-studio
```

## 三、当前真实可运行路径

1. 用一句话定义产品：DAWdex 是弹幕驱动的 AI 乐队 Agent，让普通人能看懂并继续控制音乐创作过程；
2. 点击顶栏 `↻` 启动 Guided Demo；
3. 展示观众弹幕与制作人采纳；
4. 展示 Drums、Bass、Keys 依次获得带 `operationRef` 的角色任务；
5. 展示三个角色依次进入 queued / performing 状态；
6. 展示最终 Operation Result 与第二次 Bass 干预；
7. 明确说明这些是固定时间线派发的 UI 事件，用来证明界面叙事和事件契约；
8. 结尾展示正在接入的单乐器四段式目标，但不现场操作不存在的 Flow。

## 四、当前代码可以证明的工程能力

源码与测试可以核对：

- Agent Server 解析结构化 Creative Brief / `AgentPlan`；
- `MidiCatalog` 实现 SQLite 检索、排序和指纹去重；
- Plan 只有经过用户“批准并执行”才交给 `DawProjectAdapter`；
- Adapter 将修改写入一个 Undo 编辑，并在异常或写后验证失败时回滚；
- `RealUiEventBridge` 用 Plan ID / `operationRef` 关联角色任务和结果。

这些是工程组件证据。因为授权 MIDI 文件和生成的 SQLite 数据库不随 Git 分发，clean clone 不能直接复现完整资料库端到端运行。

## 五、正在接入的最小展示切片

目标体验：

```text
选择 Drums / Bass / Keys 中的一种乐器
→ 创建一条轨道
→ Intro
→ Verse
→ Chorus
→ Bridge
→ 单轨结果
```

当前状态：

- Flow 控制器：未在公有分支；
- 对应 View：未在公有分支；
- 单轨演示 MIDI 资产：未在公有分支；
- 因此只可作为设计目标讲解，不可作为已运行结果展示。

## 六、禁止夸大

- 不把 Guided Demo 的固定事件讲成实时模型输出；
- 不把 UI 中的三角色状态讲成三条真实 DAW 轨道已写入；
- 不说单乐器四段式 Flow 已交付；
- 不说当前已经生成完整歌曲；
- 不说整个 MIDI 资料库随仓库分发或参与了本次演示；
- 不用 `193,320` 推断 clean clone 已启用完整索引；
- 不把代码组件存在讲成端到端产品验证已经完成。

## 七、90 秒结尾句

> DAWdex 是弹幕驱动的 AI 乐队 Agent。当前可运行的 Guided Demo 用 Drums、Bass、Keys 三角色固定时间线证明界面叙事和事件契约；仓库同时提供结构化计划、检索、审批、写入回滚和可追踪回执的工程组件。单乐器、单轨、Intro 到 Bridge 的展示切片仍在接入，之后才继续扩展到多轨和完整歌曲。
