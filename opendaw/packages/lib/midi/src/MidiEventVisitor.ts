import {byte, unitValue} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"

export interface MidiEventVisitor {
    noteOn?(note: byte, velocity: byte): void
    noteOff?(note: byte): void
    pitchBend?(delta: number): void
    controller?(id: byte, value: unitValue): void
    clock?(): void
    start?(): void
    continue?(): void
    stop?(): void
    songPos?(position: ppqn): void
}