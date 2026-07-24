import {int} from "@opendaw/lib-std"

export interface Event<TYPE> {
    readonly ticks: int
    readonly type: TYPE
}