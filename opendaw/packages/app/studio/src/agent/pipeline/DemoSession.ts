/**
 * Demo Session — orchestrates a complete demo run: parse prompt → prepare parts → schedule → apply.
 * This is the top-level entry point for成员 C's domain: turning Agent decisions into music.
 *
 * Supports:
 * - Full pipeline (real MIDI assets)
 * - Fallback (built-in patterns)
 * - Sequential track entry
 * - Resettable demo state
 */

import type {PreparedMusicPart} from "./MidiPipeline"
import {buildEnergyArrangement, getFallbackArrangement} from "./FallbackPlan"
import {scheduleSequential, ScheduledEntry, generateRoleTimeline, RoleStateTransition} from "./SequentialScheduler"

export type EnergyLevel = "low" | "mid" | "high"

export type DemoConfig = {
    readonly bpm: number
    readonly key: string
    readonly scale: string
    readonly barsPerLoop: number
    readonly repoRoot: string
}

const DEFAULT_CONFIG: DemoConfig = {
    bpm: 120,
    key: "C",
    scale: "minor",
    barsPerLoop: 4,
    repoRoot: ".."  // relative to Vite dev server (opendaw/ → repo root)
}

/**
 * Infer energy level from a Chinese/English prompt.
 */
export const inferEnergyFromPrompt = (prompt: string): EnergyLevel => {
    const text = prompt.toLowerCase()
    if (/炸|猛|boss|爆发|副歌|chorus|激烈|更强|猛一点|高潮|power|heavy|燃|嗨|high|摇滚|rock|metal|劲爆|暴力|冲|起飞|666|牛逼|nb|绝了|带劲|上头|疯狂|wild|crazy|bang|boom|drop|炸裂|爆|猛烈|怒|狂|嗨起来|冲冲冲|加大力度/.test(text)) return "high"
    if (/轻|柔|安静|温柔|简单|留白|稀疏|intro|soft|calm|gentle|慢|安|静|柔和|放松|舒缓|chill|lo-fi|lofi|氛围|ambient|梦|dream|空灵|淡|轻轻|优雅|宁静|peace|relax|睡|治愈|rain|雨|月|night/.test(text)) return "low"
    return "mid"
}

/**
 * Prepare a full arrangement from a single energy level.
 * Uses programmatic pattern generation (no MIDI file loading) for reliability and
 * maximum differentiation between energy levels.
 */
export const prepareFullArrangement = async (
    energy: EnergyLevel,
    _config: DemoConfig = DEFAULT_CONFIG
): Promise<ReadonlyArray<PreparedMusicPart>> => {
    return buildEnergyArrangement(energy)
}

/**
 * The complete demo flow: from a single prompt to a scheduled arrangement.
 *
 * Usage:
 *   const result = await runDemoSession("像最终 Boss 一样炸")
 *   // result.schedule: when each role enters
 *   // result.timeline: UI state transitions
 *   // result.parts: the actual note data
 */
export type DemoSessionResult = {
    readonly energy: EnergyLevel
    readonly parts: ReadonlyArray<PreparedMusicPart>
    readonly schedule: ReadonlyArray<ScheduledEntry>
    readonly timeline: ReadonlyArray<RoleStateTransition>
    readonly usedFallback: boolean
}

export const runDemoSession = async (
    prompt: string,
    config: DemoConfig = DEFAULT_CONFIG
): Promise<DemoSessionResult> => {
    const energy = inferEnergyFromPrompt(prompt)

    let parts: ReadonlyArray<PreparedMusicPart>
    let usedFallback = false

    try {
        parts = await prepareFullArrangement(energy, config)
    } catch {
        // Total failure — use full fallback arrangement
        parts = getFallbackArrangement()
        usedFallback = true
    }

    // Check if any part is a fallback
    if (parts.some(p => p.transformReceipt.sourceAssetId.startsWith("fallback"))) {
        usedFallback = true
    }

    const schedule = scheduleSequential(parts, config.barsPerLoop, config.bpm)
    const timeline = generateRoleTimeline(schedule)

    return {energy, parts, schedule, timeline, usedFallback}
}

/**
 * Reset helper: returns a clean "silent" state for the demo.
 * Can be used to reset the DAW project to a blank slate before a new demo run.
 */
export const createResetState = (): DemoSessionResult => ({
    energy: "mid",
    parts: [],
    schedule: [],
    timeline: [],
    usedFallback: false
})
