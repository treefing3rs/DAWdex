import {createElement} from "./create-element"
import {JsxValue} from "./types"

export const linkify = (text: string, target?: string): JsxValue => text
    .split(/(https?:\/\/\S+|www\.\S+)/g)
    .map((part, i) => i % 2
        ? <a href={part.startsWith("http") ? part : `https://${part}`} target={target}>{part}</a>
        : part)