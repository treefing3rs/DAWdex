# 舞台 UI 实现说明（PR #17 基线）

舞台 UI 是 DAWdex 的呈现层：复古监视器外壳 + 像素录音棚舞台 + 屏幕内弹幕。
舞台视觉状态只消费 `ui-contract.ts` 的结构化事件，不解析模型自由文本。
当前 `AgentOverlay` 同时承载控制器职责：调用计划、批准、执行和撤销，再由
真实事件桥接器把执行结果与 openDAW 工程快照翻译为同一套 UI 事件。
设计依据见 [`DESIGN_DIRECTION.md`](./DESIGN_DIRECTION.md)（v2.3）。

> 维护：成员 A（UI 与舞台层）· 记录基线：PR #17 · 2026-07-25（含巡棚箭头换台；角色入场 + 电梯 + 六房间巡棚 + 工作台 + 五房间物件管线 + Fig Mint 主机壳）
> 当前公开证明范围以仓库 [`README.md`](../../README.md) 为准。

## 文件地图

| 文件 | 作用 |
|---|---|
| `opendaw/packages/app/studio/src/agent/ui-contract.ts` | 三方契约 v0.1（7 个下行事件 + 2 个上行命令，冻结候选） |
| `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx` | 舞台 UI 主组件（外壳/舞台/弹幕/抽屉/干预） |
| `opendaw/packages/app/studio/src/agent/AgentOverlay.sass` | 舞台样式（角色动画时长由 `--beat` CSS 变量驱动） |
| `opendaw/packages/app/studio/src/agent/RealUiEventBridge.ts` | 将真实 Plan、Apply/Undo 回执、Transport 与轨道可听状态翻译为 UI 事件 |
| `opendaw/packages/app/studio/src/agent/mock-timeline.ts` | 90 秒演示事件序列（与真实接口同一签名） |
| `opendaw/packages/app/studio/public/dawdex/` | 舞台素材（夜景循环视频、角色立绘） |

## 演示模式（Mock）

Mock **不再默认自动播放**，只在两种情况下运行：

- URL 带 `?mock=1`（打开即进入 90 秒演示）
- 点击顶栏 `↻` 按钮（随时回放，便于稳定复现产品讲解）

默认打开舞台为真实模式。`RealUiEventBridge` 每 500 ms 从
`DawProjectAdapter.snapshot()` 同步走带、循环小节和实际可听轨道；Plan、
Apply、Undo 与用户干预回执也通过该桥接器进入舞台。Mock 与真实事件共用
同一 `emit(event: UiEvent)` 签名，演示播放时会暂停真实桥接，结束后恢复。

## 游戏感系统（R4 新增）

1. **入场系统**：角色开局不在房间里；首次收到事件（任务/状态/发声）时
   从右侧门外以 8-bit 步进式走位（`steps(14)`，1.1s）入场落位。站位按
   1600×1067 场景标定：鼓 35% / 贝斯 45% / 键盘 75.5%，脚底 bottom 5%。
   演奏动画作用于 `img` 子元素，与走位 transform 互不干扰。
2. **进棚过场**：首次挂载显示 2.6s「上楼进棚」过场
   （`elevator_loading.jpg`），点击可跳过。引擎加载发生在组件挂载之前，
   过场是氛围层，不伪装加载进度。
3. **写实比例角色**（v2 立绘）：5 头身侧视、细像素颗粒、暖金轮廓光，
   与夜景场景同源，取代 Q 版 V3；高度用 `40cqh` 锁定舞台比例。鼓/贝斯/
   键盘是当前活跃轨道角色；制作人常驻控制室；吉他手素材已入库但尚未接入
   真实轨道角色。
4. **巡棚频道**（§11.1 落地）：顶栏 `CH ‹ 房间名 ›`、舞台两侧换台箭头（悬停浮现，用过一次后常驻）与键盘左右方向键（输入框聚焦时不抢按键）均可循环切台；切台时播放 300ms 老电视频闪 `crt-zap`（白闪压缩→黑场回弹→二次闪光 + 噪点），硬切无长转场（TV 气质）。六个频道：演播大厅（视频）/ 鼓棚 / 吉他贝斯棚 /
   键盘阁楼 / 控制室 / 休息室。每个房间只显示本房间的演员
   （`.stage[data-room]` 演员表，站位按各房间场景标定）；制作人常驻
   控制室（非轨道角色，不参与五态机与入场）。支持 `?room=<id>` 深链，
   演示导航用。弹幕、走带读数、REC 灯牌、雪花噪点为全局层，跨房间一致。
