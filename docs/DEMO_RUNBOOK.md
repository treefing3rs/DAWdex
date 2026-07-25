# DAWdex 演示彩排脚本

> 基线：0.3.0 / PR #11
> 目标：用两条可切换路径展示同一套真实事件契约

## 一、演示原则

- A 路径使用固定 90 秒 Mock，是现场主线和故障兜底；
- B 路径连接真实 Agent、MIDI 检索和 openDAW，是进阶展示；
- Mock 与真实链共享 `UiEvent`，但必须明确来源；
- 角色只有在轨道确认可听后才演奏；
- 完整歌曲是正式方向，不在本次 Demo 中假装已经完成。

## 二、开机检查

- [ ] Studio 可以打开，首次出现 2.6 秒电梯进棚过场；
- [ ] 过场后默认是真实模式，不自动播放 Mock；
- [ ] 顶栏可见 Provider、ON AIR、频道、投屏和 `↻`；
- [ ] 六个频道均可切换；
- [ ] 乐队会议抽屉可以打开；
- [ ] Agent Server 已打开完整 MIDI 索引，或明确使用小规模回退。

本地启动：

```bash
cd opendaw
npm run dev:dawdex-studio
```

真实链另开终端：

```bash
cd opendaw
npm run dev:dawdex-agent
```

## 三、路径 A：90 秒 Mock

启动方式：

- 点击顶栏 `↻`；
- 或打开 `http://localhost:8080/?mock=1`。

演示节奏：

1. **0–30 秒**：空舞台、用户弹幕和制作人采纳；
2. **31–45 秒**：鼓手、贝斯手、键盘手依次从门外入场；
3. **45–68 秒**：角色先进入 queued，再在可听确认后逐轨演奏；
4. **68–90 秒**：二次干预，展示替换与收尾；
5. 演示中切换鼓棚、键盘阁楼、控制室和休息室；
6. 打开乐队会议，展示 Plan、角色回执和 Operation Result。

房间深链：

```text
?mock=1&room=drums
?mock=1&room=strings
?mock=1&room=keys
?mock=1&room=control
?mock=1&room=lounge
```

讲解重点：

> 角色不是按预设时间假装演奏。`RoleStateChanged` 让他准备，`TrackAudibleChanged` 才确认真正发声。

## 四、路径 B：真实链

前置：

1. Studio 与 Agent Server 都已启动；
2. 页面 Provider 状态清楚显示 Codex、OpenAI 或 Local；
3. 完整 MIDI 索引日志可见时，才说“19 万级资料参与检索”。

演示步骤：

1. 输入：“再炸一点，像最终 Boss 出场。”
2. 展示 Creative Brief 与检索/编排进度；
3. 打开 Plan，指出真实 MIDI 文件、音色和效果；
4. 批准执行；
5. 在 openDAW 中确认角色轨道和 Region；
6. 播放工程，等待角色在真实发声后点亮；
7. 输入：“保留 Keys，只让鼓和 Bass 更有力量。”
8. 展示 `preserveTrackIds`、原位替换和一次 Undo；
9. 切换控制室，说明下一阶段 Song Blueprint 会长成编曲白板。

## 五、兜底

| 情况 | 动作 |
|---|---|
| Codex 未登录 | 使用 OpenAI-compatible Provider；没有 Key 则进入 Local |
| Agent Server 起不来 | 切换路径 A |
| 完整 SQLite 索引缺失 | 明确说明使用精选目录回退，不说完整库已启用 |
| 真实计划中途失败 | 展示错误/回退状态，然后点击 `↻` 接续 Mock |
| 视频不能自动播放 | 使用静态 `studio_night.jpg` |
| 房间或角色图片异常 | 保留 openDAW 专业视图和证据抽屉讲解 |

## 六、禁止夸大

- 不说“已经生成完整歌曲”；当前是 4/8 小节垂直切片；
- 不说“每个角色都是独立 Agent”，除非真实运行结构如此；
- 不说角色动画代表音频电平；当前代表轨道可听状态；
- 不说 SoundFont/风格音色目录已经完成；
- 不说完整 MIDI 索引已启用，除非日志确认约 193,320 个资产；
- 不把 Mock 操作讲成实时模型输出；
- 不把本地回退讲成 Codex/OpenAI 结果。

## 七、90 秒讲解句

> DAWdex 把一句普通弹幕变成 Creative Brief，从真实 MIDI 资料中选出可追踪素材，再让用户审批后写入 openDAW。角色只有在轨道真正发声后才演奏。当前 0.3.0 已经证明这条链可以运行；下一步是把这套 Harness 从 Loop 扩展到 Song Blueprint，让多轮对话真正完成一首歌。
