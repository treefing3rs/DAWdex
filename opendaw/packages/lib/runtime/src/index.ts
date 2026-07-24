const key = Symbol.for("@openDAW/lib-runtime")

if ((globalThis as any)[key]) {
    console.debug(`%c${key.description}%c is already available in ${globalThis.constructor.name}.`, "color: hsl(10, 83%, 60%)", "color: inherit")
} else {
    (globalThis as any)[key] = true
    console.debug(`%c${key.description}%c is now available in ${globalThis.constructor.name}.`, "color: hsl(200, 83%, 60%)", "color: inherit")
}

export * from "./communicator"
export * from "./fetch"
export * from "./runtime"
export * from "./messenger"
export * from "./network"
export * from "./promises"
export * from "./stopwatch"
export * from "./timespan"
export * from "./wait"