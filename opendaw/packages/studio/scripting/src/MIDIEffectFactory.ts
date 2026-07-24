import {MIDIEffects} from "./Api"
import {Box, BoxGraph} from "@opendaw/lib-box"
import {AudioUnitBox, PitchDeviceBox} from "@opendaw/studio-boxes"
import {Unhandled, UUID} from "@opendaw/lib-std"

export class MIDIEffectFactory {
    static write(boxGraph: BoxGraph,
                 audioUnitBox: AudioUnitBox,
                 effect: Required<MIDIEffects[keyof MIDIEffects]>): Box {
        switch (effect.key) {
            case "pitch": {
                return PitchDeviceBox.create(boxGraph, UUID.generate(), box => {
                    box.cents.setValue(effect.cents)
                    box.semiTones.setValue(effect.semiTones)
                    box.octaves.setValue(effect.octaves)
                    box.enabled.setValue(effect.enabled)
                    box.label.setValue(effect.label) // TODO uniquify?
                    box.host.refer(audioUnitBox.midiEffects)
                })
            }
            default:
                return Unhandled(effect.key)
        }
    }
}