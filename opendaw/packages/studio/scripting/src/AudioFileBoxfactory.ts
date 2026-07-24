import {AudioFileBox} from "@opendaw/studio-boxes"
import {UUID} from "@opendaw/lib-std"
import {BoxGraph} from "@opendaw/lib-box"

export namespace AudioFileBoxfactory {
    export const create = (boxGraph: BoxGraph, sample: Sample): AudioFileBox =>
        AudioFileBox.create(boxGraph, UUID.parse(sample.uuid), box => {
            box.fileName.setValue(sample.name)
            box.startInSeconds.setValue(0)
            box.endInSeconds.setValue(sample.duration)
        })
}