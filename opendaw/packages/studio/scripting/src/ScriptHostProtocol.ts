import {Sample} from "@opendaw/studio-adapters"
import {AudioData} from "@opendaw/lib-dsp"

export interface ScriptHostProtocol {
    openProject(buffer: ArrayBufferLike, name?: string): void

    fetchProject(): Promise<{ buffer: ArrayBuffer, name: string }>

    addSample(data: AudioData, name: string): Promise<Sample>
}