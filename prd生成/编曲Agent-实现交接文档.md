# 编曲 Agent 项目实现交接文档

> 更新时间：2026-07-23
> 文档用途：交给新的 Codex 对话，用于继续撰写正式 PRD。
> 当前状态：已经在本机跑通 **Codex → MCP → Ableton Live 12**，并由 Agent 实际创建、加载音色、编写和扩展了一段 32 小节的多轨 MIDI 编曲。

## 1. 一句话结论

黑客松 MVP 不应该从零开发一个“类似 Codex 的通用 Agent”，也不应该先做完整 DAW。

最快、最可信的实现是：

1. 使用 Codex、OpenAI Agent SDK 或另一个成熟 Agent 作为推理与工具调用层；
2. 使用 Ableton MCP 把 Agent 的决策转换成 Ableton Live 操作；
3. 在两者之间加入编曲专属的意图结构、规划逻辑、安全确认和版本管理；
4. 用一个“时间线评论 / 修改意见”界面包装成真正的音乐产品。

项目的核心创新不是“AI 可以点击 DAW”，而是：

> 把“副歌不够炸”“这里太满”“高级一点”“让吉他回应人声”等人类反馈，翻译成段落、能量、密度、和声、配器和 MIDI 修改，并交付为可继续编辑的 DAW 工程。

暂定产品概念名为 **Comment Studio**：

> 评论不再只是作品完成后的反馈，而成为编曲本身的入口。

## 2. 已形成的产品判断

### 2.1 推荐的核心产品形态

产品不是另一个 Prompt-to-Song 音乐生成器，而是一个“AI 虚拟编曲助理 / 虚拟录音棚”。

用户提供：

- 当前 Ableton 工程；
- 时间范围或段落，例如第 9–16 小节、副歌、过门；
- 自然语言修改意见；
- 可选的参考要求，例如“能量提高，但别堆满”“保留主旋律”。

系统输出：

- 对评论意图的解释；
- 即将执行的编曲计划；
- 对具体轨道、片段、音符、音色和段落的修改；
- Before / After 对比；
- 可继续编辑的 Ableton 工程，而不是不可拆解的成品音频。

### 2.2 三种潜在模式

1. **Solo Producer Mode**
   - 音乐人给自己的工程留批注；
   - Agent 负责执行重复、机械或需要大量试错的修改。

2. **Client Revision Mode**
   - 客户只会说“更高级”“不够燃”“别那么吵”；
   - Agent 把模糊反馈翻译成制作人与编曲人能够执行的任务。
   - 这是最真实、也最适合作为第一版商业叙事的场景。

3. **Crowd Arrangement Mode**
   - 聚合评论、弹幕和粉丝反馈；
   - Agent 总结趋势并生成 revised version；
   - 更适合后续连接 B 站、创作者社区，而不是第一版 MVP。

### 2.3 建议的 MVP 主场景

优先做 **Client Revision Mode + Solo Producer Mode**，不要一开始做多人协作和评论平台。

建议演示任务：

> 在一个已有 16 或 32 小节的 Ableton 多轨 MIDI Demo 上，用户框选副歌并评论：“副歌不够炸，但不要太满，保留铃音主题。”
> Agent 先展示修改计划，再自动改变鼓、贝斯、和弦转位和旋律密度，最后播放 Before / After。

这比“从零生成一首歌”更能展示产品差异。

## 3. DAW 选择结论

### 3.1 黑客松主 DAW：Ableton Live 12

当前应继续使用 Ableton Live 12，原因是：

- 本机已经安装 Ableton Live 12.1.5；
- Ableton 有可用的 Remote Script / Live API 路径；
- 已经有开源 Ableton MCP，可以直接给 Codex 提供工具；
- 已实际验证轨道、音色、MIDI、Arrangement 和播放控制；
- 用户虽更熟悉 FL Studio，但当前技术风险比学习少量 Ableton 操作更重要。

