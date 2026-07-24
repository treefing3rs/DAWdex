import {z} from "zod"

export const SoundfontMetaData = z.object({
    name: z.string(),
    size: z.number().int(),
    url: z.string(),
    license: z.string(),
    origin: z.enum(["openDAW", "import"])
})

export type SoundfontMetaData = z.infer<typeof SoundfontMetaData>