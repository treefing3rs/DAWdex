import {AudioData} from "./audio-data"

export interface TransientProtocol {
    detect(audioData: AudioData): Promise<Array<number>>
}