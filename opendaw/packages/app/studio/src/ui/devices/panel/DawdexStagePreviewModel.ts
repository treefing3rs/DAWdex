import {dawdexRoom} from "@/agent/DawdexStageAssets"
import {
    shouldPlayDawdexVideo,
    type DawdexStageSnapshot,
    type DawdexViewMode
} from "@/agent/DawdexUiSession"

export type DawdexStagePreviewModel = {
    readonly room: ReturnType<typeof dawdexRoom>
    readonly roomLabel: string
    readonly recLabel: string
    readonly transportLabel: string
    readonly playVideo: boolean
}

export const createDawdexStagePreviewModel = (
    stage: DawdexStageSnapshot,
    mode: DawdexViewMode
): DawdexStagePreviewModel => {
    const room = dawdexRoom(stage.roomId)
    return {
        room,
        roomLabel: room.label,
        recLabel: stage.isPlaying ? "● REC" : "STANDBY",
        transportLabel: `BAR ${stage.currentBar}/${stage.barsPerLoop} · ${Math.round(stage.bpm)} BPM`,
        playVideo: shouldPlayDawdexVideo("workbench", mode, stage.isPlaying)
    }
}
