import {afterEach, describe, expect, it, vi} from "vitest"
import {AgentClient} from "./AgentClient"
import type {AgentProgress, DawProjectSnapshot} from "./AgentProtocol"

const snapshot: DawProjectSnapshot = {
    hasProject: false,
    bpm: 120,
    tracks: []
}

const plan = {
    id: "plan-1",
    prompt: "给我一段浪漫的音乐",
    title: "Late-night neo-soul",
    summary: "A warm, spacious eight-bar arrangement.",
    rationale: ["Rhodes and a laid-back pocket support the requested romantic mood."],
    brief: {
        intent: "create",
        style: "neo-soul",
        styleAlternatives: ["contemporary R&B", "jazz ballad"],
        moods: ["romantic", "warm"],
        decisionSummary: "浪漫夜晚更适合温暖而有留白的 neo-soul。",
        instrumentation: ["laid-back drums", "conversational bass", "Rhodes keys"],
        bpm: 78,
        key: "D minor",
        bars: 8,
        energy: 0.42,
        swing: 0.38,
        preserveTrackIds: [],
        targetRoles: ["drums", "bass", "keys"]
    },
    actions: [
        {type: "set-tempo", bpm: 78}
    ],
    source: "codex"
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("AgentClient planning stream", () => {
    it("surfaces factual creative stages while waiting for the final plan", async () => {
        const body = [
            {
                type: "progress",
                stage: "understanding",
                message: "正在理解情绪、场景和音乐目标…"
            },
            {
                type: "progress",
                stage: "direction",
                message: "音乐方向：neo-soul。浪漫夜晚适合温暖而有留白的律动。"
            },
            {type: "plan", plan}
        ].map(event => JSON.stringify(event)).join("\n") + "\n"
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {status: 200})))
        const updates: Array<AgentProgress> = []

        const result = await new AgentClient("http://localhost:8787/v1/plan")
            .createPlan("给我一段浪漫的音乐", snapshot, update => updates.push(update))

        expect(updates.map(update => update.stage)).toEqual(["understanding", "direction"])
        expect(updates[1].message).toContain("neo-soul")
        expect(result.brief.style).toBe("neo-soul")
    })

    it("reports a model failure instead of silently returning a fixed local template", async () => {
        const body = `${JSON.stringify({
            type: "error",
            error: "Creative model unavailable"
        })}\n`
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {status: 200})))

        await expect(new AgentClient("http://localhost:8787/v1/plan")
            .createPlan("给我一段浪漫的音乐", snapshot))
            .rejects.toThrow("Creative model unavailable")
    })
})
