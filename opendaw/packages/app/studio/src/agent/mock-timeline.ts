/**
 * DAWdex 90 秒 Mock 事件序列 · v0.1
 *
 * 双重身份：
 *   1. UI 静态 MVP 的开发驱动源（不等 B/C 真实接口）
 *   2. 现场模型不可用时的本地回退脚本（PRD 风险表：2 秒内进入本地回退）
 *
 * 使用：按 at 排序后逐个 setTimeout 派发；UI 只认 UiEvent，不关心来源。
 * 时间轴对齐 PRD §八 的 90 秒 Demo 脚本。
 * 工程设定：128 BPM · A minor · 4 小节/循环（一个循环 = 7.5s）。
 */

import type {UiEvent} from './ui-contract'

/** 分布式 Omit：对联合类型逐成员去掉 seq */
type EventInput<T> = T extends UiEvent ? Omit<T, 'seq'> : never

let seq = 0
const ev = (e: EventInput<UiEvent>): UiEvent => ({...e, seq: ++seq} as UiEvent)

export const MOCK_TIMELINE_90S: UiEvent[] = [
  // ── 0–8s：开场，基础 Loop 已播放 ─────────────────────────────────────────
  ev({type: 'TransportChanged', at: 0, bpm: 128, key: 'A minor', barsPerLoop: 4, currentBar: 1, isPlaying: true}),
  ev({type: 'DanmakuReceived', at: 1000, danmakuId: 'd-sys-1', author: 'system', text: 'DAWDEX 演出即将开始，发送弹幕指挥乐队'}),

  // ── 8–18s：观众弹幕 ──────────────────────────────────────────────────────
  ev({type: 'DanmakuReceived', at: 9000, danmakuId: 'd-u-1', author: 'user', text: '再炸一点，像游戏最终 Boss 出场！'}),
  ev({type: 'DanmakuReceived', at: 11000, danmakuId: 'd-ai-1', author: 'ai-fan', text: '炸起来炸起来', echo: undefined}),
  ev({type: 'DanmakuReceived', at: 13500, danmakuId: 'd-u-2', author: 'user', text: '但是钢琴别乱改'}),

  // ── 18–30s：制作人采纳 + Music Brief ────────────────────────────────────
  ev({
    type: 'ProducerSelected', at: 19000, danmakuId: 'd-u-1', adopted: true,
    reason: '两条意见方向一致：提高紧张感，同时保住键盘。 consensus 高、可实现。',
    confidence: 0.86,
    brief: {bpm: 128, key: 'A minor', bars: 4, energyChange: 2, tensionChange: 2, preserve: ['keys']},
    echo: '制作人：这条采纳了——Boss 登场感，安排！钢琴不动。',
  }),
  ev({type: 'DanmakuReceived', at: 20500, danmakuId: 'd-ai-1b', author: 'ai-fan', text: '制作人选它了！'}),
  ev({type: 'DanmakuReceived', at: 22000, danmakuId: 'd-ai-1c', author: 'ai-fan', text: 'Boss 登场感 +1'}),

  // ── 30–45s：角色领任务 ──────────────────────────────────────────────────
  ev({
    type: 'RoleTaskAssigned', at: 31000, role: 'drums',
    summary: '加入四拍底鼓和十六分踩镲', audibleResult: '鼓会明显变密，推进感拉满',
    operationRef: 'plan-1/op-1', echo: '鼓手：收到，四踩底鼓走起！',
  }),
  ev({type: 'RoleStateChanged', at: 31000, role: 'drums', state: 'preparing'}),
  ev({
    type: 'RoleTaskAssigned', at: 34500, role: 'bass',
    summary: '八分音符根音推进', audibleResult: '低频会像心跳一样往前顶',
    operationRef: 'plan-1/op-2', echo: '贝斯手：根音推进，交给我。',
  }),
  ev({type: 'RoleStateChanged', at: 34500, role: 'bass', state: 'preparing'}),
  ev({
    type: 'RoleTaskAssigned', at: 38000, role: 'keys',
    summary: '保留和弦进行，只提高音区', audibleResult: '钢琴会更亮，但和声不变',
    operationRef: 'plan-1/op-3', echo: '键盘手：和弦不动，音区抬高，明白。',
  }),
  ev({type: 'RoleStateChanged', at: 38000, role: 'keys', state: 'preparing'}),

  // ── 45–68s：循环边界逐轨进入（循环边界：每 7.5s）────────────────────────
  ev({type: 'RoleStateChanged', at: 44000, role: 'drums', state: 'queued'}),
  ev({type: 'RoleStateChanged', at: 45000, role: 'drums', state: 'performing', trackRef: 'track-drums-1'}),
  ev({type: 'TrackAudibleChanged', at: 45000, role: 'drums', audible: true, enteredAtBar: 1}),
  ev({type: 'DanmakuReceived', at: 46500, danmakuId: 'd-ai-2a', author: 'ai-fan', text: '鼓来了鼓来了'}),

  ev({type: 'RoleStateChanged', at: 52000, role: 'bass', state: 'queued'}),
  ev({type: 'RoleStateChanged', at: 52500, role: 'bass', state: 'performing', trackRef: 'track-bass-1'}),
  ev({type: 'TrackAudibleChanged', at: 52500, role: 'bass', audible: true, enteredAtBar: 1}),
  ev({type: 'DanmakuReceived', at: 54000, danmakuId: 'd-ai-2', author: 'ai-fan', text: '贝斯进来了！心跳感有了'}),

  ev({type: 'RoleStateChanged', at: 59500, role: 'keys', state: 'queued'}),
  ev({type: 'RoleStateChanged', at: 60000, role: 'keys', state: 'performing', trackRef: 'track-keys-1'}),
  ev({type: 'TrackAudibleChanged', at: 60000, role: 'keys', audible: true, enteredAtBar: 1}),
  ev({type: 'OperationResult', at: 60500, operationRef: 'plan-1', kind: 'apply', ok: true, fallbackUsed: false, message: 'plan-1 三轨全部确认发声'}),
  ev({type: 'DanmakuReceived', at: 61500, danmakuId: 'd-ai-2b', author: 'ai-fan', text: '钢琴这层亮起来了'}),

  // ── 68–80s：用户再次干预 ────────────────────────────────────────────────
  ev({type: 'DanmakuReceived', at: 69000, danmakuId: 'd-u-3', author: 'user', text: '再加一点推进感'}),
  ev({
    type: 'ProducerSelected', at: 72000, danmakuId: 'd-u-3', adopted: true,
    reason: '延续当前方向，能量再 +1，不加新声部避免过满。',
    confidence: 0.78,
    brief: {bpm: 128, key: 'A minor', bars: 4, energyChange: 1, preserve: ['keys']},
    echo: '制作人：推进感再加一档，贝斯 variation 换密一点的。',
  }),
  ev({type: 'DanmakuReceived', at: 73500, danmakuId: 'd-ai-3a', author: 'ai-fan', text: '推进感 +1+1'}),
  ev({
    type: 'RoleTaskAssigned', at: 75000, role: 'bass',
    summary: '根音 pattern 换成十六分变体', audibleResult: '低频会更急促',
    operationRef: 'plan-2/op-1', echo: '贝斯手：换十六分，马上。',
  }),
  ev({type: 'RoleStateChanged', at: 75000, role: 'bass', state: 'preparing'}),
  ev({type: 'RoleStateChanged', at: 81000, role: 'bass', state: 'queued'}),

  // ── 80–90s：变体在循环边界生效，收尾 ────────────────────────────────────
  ev({type: 'RoleStateChanged', at: 82500, role: 'bass', state: 'performing', trackRef: 'track-bass-1'}),
  ev({type: 'OperationResult', at: 83000, operationRef: 'plan-2', kind: 'intervention', ok: true, fallbackUsed: false}),
  ev({type: 'DanmakuReceived', at: 84500, danmakuId: 'd-ai-3b', author: 'ai-fan', text: '这版可以循环一晚上'}),
  ev({type: 'DanmakuReceived', at: 86000, danmakuId: 'd-sys-2', author: 'system', text: '观众说人话，AI 乐队把它变成真正可编辑的音乐'}),
]

/** 派发器：按时间轴把事件推给 UI（Mock 与真实接口同一签名） */
export const playMockTimeline = (
  emit: (event: UiEvent) => void,
  opts: {speed?: number; onDone?: () => void} = {},
): (() => void) => {
  const speed = opts.speed ?? 1
  const timers = MOCK_TIMELINE_90S.map(e =>
    setTimeout(() => emit(e), e.at / speed),
  )
  const last = Math.max(...MOCK_TIMELINE_90S.map(e => e.at))
  timers.push(setTimeout(() => opts.onDone?.(), last / speed + 100))
  return () => timers.forEach(clearTimeout) // 返回取消函数
}