### 3.2 暂不选择 FL Studio

FL Studio 是用户最熟悉的 DAW，但本机版本较老，且当前没有像 Ableton MCP 这样已经验证的、覆盖音色浏览和 Arrangement 编排的控制层。

FL 可以作为未来适配器，但不应该进入本次黑客松关键路径。

### 3.3 暂不切换 Reaper

Reaper 的脚本和扩展能力很强，从长期工程角度可能更开放，但用户没有使用经验。黑客松期间同时学习 Reaper、搭 Agent、做 UI 和准备演示，风险过高。

除非 Ableton 出现无法解决的 API 阻塞，否则不要临时迁移。

### 3.4 许可注意事项

本地技术验证使用的是当前机器上的 Ableton Live 12.1.5。正式公开演示、录屏、参赛提交或产品分发前，应换成官方授权版本或官方试用版，避免许可和稳定性风险。

## 4. 已跑通的技术架构

```text
用户评论 / 编曲请求
        ↓
Agent（当前由 Codex 承担）
  - 理解意图
  - 读取工程状态
  - 制定编曲计划
  - 生成结构化 MIDI 数据
        ↓ MCP Tool Calls
ableton-mcp Python Server
        ↓ 本机 TCP JSON
127.0.0.1:8765
        ↓
AbletonMCP Remote Script
        ↓ Live API
Ableton Live 12 工程
```

当前 Agent 并不是一个独立部署的产品后端，Codex 同时承担了：

- 对话；
- 任务规划；
- 音乐决策；
- MIDI 数据生成；
- MCP 工具调用；
- 结果核验。

正式 MVP 应把这些能力拆成可控的产品模块，但黑客松期间可以继续复用现成 Agent runtime。

## 5. 本机实现状态

### 5.1 工作区

```text
D:\myCS\_Projects\__AdventureX\music agent
```

关键文件：

```text
.codex\config.toml
third_party\ableton-mcp-upstream\
third_party\ableton-mcp-upstream\MCP_Server\server.py
third_party\ableton-mcp-upstream\AbletonMCP_Remote_Script\__init__.py
prd生成\赛道选择.md
```

### 5.2 MCP Server

已安装：

- `ableton-mcp 1.2.0`
- 可执行文件：
  `C:\Users\27751\.local\bin\ableton-mcp.exe`
- 安装时使用的 uv 版本为 `0.11.30`。

Codex 项目配置位于：

```text
D:\myCS\_Projects\__AdventureX\music agent\.codex\config.toml
```

核心配置：

```toml
[mcp_servers.ableton]
command = 'C:\Users\27751\.local\bin\ableton-mcp.exe'
startup_timeout_sec = 60
tool_timeout_sec = 120
enabled = true
required = false

[mcp_servers.ableton.env]
ABLETON_HOST = "127.0.0.1"
ABLETON_PORT = "8765"
ABLETON_MCP_DISABLE_TELEMETRY = "true"
```

配置中还为已经验证的 Ableton 工具设置了允许调用的 approval mode。

### 5.3 Ableton Remote Script

Remote Script 已同时复制到两个位置：

```text
C:\Users\27751\AppData\Roaming\Ableton\Live 12.1.5\Preferences\User Remote Scripts\AbletonMCP\__init__.py

D:\Musics\Ableton Live 12 Suite\Resources\MIDI Remote Scripts\AbletonMCP\__init__.py
```

工作区源文件为：

```text
third_party\ableton-mcp-upstream\AbletonMCP_Remote_Script\__init__.py
```

三个文件当前 SHA-256 相同：

```text
F6534DCB2E3315DDA7A9B56AFC60B4DC1391CAA6110157E3B7F4480EBE432AE1
```

Ableton 设置：

- Preferences → Link, Tempo & MIDI；
- Control Surface 选择 `AbletonMCP`；
- Input 选择 `None`；
- Output 选择 `None`。

