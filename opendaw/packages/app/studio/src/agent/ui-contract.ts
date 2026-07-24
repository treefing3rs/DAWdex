/**
 * DAWdex UI 三方契约 · v0.1（冻结候选）
 *
 * 三方关系：
 *   A（UI/舞台层）  —— 消费本文件全部事件；只通过两个上行命令发出用户意图
 *   B（Agent 层）   —— 产出 DanmakuReceived / ProducerSelected / RoleTaskAssigned / RoleStateChanged / OperationResult
 *   C（openDAW 层） —— 产出 TransportChanged / TrackAudibleChanged / OperationResult(undo)
 *
 * 规则：
 *   - UI 不解析模型自由文本、不保存 API Key、不决定 MIDI、不直接改 openDAW 工程
 *   - 一切 Agent 展示文案（回执、附和弹幕）从结构化事件派生，与驱动 DAW 的指令同源
 *   - 本文件的冻结对象是【类型】，不是事件名
 */

// ---------------------------------------------------------------------------
// 基础枚举
// ---------------------------------------------------------------------------

/** MVP 启用 drums/bass/keys；lead/producer 为保留扩展位，实现方可先不出轨 */
export type RoleId = 'drums' | 'bass' | 'keys' | 'lead' | 'producer'

/**
 * 角色状态机（单向推进，failed 可回 waiting）：
 *   waiting    待机，未领取任务
 *   preparing  已领任务，素材检索/编译中
 *   queued     编译完成，等待下一循环边界（Codex 补充，必要状态）
 *   performing 轨道发声中（必须与 openDAW 真实发声严格一致）
 *   failed     校验/执行失败，UI 显示雪花噪点 + 系统弹幕
 */
export type RoleState = 'waiting' | 'preparing' | 'queued' | 'performing' | 'failed'

/** 弹幕作者身份（PRD：AI 乐迷必须标记，不得冒充真人） */
export type DanmakuAuthor = 'user' | 'ai-fan' | 'system'

/** FR-09 用户干预操作 */
export type InterventionKind =
  | 'keep'             // 保留
  | 'stronger'         // 更有力量
  | 'lighter'          // 更轻松
  | 'swap-instrument'  // 换一种乐器
  | 'regenerate'       // 重新生成
  | 'undo'             // 撤销上一次 DAWdex 修改

// ---------------------------------------------------------------------------
// 下行事件（B/C → UI）
// ---------------------------------------------------------------------------

/** 所有事件的公共字段 */
export interface UiEventBase {
  /** 单调递增事件序号，用于乱序纠正与回放 */
  seq: number
  /** 相对会话开始的毫秒时间戳 */
  at: number
  /**
   * 可选：Agent 附和弹幕文案。
   * B 产出事件时顺手给出"这句话"，UI 直接以 Agent 弹幕形式发出；
   * 必须是展示级文案，真实决策以结构化字段为准。
   */
  echo?: string
}

/** 1. 弹幕进入（含真人、AI 乐迷、系统） */
export interface DanmakuReceived extends UiEventBase {
  type: 'DanmakuReceived'
  danmakuId: string
  text: string
  author: DanmakuAuthor
  /** 纠错后的文本（若有转写纠错），UI 默认展示原文，hover 可见纠错 */
  correctedText?: string
}

/** 全局音乐约束摘要（MusicBrief 的展示级投影，完整 JSON 由证据抽屉按需拉取） */
export interface MusicBriefSummary {
  bpm: number
  key: string
  bars: number
  energyChange?: number   // -2..+2
  tensionChange?: number  // -2..+2
  preserve?: RoleId[]     // 本次不得改动的角色
}

/** 2. 制作人裁决：采纳或拒绝一条弹幕 */
export interface ProducerSelected extends UiEventBase {
  type: 'ProducerSelected'
  danmakuId: string
  adopted: boolean
  /** 一句话理由（通俗语言，专业术语由 UI 附带解释） */
  reason: string
  confidence: number      // 0..1
  brief?: MusicBriefSummary  // adopted=true 时必带
}

/** 3. 角色任务下发（工作回执的数据源） */
export interface RoleTaskAssigned extends UiEventBase {
  type: 'RoleTaskAssigned'
  role: RoleId
  /** 将做什么："加入四拍底鼓和十六分踩镲" */
  summary: string
  /** 听起来会怎样："鼓会变得更密、更有推进感" */
  audibleResult: string
  /** 结构化指令引用（证据抽屉展开用），如 plan id + operation index */
  operationRef: string
}

/** 4. 角色状态变更 */
export interface RoleStateChanged extends UiEventBase {
  type: 'RoleStateChanged'
  role: RoleId
  state: RoleState
  /** state=performing 时必带：openDAW 轨道标识 */
  trackRef?: string
  /** state=failed 时必带：通俗失败原因 */
  reason?: string
}

/** 5. 权威时钟变更（BPM/调性/循环长度只有一个权威来源） */
export interface TransportChanged extends UiEventBase {
  type: 'TransportChanged'
  bpm: number
  key: string
  barsPerLoop: number
  currentBar: number
  isPlaying: boolean
}

/** 6. 轨道发声状态变更（角色动画的唯一依据，不得用其他信号冒充） */
export interface TrackAudibleChanged extends UiEventBase {
  type: 'TrackAudibleChanged'
  role: RoleId
  audible: boolean
  /** audible=true 时必带：从第几小节开始进入 */
  enteredAtBar?: number
}

/** 7. 操作结果（执行 / 干预 / 撤销 / 回退） */
export interface OperationResult extends UiEventBase {
  type: 'OperationResult'
  operationRef: string
  kind: 'apply' | 'intervention' | 'undo'
  ok: boolean
  /** true = 触发了本地安全版本回退（UI 显示系统弹幕 + 雪花提示） */
  fallbackUsed: boolean
  message?: string
}

export type UiEvent =
  | DanmakuReceived
  | ProducerSelected
  | RoleTaskAssigned
  | RoleStateChanged
  | TransportChanged
  | TrackAudibleChanged
  | OperationResult

// ---------------------------------------------------------------------------
// 上行命令（UI → B/C）
// ---------------------------------------------------------------------------

/** 用户发送弹幕（唯一输入方式） */
export interface DanmakuSubmit {
  type: 'DanmakuSubmit'
  text: string
}

/** FR-09 干预操作 */
export interface UserIntervention {
  type: 'UserIntervention'
  kind: InterventionKind
  /** 针对单一角色的操作必带；undo 不带 */
  role?: RoleId
}

export type UiCommand = DanmakuSubmit | UserIntervention

// ---------------------------------------------------------------------------
// 传输形态建议：B/C 各自以 (event: UiEvent) => void 回调推给 UI；
// UI 以 (cmd: UiCommand) => void 提交。90 秒 Mock 与真实接口共用同一签名。
// ---------------------------------------------------------------------------