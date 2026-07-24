import {IconSymbol} from "@opendaw/studio-enums"
import {int} from "@opendaw/lib-std"

export type InstrumentOptions<T = never> = { name?: string, icon?: IconSymbol, index?: int, attachment?: T }