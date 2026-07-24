import {Waveform} from "./waveform"

export interface Protocol {
    setWaveform(value: Waveform): void
    setFrequency(value: number): void
}