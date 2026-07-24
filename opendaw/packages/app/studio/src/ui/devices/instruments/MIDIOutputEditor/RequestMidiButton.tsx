import css from "./RequestMidiButton.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {MidiDevices} from "@opendaw/studio-core"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-enums"

const className = Html.adoptStyleSheet(css, "RequestMidiButton")

export const RequestMidiButton = () => (
    <div className={className} onclick={() => MidiDevices.requestPermission()}>
        <span>Request </span><Icon symbol={IconSymbol.Midi}/>
    </div>
)