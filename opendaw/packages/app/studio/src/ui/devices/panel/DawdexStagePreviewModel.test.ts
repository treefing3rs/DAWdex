import {describe, expect, it} from "vitest"
import {DawdexUiSession} from "@/agent/DawdexUiSession"
import {createDawdexStagePreviewModel} from "./DawdexStagePreviewModel"

describe("createDawdexStagePreviewModel", () => {
    it("projects the current room and transport into compact labels", () => {
        const session = new DawdexUiSession()
        session.setRoom("keys")
        session.setTransport({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            barsPerLoop: 4,
            currentBar: 3
        })

        expect(createDawdexStagePreviewModel(session.stage.getValue(), "workbench")).toMatchObject({
            roomLabel: "键盘阁楼",
            recLabel: "● REC",
            transportLabel: "BAR 3/4 · 92 BPM",
            playVideo: true
        })
    })

    it("keeps video paused when the product surface owns playback", () => {
        const session = new DawdexUiSession()
        session.setTransport({
            isPlaying: true,
            bpm: 128,
            key: "A minor",
            barsPerLoop: 4,
            currentBar: 1
        })

        expect(createDawdexStagePreviewModel(session.stage.getValue(), "product").playVideo).toBe(false)
    })
})
