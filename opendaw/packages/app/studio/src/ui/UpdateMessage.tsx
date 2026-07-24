import css from "./UpdateMessage.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"

const className = Html.adoptStyleSheet(css, "UpdateMessage")

export const UpdateMessage = () => {
    return (
        <div className={className}>
            Update available! (please save now and reload!)
        </div>
    )
}