修改脚本后必须重启 Ableton；修改 `.codex/config.toml` 后应重启或重新打开 Codex 任务。

### 5.4 端口故障与修复

上游脚本默认端口落在本机 Windows 排除范围内，导致绑定失败：

```text
WinError 10013
```

本机存在的 TCP 排除范围包括：

```text
9875–9974
```

因此原端口 `9877` 不可用。现已统一修改为：

```python
DEFAULT_PORT = 8765
HOST = "127.0.0.1"
```

选择 `127.0.0.1` 而不是监听所有网卡，是因为当前只需要本机 Agent 与 Ableton 通信，也更安全。

Remote Script 和 MCP Server 的端口必须一致。若以后修改端口，需要同时更新：

- Remote Script 的 `DEFAULT_PORT`；
- `.codex/config.toml` 的 `ABLETON_PORT`。

### 5.5 启动顺序

建议每次演示按以下顺序启动：

1. 启动 Ableton Live；
2. 确认 Control Surface 中存在并选中 `AbletonMCP`；
3. 打开工程；
4. 从本工作区打开 Codex；
5. 调用 `get_session_info` 做连接自检；
6. 再开始写轨道和片段。

不要同时运行多个 `ableton-mcp` Server 实例，否则可能争抢同一个 Remote Script 连接。

## 6. 已验证的 Ableton MCP 能力

### 6.1 读取工程

已验证：

- `get_session_info`
- `get_track_info`
- `get_arrangement_clips`
- `get_browser_tree`
- `get_browser_items_at_path`

能够读取：

- BPM、拍号、播放状态和轨道数量；
- 轨道名称、类型、音量、Clip Slot、设备；
- Arrangement 中已有的片段；
- Ableton Browser 中的乐器、鼓组和预设。

### 6.2 创建与编曲

已验证：

- `create_midi_track`
- `set_track_name`
- `create_clip`
- `add_notes_to_clip`
- `set_clip_name`
- `duplicate_to_arrangement`

标准工作流是：

1. 在 Session View 的空 Slot 创建 MIDI Clip；
2. 生成包含 `pitch`、`start_time`、`duration`、`velocity`、`mute` 的音符数组；
3. 把音符写入 Clip；
4. 为 Clip 命名；
5. 把 Session Clip 复制到 Arrangement 指定 beat。

### 6.3 加载音色

之前关于“加载音色 MCP 有没有”的结论是：**有，而且已经成功验证。**

相关工具：

- `get_browser_tree`
- `get_browser_items_at_path`
- `load_instrument_or_effect`
- `load_drum_kit`

加载音色不能只靠模糊名字，可靠流程是：

1. 浏览 Ableton Browser；
2. 找到预设对应的 URI；
3. 把 URI 传给加载工具；
4. 用 `get_track_info` 验证设备是否真的出现在轨道上。

本机已验证的原生预设：

| 用途 | 预设 | URI |
|---|---|---|
| 鼓 | 808 Core Kit | `query:Drums#FileId_31718` |
| 贝斯 | Drift - Deep Bass | `query:Synths#Drift:Bass:FileId_33465` |
| 和弦 Pad | Drift - Mello Patience | `query:Synths#Drift:Pad:FileId_31262` |
| 铃音主奏 | Drift - Ethereal Brushed Bells | `query:Synths#Drift:Mallets:FileId_31337` |

### 6.4 播放控制

已验证：

- `set_tempo`
- `switch_to_arrangement_view`
- `set_arrangement_time`
- `start_playback`
- `stop_playback`
- `fire_clip`
- `stop_clip`

## 7. 已完成的实际音乐 Demo

Agent 已在 Ableton 中创建四条新 MIDI 轨：

| Track Index | 轨道名 | 设备 |
|---:|---|---|
| 5 | Dream Drums | 808 Core Kit |
| 6 | Warm Bass | Drift - Deep Bass |
| 7 | Mello Chords | Drift - Mello Patience |
| 8 | Soft Bells | Drift - Ethereal Brushed Bells |

