import {OutputAudioUnit} from "../Api"
import {AudioUnitImpl} from "./AudioUnitImpl"

export class OutputAudioUnitImpl extends AudioUnitImpl implements OutputAudioUnit {
    readonly kind = "output" as const

    constructor() {super()}
}
