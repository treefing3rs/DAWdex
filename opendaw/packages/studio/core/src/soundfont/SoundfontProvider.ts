import {Progress, UUID} from "@opendaw/lib-std"
import {SoundfontMetaData} from "@opendaw/studio-adapters"

export interface SoundfontProvider {
    fetch(uuid: UUID.Bytes, progress: Progress.Handler): Promise<[ArrayBuffer, SoundfontMetaData]>
}