音乐参数：

- 104 BPM；
- 4/4；
- D 小调；
- 32 小节，即 128 beats；
- 四条轨道均已放入 Arrangement。

结构：

| 小节 | Beat | 段落 |
|---|---:|---|
| 1–8 | 0–32 | 原始主题 |
| 9–16 | 32–64 | A2 推进段 |
| 17–24 | 64–96 | B 对比与 Build |
| 25–32 | 96–128 | Finale 回归高潮 |

初始 8 小节：

- 鼓：116 个 MIDI 音符；
- 贝斯：28 个；
- 和弦：19 个；
- 铃音主题：25 个；
- 和弦进行：`Dm9 → Bbmaj7 → Fmaj9 → C9`。

A2 推进段：

- 更密的鼓组与 Fill；
- 加入经过音和八度运动的贝斯；
- 更亮的和弦转位；
- 主旋律的回答句。

B 对比段：

- 前半部分使用 half-time 感；
- 后半逐步增加 16 分音符和 Fill；
- 和声走向 `Bb → C → Dm → A7(b9)`；
- A7 为最后回归 D 小调制造张力。

Finale：

- 完整鼓组、Ride 和结尾 Fill；
- 高八度重现主题；
- 贝斯和和弦回到推进段材料；
- 最后落回 D。

这证明当前链路不仅能做单一命令，还能完成：

> 读取上下文 → 选择音色 → 生成多轨 MIDI → 设计段落 → 放入 Arrangement → 播放 → 再根据指令扩写。

## 8. 当前 MCP 的重要限制与踩坑

### 8.1 不要并行发送大量 Ableton 命令

当前实现底层是单一 TCP Socket 和简单 JSON 请求/响应。并行调用可能造成：

- 响应顺序错位；
- 某条命令拿到上一条命令的返回值；
- 长时间等待；
- 看似失败但实际已经在 Ableton 执行。

因此对 Ableton 的写操作应顺序执行，并拆成阶段：

1. 创建轨道；
2. 加载设备；
3. 创建 Clip；
4. 写入音符；
5. 放入 Arrangement；
6. 单独核验。

### 8.2 不要只相信写操作的文字返回

本次遇到过：

- 加载设备的返回文字没有列出设备，但 `get_track_info` 证明设备已经加载；
- `set_arrangement_time` 返回了旧位置，但随后 `get_session_info` 证明播放头实际已经移动；
- 停止、移动播放头和播放连续调用时，返回值可能出现滞后。

正确做法是把“执行”和“核验”分开：

- 写完设备后读取 Track；
- 放完 Clip 后读取 Arrangement；
- 移动播放头后读取 Session；
- 不用一条命令的字符串决定最终成功与否。

### 8.3 复杂编曲必须分批

一次性写入很多轨道和数百个音符可能触发超时。应按段落或轨道分批写入，并把 `tool_timeout_sec` 保持在较宽松的值。

### 8.4 Agent 目前并没有真正“听见”音频

当前 Agent 主要依据：

- 用户语言；
- 和声与 MIDI 规则；
- Ableton 工程结构；
- 预设名称；
- 已写入的音符数据。

它没有完成真实的音频监听、响度分析、频谱分析或审美评价。PRD 中不能把当前能力描述成“像人一样听完歌曲再修改”。

如果未来需要听觉闭环，要增加：

- 工程 Bounce / Stem 导出；
- 音频特征分析；
- 可处理音频输入的模型；
- 修改前后评价器；
- 仍然需要人工最终审美确认。

### 8.5 当前缺少或不够可靠的能力

上游 MCP 暂时没有形成完整产品所需的以下能力：

