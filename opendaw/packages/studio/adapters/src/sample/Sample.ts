import {UUID} from "@opendaw/lib-std"
import {SampleMetaData} from "./SampleMetaData"
import {z} from "zod"

export const Sample = SampleMetaData.extend({
    uuid: UUID.zType(z)
})

export type Sample = z.infer<typeof Sample>