export namespace Asserts {
    const validateNoNaN = (obj: any, path: string = "root", visited: WeakSet<object>): void => {
        if (obj === null || obj === undefined) return
        if (typeof obj === "number" && isNaN(obj)) {
            throw new Error(`NaN found at: ${path}`)
        }
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => validateNoNaN(item, `${path}[${index}]`, visited))
            return
        }
        if (typeof obj === "object") {
            if (visited.has(obj)) return
            visited.add(obj)
            const allKeys = new Set<string>()
            Object.getOwnPropertyNames(obj).forEach(k => allKeys.add(k))
            let proto = Object.getPrototypeOf(obj)
            while (proto && proto !== Object.prototype) {
                Object.getOwnPropertyNames(proto).forEach(k => allKeys.add(k))
                proto = Object.getPrototypeOf(proto)
            }
            for (const key of allKeys) {
                let value: any
                let accessible = true
                try {
                    value = obj[key]
                } catch {
                    accessible = false
                }
                if (accessible) {
                    if (typeof value === "number" && isNaN(value)) {
                        throw new Error(`NaN found at: ${path}.${key}`)
                    }
                    if (typeof value !== "function") {
                        validateNoNaN(value, `${path}.${key}`, visited)
                    }
                }
            }
        }
    }

    export const assertNoNaN = (obj: any, label: string = "validateNoNaN"): void => {
        console.time(label)
        try {
            validateNoNaN(obj, "root", new WeakSet())
        } finally {
            console.timeEnd(label)
        }
    }
}