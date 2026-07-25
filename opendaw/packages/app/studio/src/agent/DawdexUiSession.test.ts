import {describe, expect, it} from "vitest"
import {dawdexRoom} from "./DawdexStageAssets"
import {
    DawdexProjectModeController,
    DawdexUiSession,
    getDawdexUiSession,
    shouldPlayDawdexVideo
} from "./DawdexUiSession"

describe("DawdexUiSession", () => {
    it("switches between product and workbench without resetting stage state", () => {
        const session = new DawdexUiSession()
        session.setRoom("keys")
        session.setRole("keys", {entered: true, state: "performing", audible: true})

        session.setViewMode("workbench")
        session.setViewMode("product")

        expect(session.viewMode.getValue()).toBe("product")
        expect(session.stage.getValue().roomId).toBe("keys")
        expect(session.stage.getValue().roles.keys).toMatchObject({
            entered: true,
            state: "performing",
            audible: true
        })
    })

    it("publishes transport and danmaku state for the compact preview", () => {
        const session = new DawdexUiSession()
        session.setTransport({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            barsPerLoop: 4,
            currentBar: 3
        })
        session.pushDanmaku("鼓松一点", "user")

        expect(session.stage.getValue()).toMatchObject({
            isPlaying: true,
            bpm: 92,
            key: "D minor",
            currentBar: 3,
            danmaku: {text: "鼓松一点", author: "user"}
        })
    })

    it("resets role presentation without changing the active room or mode", () => {
        const session = new DawdexUiSession()
        session.setViewMode("workbench")
        session.setRoom("drums")
        session.setRole("drums", {entered: true, state: "failed", audible: false})

        session.resetRoles()

        expect(session.viewMode.getValue()).toBe("workbench")
        expect(session.stage.getValue().roomId).toBe("drums")
        expect(session.stage.getValue().roles.drums).toEqual({
            entered: false,
            state: "waiting",
            audible: false
        })
    })

    it("returns one session for one StudioService identity", () => {
        const service = {} as never
        expect(getDawdexUiSession(service)).toBe(getDawdexUiSession(service))
        expect(getDawdexUiSession({} as never)).not.toBe(getDawdexUiSession(service))
    })

    it("resolves the shared room media catalog", () => {
        const session = new DawdexUiSession()
        session.setRoom("lounge")

        expect(dawdexRoom(session.stage.getValue().roomId)).toMatchObject({
            label: "休息室",
            bg: "/dawdex/room_lounge.jpg",
            video: "/dawdex/room_lounge_loop.mp4"
        })
    })

    it("plays room video only on the visible surface", () => {
        expect(shouldPlayDawdexVideo("product", "product", true)).toBe(true)
        expect(shouldPlayDawdexVideo("workbench", "product", true)).toBe(false)
        expect(shouldPlayDawdexVideo("workbench", "workbench", true)).toBe(true)
        expect(shouldPlayDawdexVideo("product", "product", false)).toBe(false)
    })

    it("toggles workbench mode and honors an explicit target", () => {
        const session = new DawdexUiSession()

        session.setWorkbench()
        expect(session.viewMode.getValue()).toBe("workbench")

        session.setWorkbench()
        expect(session.viewMode.getValue()).toBe("product")

        session.setWorkbench(true)
        session.setWorkbench(true)
        expect(session.viewMode.getValue()).toBe("workbench")

        session.setWorkbench(false)
        expect(session.viewMode.getValue()).toBe("product")
    })

    it("drops every newly opened project into the workbench without resetting the stage", () => {
        const session = new DawdexUiSession()
        const controller = new DawdexProjectModeController(session)
        session.setRoom("keys")

        controller.update(true)

        expect(session.viewMode.getValue()).toBe("workbench")
        expect(session.stage.getValue().roomId).toBe("keys")

        session.setViewMode("product")
        controller.update(true)
        expect(session.viewMode.getValue()).toBe("product")

        controller.update(false)
        controller.update(true)
        expect(session.viewMode.getValue()).toBe("workbench")
    })

    it("keeps the stage in front when the agent creates the project itself", () => {
        const session = new DawdexUiSession()
        const controller = new DawdexProjectModeController(session)

        controller.update(true, true)
        expect(session.viewMode.getValue()).toBe("product")

        controller.update(false)
        controller.update(true)
        expect(session.viewMode.getValue()).toBe("workbench")
    })
})
