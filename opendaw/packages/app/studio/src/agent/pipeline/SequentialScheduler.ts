/**
 * Sequential Scheduler — makes roles join one at a time with configurable delays.
 * This is the "逐轨加入" experience: drums first, then bass, then keys.
 */

import type {MusicRole} from "./QualityGate"
import type {PreparedMusicPart} from "./MidiPipeline"

export type ScheduledEntry = {
    readonly part: PreparedMusicPart
    readonly startBar: number       // which bar this role enters (1-indexed)
    readonly delayMs: number        // UI delay before showing this role as "performing"
}

/**
 * Default role entry order for the Demo.
 * Drums anchor the rhythm, bass follows, keys fill harmony.
 */
const DEFAULT_ORDER: ReadonlyArray<MusicRole> = ["drums", "bass", "keys"]

/**
 * Schedule parts so each role enters staggered by a fixed bar interval.
 *
 * With 2-bar entry spacing at 120 BPM:
 *   - Each entry gap = 4 seconds
 *   - Drums enter at bar 1 (0s)
 *   - Bass enters at bar 3 (4s)
 *   - Keys enter at bar 5 (8s)
 *
 * @param parts - Prepared music parts (may be in any order)
 * @param barsPerLoop - How many bars per loop cycle (default 4)
 * @param bpm - Beats per minute (for calculating UI delay in ms)
 * @param startBarOffset - First bar to start from (1-indexed, default 1)
 * @param entryIntervalBars - How many bars between each role entry (default 2)
 */
export const scheduleSequential = (
    parts: ReadonlyArray<PreparedMusicPart>,
    _barsPerLoop: number = 4,
    bpm: number = 120,
    startBarOffset: number = 1,
    entryIntervalBars: number = 2
): ReadonlyArray<ScheduledEntry> => {
    const msPerBeat = 60000 / bpm
    const msPerBar = msPerBeat * 4 // 4/4 time
    const entryIntervalMs = msPerBar * entryIntervalBars

    const scheduled: Array<ScheduledEntry> = []

    for (let i = 0; i < DEFAULT_ORDER.length; i++) {
        const role = DEFAULT_ORDER[i]
        const part = parts.find(p => p.role === role)
        if (part === undefined) continue

        const startBar = startBarOffset + i * entryIntervalBars
        const delayMs = i * entryIntervalMs

        scheduled.push({part, startBar, delayMs})
    }

    return scheduled
}

/**
 * For the UI layer: returns role state transitions over time.
 * A → can fire AgentUiEvent to tell the frontend when each role starts.
 */
export type RoleStateTransition = {
    readonly role: MusicRole
    readonly state: "waiting" | "planning" | "preparing" | "queued" | "performing"
    readonly atMs: number
}

/**
 * Generate a timeline of role state transitions for the UI.
 */
export const generateRoleTimeline = (
    schedule: ReadonlyArray<ScheduledEntry>,
    prepareDurationMs: number = 2000
): ReadonlyArray<RoleStateTransition> => {
    const transitions: Array<RoleStateTransition> = []

    for (const entry of schedule) {
        const role = entry.part.role
        // Start as "waiting" at time 0
        transitions.push({role, state: "waiting", atMs: 0})
        // Move to "preparing" a bit before entry
        const prepStart = Math.max(0, entry.delayMs - prepareDurationMs)
        transitions.push({role, state: "preparing", atMs: prepStart})
        // Move to "queued" right before entry
        transitions.push({role, state: "queued", atMs: Math.max(0, entry.delayMs - 500)})
        // Move to "performing" at entry time
        transitions.push({role, state: "performing", atMs: entry.delayMs})
    }

    return transitions.sort((a, b) => a.atMs - b.atMs)
}
