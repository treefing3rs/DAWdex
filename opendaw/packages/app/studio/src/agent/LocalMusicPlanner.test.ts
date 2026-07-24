import {describe, expect, it} from "vitest"
import {DawProjectSnapshot} from "./AgentProtocol"
import {LocalMusicPlanner} from "./LocalMusicPlanner"

const snapshot: DawProjectSnapshot = {
    hasProject: true,
    bpm: 120,
    tracks: [{name: "Lead", trackCount: 1, regionCount: 1}]
}

describe("LocalMusicPlanner", () => {
    it("preserves an existing lead while building a spacious chorus", () => {
        const plan = LocalMusicPlanner.create("副歌更炸一点，但不要太满，保留 Lead", snapshot)
        expect(plan.actions).toHaveLength(2)
        expect(plan.actions).toEqual([
            expect.objectContaining({type: "create-instrument", name: "DAWdex Bass", density: 0.45}),
            expect.objectContaining({type: "create-instrument", name: "DAWdex Chords", density: 0.45})
        ])
    })

    it("extracts a requested tempo within the safe range", () => {
        const plan = LocalMusicPlanner.create("Tempo 128, add bass", snapshot)
        expect(plan.actions[0]).toEqual({type: "set-tempo", bpm: 128})
    })
})
