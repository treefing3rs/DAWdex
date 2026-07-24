import {Coordinates, SelectableLocator} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"

import {BoxAdapter} from "@opendaw/studio-adapters"

export type TimelineCoordinates = Coordinates<ppqn, number>
export type TimelineSelectableLocator<A extends BoxAdapter> = SelectableLocator<A, ppqn, number>