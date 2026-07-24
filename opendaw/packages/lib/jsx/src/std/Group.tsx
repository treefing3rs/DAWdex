import {JsxValue} from "../types"
import {createElement} from "../create-element"
import {Procedure} from "@opendaw/lib-std"

export const Group = ({onInit}: { onInit?: Procedure<HTMLDivElement> }, children: ReadonlyArray<JsxValue>) => (
    <div onInit={onInit} style={{display: "contents"}}>{children}</div>
)