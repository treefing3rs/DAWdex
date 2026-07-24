import css from "./NoMidiSupport.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"

const className = Html.adoptStyleSheet(css, "NoMidiSupport")

export const NoMidiSupport = () => (
    <div className={className}>
        <div>You browser does not support MIDI</div>
        <div>Tip: Chrome and Firefox do</div>
    </div>
)