- 删除或替换指定 MIDI 音符；
- 精确编辑已有音符，而不仅是追加；
- 删除轨道、Clip 或 Arrangement 片段；
- 通用 Undo / Rollback；
- 保存为新工程版本；
- 自动导出音频或 Stem；
- 可靠设置 Arrangement Loop；
- 完整的音量、Pan、Send、Mute、Solo、Automation 控制；
- 深入编辑任意设备参数和第三方插件；
- 对现有音频内容进行语义理解。

这些缺口决定了产品必须有“先计划、再执行”和“另存版本”的安全设计。

## 9. 建议的 MVP 技术拆分

对于不了解 Agent 技术的开发者，可以把 Agent 简化理解为：

> 一个会循环执行“观察工程 → 思考计划 → 调用工具 → 检查结果”的大语言模型。

第一版不需要多 Agent。建议只有一个 Orchestrator，加几个确定性模块。

### 9.1 Comment Translator

把自然语言评论转换成结构化意图，例如：

```json
{
  "target": {
    "section": "chorus",
    "start_bar": 9,
    "end_bar": 16
  },
  "intent": {
    "energy_delta": 0.3,
    "density_delta": 0.1,
    "preserve": ["lead_theme"],
    "avoid": ["too_many_layers"]
  }
}
```

### 9.2 Music Director / Planner

把抽象意图拆成具体计划：

```json
{
  "actions": [
    {"track": "drums", "operation": "open_hats_and_fill"},
    {"track": "bass", "operation": "increase_motion"},
    {"track": "chords", "operation": "widen_voicing"},
    {"track": "bells", "operation": "preserve_theme"}
  ]
}
```

它还要解决评论冲突，例如：

- “更炸”不等于所有轨道同时加音符；
- “能量提高但别太满”可以由鼓和贝斯推进，同时让其他轨道留白。

### 9.3 MIDI Compiler

把音乐计划转换成确定的音符和片段操作：

- 音高；
- 开始时间；
- 时值；
- 力度；
- 轨道和 Clip；
- 段落复制与变化。

这部分应尽量使用可测试的数据结构，不要让模型直接拼接一长串不可验证的工具调用。

### 9.4 DAW Adapter

对上层暴露稳定、与 DAW 无关的动作，例如：

```text
create_track(role, sound)
create_section(name, start_bar, length)
write_notes(track, section, notes)
load_sound(track, sound_query)
verify_track(track)
preview(start_bar, end_bar)
```

Adapter 内部再映射到 Ableton MCP。

这样未来才可能增加 FL Studio Adapter 或 Reaper Adapter，而不需要重写整个 Agent。

### 9.5 Safety / Versioning

最低要求：

- 修改前展示计划；
- 用户点击 Apply 后才执行；
- 不覆盖原片段，优先复制到新版本；
- 每次执行保留 Action Log；
- 出错时告诉用户“哪些已经成功、哪些没有执行”；
- Demo 工程必须预先保存备份。

## 10. PRD 建议锁定的 MVP 范围

### 必须做

- 一个预制 Ableton 多轨 MIDI Demo；
- 时间线或段落选择；
- 输入一条自然语言修改意见；
- 展示 Agent 对意图的理解；
- 展示具体编曲计划；
- 一键 Apply 到 Ableton；
- 播放 Before / After；
- 显示执行日志和修改了哪些轨道。

### 可以做

- 三到五个高质量预设评论；
- “更炸、留白、变高级、做 Build、让乐器互相回应”等意图模板；
- 多版本候选方案；
- 导出结构化 JSON / MIDI Blueprint；
- 录制一段完整 Demo 视频，避免现场连接意外。

### 本次黑客松不要做

- 从零训练音乐模型；
- 完整 DAW；
- 同时适配 Ableton、FL Studio、Reaper；
- 第三方 VST 的通用控制；
- 完整音频生成；
- 真实多人协作后端；
- B 站评论 API；
- 宣称能够完全替代编曲人。

## 11. PRD 中必须回答的开放问题

新对话撰写 PRD 时，应优先明确：

