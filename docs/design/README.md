# DAWdex 前端设计文档

> 当前实现：PR #17 / 2026-07-25（含巡棚箭头换台与全房间物件交互修复）
> 核心定义：把 openDAW 翻译成一部可以操作的动画片

前端是音乐状态翻译层，不拥有 Agent、MIDI 或 openDAW 业务逻辑。每一个有意义的视觉变化都必须来自结构化事件。

## 阅读顺序

1. [`../PRODUCT_VISION.md`](../PRODUCT_VISION.md)：完整产品与完整歌曲方向。
2. [`DESIGN_DIRECTION.md`](./DESIGN_DIRECTION.md)：当前视觉世界、交互原则和下一阶段编曲白板。
3. [`STAGE_UI.md`](./STAGE_UI.md)：PR #17 后的实际文件、五房间物件管线、工作台切换、演示模式和真实性闸门。
4. [`DESIGN_BRIEFS.md`](./DESIGN_BRIEFS.md)：早期方案比较，仅作历史背景。
5. [`../architecture.md`](../architecture.md)：UI 与 Agent/openDAW 的架构边界。

## 当前已经落地

- 暖白桌面壳 + Fig Mint 式象牙色一体机、楔形键盘甲板和物理干预键；
- 夜晚录音棚视频主场景；
- 屏幕内弹幕、采纳升格和证据抽屉；
- drums/bass/keys 三个活跃轨道角色；
- producer 控制室角色；
- 五角色 v2 素材已入库，guitarist 暂为扩展位；
- 首次事件触发角色入场；
- 2.6 秒电梯进棚过场；
- 六个录音棚频道与 `?room=` 深链（顶栏 CH、舞台两侧箭头与方向键切台，切台频闪）；
- 五房间冒险游戏物件管线：28 物件替身 + 轮廓命中 + 功能面板 + 演出态视频皮肤（`?panel=` 深链）；
- Fig Mint 主机壳与键盘甲板（deck-focus 运镜）；
- AI 乐迷附和弹幕氛围层（明确 AI 徽标，不伪造角色回执）；
- 可通过按钮、`Esc` 或 `?workbench=1` 收起外壳，露出真实 openDAW；
- 真实 Plan/Apply/Undo/Transport/可听状态桥接；
- `?mock=1` 或 `↻` 明确触发的 90 秒演示。

## 不变量

```text
每一个有意义的视觉状态都必须指出自己的事件来源。
没有 TrackAudibleChanged(audible=true)，就没有 performing 动画。
```

弹幕只在监视器屏幕内；输入与快速干预位于屏幕外控制台。弹幕是唯一常驻自然语言输入，但不是唯一操作方式。

## 下一阶段

完整歌曲不能只用循环进度条表达。控制室将增加世界内的编曲白板：

```text
Intro | Verse | Chorus | Verse 2 | Bridge | Chorus 2 | Outro
```

白板卡片由 `BlueprintChanged`、`SectionChanged` 和 `SectionLocked` 等真实事件驱动，用于显示当前 Section、能量、锁定和修改范围。

尚未落地：

- 编曲白板与 Song Blueprint；
- 物件与底层 DAW 的反向同步（底层改动→物件状态）；
- 真实音频峰值/电平；
- guitarist 的真实轨道角色；
- 角色演奏 Loop 视频；
- 专业 openDAW 视图与动画房间的完整双向定位。
