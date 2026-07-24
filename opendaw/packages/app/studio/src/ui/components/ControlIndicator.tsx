import {Lifecycle} from "@opendaw/lib-std"
import {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {createElement, Group, JsxValue} from "@opendaw/lib-jsx"

type Construct = {
    lifecycle: Lifecycle
    parameter: AutomatableParameterFieldAdapter
}

export const ControlIndicator = ({lifecycle, parameter}: Construct, children: JsxValue) => {
    const element: HTMLElement = <Group>{children}</Group>
    lifecycle.own(parameter.catchupAndSubscribeControlSources({
        onControlSourceAdd: () => element.classList.add("automated"),
        onControlSourceRemove: () => element.classList.remove("automated")
    }))
    return element
}