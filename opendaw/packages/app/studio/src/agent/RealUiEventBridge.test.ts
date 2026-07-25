import {describe, expect, it} from "vitest"
import type {AgentPlan, DawProjectSnapshot} from "./AgentProtocol"
import {RealUiEventBridge} from "./RealUiEventBridge"
import type {UiEvent} from "./ui-contract"

const snapshot = (
    playing: boolean,
    position: number,
    options: {withTrack?: boolean, mute?: boolean, solo?: boolean} = {}
): DawProjectSnapshot => ({
    hasProject: true,
    bpm: 92,
    transport: {playing, position, loopEnabled: true, loopFrom: 0, loopTo: 3840},
    tracks: options.withTrack === false ? [] : [{
        id: "track-drums",
        name: "DAWdex Drums",
        trackCount: 1,
        regionCount: 1,
        generated: true,
        role: "drums",
        style: "rnb",
        midiFingerprint: "midi",
        sound: {
            instrumentKind: "VaporisateurDeviceBox",
            instrumentLabel: "Vaporisateur",
            instrumentAssetId: null,
            instrumentPresetIndex: null,
            drumKit: null,
            synthParameters: null,
            mixer: {
                volumeDb: 0,
                panning: 0,
                mute: options.mute ?? false,
                solo: options.solo ?? false
            },
            effects: [],
            unmanagedEffectCount: 0,
            fingerprint: "sound"
        },
        regions: [{
            id: "region-drums",
            position: 0,
            duration: 3840,
            noteCount: 16,
            midiFingerprint: "midi"
        }]
    }]
})

const plan = {
    id: "plan-1",
    prompt: "make rnb",
    title: "R&B drums",
    summary: "Replace the drums",
    rationale: [],
    source: "codex",
    brief: {
        intent: "modify",
        style: "rnb",
        bpm: 92,
        key: "D minor",
        bars: 4,
        energy: 0.5,
        swing: 0.2,
        preserveTrackIds: [],
        decisionSummary: "保留旋律，只让鼓更松弛"
    },
    actions: [{
        type: "upsert-role-track",
        mode: "replace",
        targetTrackId: "track-drums",
        role: "drums",
        style: "rnb",
        startBar: 1,
        bars: 4,
        rootMidi: 36,
        seed: 1,
        density: 0.5,
        energy: 0.5,
        midiAssetId: "asset-drums",
        midiAssetPath: "drums/rnb.mid",
        transposeSemitones: 0,
        sound: {} as never
    }]
} as AgentPlan

describe("RealUiEventBridge", () => {
    it("only marks a role performing after the real transport enters an audible region", () => {
        const events: UiEvent[] = []
        let now = 100
        const bridge = new RealUiEventBridge(event => events.push(event), () => now)

        bridge.sync(snapshot(false, 0))
        expect(events.map(event => event.type)).toEqual(["TransportChanged"])

        now = 200
        bridge.sync(snapshot(true, 960))
        expect(events.slice(-3).map(event => event.type)).toEqual([
            "TransportChanged",
            "RoleStateChanged",
            "TrackAudibleChanged"
        ])
        expect(events.at(-1)).toMatchObject({type: "TrackAudibleChanged", role: "drums", audible: true})

        now = 300
        bridge.sync(snapshot(false, 960))
        expect(events.slice(-2).map(event => event.type)).toEqual([
            "TransportChanged",
            "TrackAudibleChanged"
        ])
        expect(events.at(-1)).toMatchObject({type: "TrackAudibleChanged", role: "drums", audible: false})
        expect(events.every((event, index) => event.seq === index + 1)).toBe(true)
    })

    it("does not report a muted track as audible", () => {
        const events: UiEvent[] = []
        const bridge = new RealUiEventBridge(event => events.push(event), () => 0)

        bridge.sync(snapshot(true, 960, {mute: true}))

        expect(events.some(event => event.type === "TrackAudibleChanged")).toBe(false)
    })

    it("derives role receipts and operation results from the same approved plan", () => {
        const events: UiEvent[] = []
        const bridge = new RealUiEventBridge(event => events.push(event), () => 0)
        const danmakuId = bridge.receiveDanmaku("鼓松一点")

        bridge.acceptPlan(plan, danmakuId, snapshot(false, 0))
        bridge.beginPlan(plan)
        bridge.finishPlan(plan, "intervention", {success: true, message: "Applied"})
        bridge.sync(snapshot(true, 0))

        expect(events.some(event =>
            event.type === "RoleTaskAssigned"
            && event.operationRef === "plan-1/op-1")).toBe(true)
        expect(events.some(event =>
            event.type === "OperationResult"
            && event.kind === "intervention"
            && event.ok)).toBe(true)
        expect(events.some(event =>
            event.type === "TrackAudibleChanged"
            && event.audible)).toBe(true)
    })
})