1. 第一用户到底是谁：独立制作人、接单编曲人，还是内容创作者？
2. 第一场景是“从零创作”还是“修改现有 Demo”？建议选择后者。
3. 用户在什么时刻最痛：收到客户反馈、自己卡在修改阶段，还是做不同版本？
4. Agent 执行前是否必须确认？哪些只读动作可自动完成？
5. Before / After 如何呈现？
6. 如何定义成功：节省修改时间、减少沟通轮次，还是增加可控性？
7. Demo 是否只支持官方 Ableton 原生设备？
8. 工程版本和 Undo 如何保证？
9. 产品 UI 是独立时间线界面、Ableton 旁边的聊天面板，还是网页控制台？
10. 黑客松评委在 90 秒内看到的唯一“魔法时刻”是什么？

推荐的魔法时刻：

> 用户在第 9–16 小节留下一句“副歌更炸，但别太满，保留铃音”，Agent 显示它的音乐理解，随后 Ableton 中鼓、贝斯和和弦真的发生可见、可听、可继续编辑的变化。

## 12. 下一阶段开发优先级

### P0：保证 Demo 稳定

- 固定 Ableton 版本和官方许可环境；
- 固定四条轨道和原生预设；
- 固定端口 8765；
- 为连接、音色加载、Clip 写入增加自检；
- 所有 MCP 写操作串行执行；
- 准备一键重置的 Demo 工程；
- 同时录制备用演示视频。

### P1：产品化 Agent

- 定义 Comment Intent Schema；
- 定义 Music Action Schema；
- 将 LLM 规划和 MIDI 编译分离；
- 做 Apply 前的计划预览；
- 做 Action Log 和失败恢复；
- 把 Codex 中已经验证的工具流程封装到应用后端。

### P2：补齐 MCP

- 删除和替换音符；
- 片段复制、删除和版本化；
- 轨道音量、Pan、Mute、Automation；
- 工程另存；
- Loop 与范围播放；
- 音频导出；
- 更可靠的请求 ID、串行队列和响应匹配。

### P3：后续扩展

- 音频监听闭环；
- Reaper / FL Studio Adapter；
- 客户评论链接和多人协作；
- Crowd Arrangement；
- 风格知识库和用户个人偏好。

## 13. 给新 Codex 对话的建议开场

可以直接在新对话中发送：

```text
请先完整阅读工作区中的：
D:\myCS\_Projects\__AdventureX\music agent\prd生成\编曲Agent-实现交接文档.md

然后和我一起撰写正式 PRD。

已经确定的技术路线是：现成 Agent / LLM 负责理解和规划，Ableton MCP 负责执行，MVP 聚焦“自然语言修改意见 → 可解释的编曲计划 → Ableton 中可编辑的多轨 MIDI 修改 → Before/After”。

请不要一开始重新讨论 FL Studio、Reaper 或从零开发通用 Agent，除非 PRD 中出现了足以推翻当前路线的新约束。

先帮我锁定目标用户、核心场景、MVP 边界和 90 秒黑客松 Demo，再形成完整 PRD。
```

## 14. 最终交接结论

本项目的技术可行性已经得到最低限度验证：

- Codex 可以连接 Ableton；
- MCP 可以读取工程；
- MCP 可以浏览并加载原生音色；
- Agent 可以生成和写入多轨 MIDI；
- Agent 可以创建 Arrangement；
- Agent 可以播放、核验并继续扩写。

接下来最大的风险已经不是“能不能控制 Ableton”，而是：

1. 产品是否聚焦在足够真实、足够尖锐的修改场景；
2. Agent 是否能把模糊反馈稳定地转成可解释的音乐决策；
3. 修改是否可撤销、可比较、可继续编辑；
4. 演示是否足够稳定，并在极短时间内让评委理解价值。

正式 PRD 应围绕这些问题展开，而不是继续把主要精力放在基础连接上。