5. **五房间物件管线**（PR #17）：28 个物件替身 sprite 原位盖回 + 轮廓命中 +
   无遮罩 hover 变亮 + 点击开功能面板 + Diegetic REC 灯牌；方法论与物件映射表见
   [`DESIGN_DIRECTION.md`](./DESIGN_DIRECTION.md) §12。命中测试按部件自带视角独立计算，
   不共享 3D 空间（避免跨房间击穿）。舞台套在 Fig Mint 主机壳中，下方键盘甲板
   承载物件面板（deck-focus 运镜）；走带播放时房间循环视频淡入（演出态皮肤），暂停回静帧。

## 真实性闸门（R2 新增）

舞台展示与真实音乐状态之间有三道闸门，宁可不演、不可假演：

1. **演奏状态以发声为准**：`RoleStateChanged(performing)` 不会直接点亮
   演奏动画，只进入 `queued`；收到 `TrackAudibleChanged(audible=true)`
   才进入 `performing`。轨道静音时角色立即退回待机。
2. **走带同步**：本地时钟以每次 `TransportChanged` 的 `currentBar` 校准；
   `isPlaying=false` 时走带读数与挂钟指针冻结（舞台底部白条进度条已移除）、角色与状态灯动画暂停
   （`.transport-paused`）；角色演奏动画的一拍时长 = `60/BPM` 秒，
   由 `--beat` 变量驱动，不写死。
3. **干预全部真实**：FR-09 六个操作中，`撤销` 走 `DawProjectAdapter.undo()`；
   `保留` 放弃待批准计划；其余四项翻译成真实计划请求（走 `/v1/plan` 链路，
   用户批准后真实修改音乐）。不再显示"下一循环生效"这类无兑现的文案。

## openDAW 工作台（PR #12）

- 点击 `⌄ 工作台`、按 `Esc` 或使用 `?workbench=1` 收起演播厅外壳；
- 新建/打开工程默认先进入完整演播厅产品形态；
- 收起后根节点不拦截 Pointer Event，用户直接操作底层同一个 openDAW；
- 工作台形态在右下停靠层显示当前 DAWdex 演播厅缩略窗；
- 缩略窗只读，显示当前房间、角色、REC/走带与有限弹幕；
- 点击缩略窗、按 `Enter` / `Space` 或按 `Esc` 返回产品形态；
- 工作台不再显示重复的右缘 DAWDEX 侧拉条；
- `RealUiEventBridge` 仍只有一个并按 500 ms 同步，返回演播厅即显示最新状态；
- 工作台与投屏模式互斥，输入框聚焦时 `Esc` 不劫持键盘。

## 已知边界

- 干预操作目前在前端映射为计划请求；B 的 `/v1/intervention` 端点就绪后
  改为直发 `UserIntervention`（契约已定义，UI 改动极小）。
- `AgentUiEvent` 仍需在后续版本冻结：当前 echo 来自同一 Plan 的
  `decisionSummary`，`operationRef` 使用 `planId/op-N`，Transport 按全量事件处理。
- 当前可听判断基于真实走带位置、Region 音符、轨道/Region 静音、Solo 与
  乐器存在状态；它不是音频电平表。未来接入真实峰值事件后可进一步确认
  “有信号”而非“理论上应发声”。
- 弹幕范围按 v2.3 §13.1 裁决：**只在屏幕内**（取代旧 v2.2 的"全屏弹幕
  遮罩"条款）；输入与安全区在屏幕外。
- 完整歌曲前端尚未落地；下一阶段由控制室编曲白板消费
  `BlueprintChanged` / `SectionChanged` / `SectionLocked` 等增量事件，
  具体方向见 [`DESIGN_DIRECTION.md`](./DESIGN_DIRECTION.md)。

## 验证

- `npx tsc --noEmit` 零错误
- `npm.cmd run test -w @opendaw/app-studio`：34 个测试全部通过（巡棚箭头换台提交后）
- 无头浏览器截图验证两种模式：默认模式无 Mock 自动播放；`?mock=1`
  演示模式下发声闸门按时间轴逐轨点亮
