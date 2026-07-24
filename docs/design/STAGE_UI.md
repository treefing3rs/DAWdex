# 舞台 UI 说明（PR #6）

> 维护：成员 A（UI 与舞台层）· 最近更新：2026-07-25（R2，回应评审）

舞台 UI 是 DAWdex 的呈现层：复古监视器外壳 + 像素录音棚舞台 + 屏幕内弹幕。
它只消费 `ui-contract.ts` 的结构化事件，不解析模型自由文本、不直接改
openDAW 工程。设计依据见 [`DESIGN_DIRECTION.md`](./DESIGN_DIRECTION.md)（v2.3）。

## 文件地图

| 文件 | 作用 |
|---|---|
| `opendaw/packages/app/studio/src/agent/ui-contract.ts` | 三方契约 v0.1（7 个下行事件 + 2 个上行命令，冻结候选） |
| `opendaw/packages/app/studio/src/agent/AgentOverlay.tsx` | 舞台 UI 主组件（外壳/舞台/弹幕/抽屉/干预） |
| `opendaw/packages/app/studio/src/agent/AgentOverlay.sass` | 舞台样式（角色动画时长由 `--beat` CSS 变量驱动） |
| `opendaw/packages/app/studio/src/agent/mock-timeline.ts` | 90 秒演示事件序列（与真实接口同一签名） |
| `opendaw/packages/app/studio/public/dawdex/` | 舞台素材（夜景循环视频、角色立绘） |

## 演示模式（Mock）

Mock **不再默认自动播放**，只在两种情况下运行：

- URL 带 `?mock=1`（打开即进入 90 秒演示）
- 点击顶栏 `↻` 按钮（随时回放，也用作现场故障兜底）

默认打开舞台为真实模式：走带显示 `STANDBY · 等待走带同步`，角色待机，
等待 B/C 的真实事件接入。Mock 与真实事件共用同一 `emit(event: UiEvent)`
签名，联调时只需替换事件来源。

## 真实性闸门（R2 新增）

舞台展示与真实音乐状态之间有三道闸门，宁可不演、不可假演：

1. **演奏状态以发声为准**：`RoleStateChanged(performing)` 不会直接点亮
   演奏动画，只进入 `queued`；收到 `TrackAudibleChanged(audible=true)`
   才进入 `performing`。轨道静音时角色立即退回待机。
2. **走带同步**：本地时钟以每次 `TransportChanged` 的 `currentBar` 校准；
   `isPlaying=false` 时进度条冻结、角色与状态灯动画暂停
   （`.transport-paused`）；角色演奏动画的一拍时长 = `60/BPM` 秒，
   由 `--beat` 变量驱动，不写死。
3. **干预全部真实**：FR-09 六个操作中，`撤销` 走 `DawProjectAdapter.undo()`；
   `保留` 放弃待批准计划；其余四项翻译成真实计划请求（走 `/v1/plan` 链路，
   用户批准后真实修改音乐）。不再显示"下一循环生效"这类无兑现的文案。

## 已知边界（联调前）

- 干预操作目前在前端映射为计划请求；B 的 `/v1/intervention` 端点就绪后
  改为直发 `UserIntervention`（契约已定义，UI 改动极小）。
- `AgentUiEvent` 三个悬案待 B/C 确认：echo 归属、`operationRef` 格式、
  Transport 全量 vs 增量（UI 目前按全量处理）。
- 弹幕范围按 v2.3 §13.1 裁决：**只在屏幕内**（取代旧 v2.2 的"全屏弹幕
  遮罩"条款）；输入与安全区在屏幕外。

## 验证

- `npx tsc --noEmit` 零错误
- `npx vitest run`：9 个文件 27 个测试全部通过
- 无头浏览器截图验证两种模式：默认模式无 Mock 自动播放；`?mock=1`
  演示模式下发声闸门按时间轴逐轨点亮
