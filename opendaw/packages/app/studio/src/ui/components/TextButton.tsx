import css from "./TextButton.sass?inline"
import {Exec} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "TextButton")

export const TextButton = ({onClick}: { onClick: Exec }) => (
    <div className={className} onclick={onClick}/>
)