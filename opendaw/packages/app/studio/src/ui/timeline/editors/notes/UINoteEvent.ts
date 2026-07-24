import {NoteEvent, ppqn} from "@opendaw/lib-dsp"
import {int} from "@opendaw/lib-std"

export type UINoteEvent = NoteEvent & {
    isSelected: boolean
    complete: ppqn
    chance: number
    playCount: int
    playCurve: number
}