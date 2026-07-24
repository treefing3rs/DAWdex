import {Predicate} from "@opendaw/lib-std"
import {Box, Vertex} from "@opendaw/lib-box"
import {SelectableVertex} from "./SelectableVertex"

export const isVertexOfBox = (predicate: Predicate<Box>): Predicate<SelectableVertex> => (vertex: Vertex) => predicate(vertex.box)