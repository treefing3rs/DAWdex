type AnyConstructor<T, Args extends any[]> = new (...args: Args) => T;
type TypedArrayConstructor =
    | Float32ArrayConstructor
    | Float64ArrayConstructor
    | Int8ArrayConstructor
    | Int16ArrayConstructor
    | Int32ArrayConstructor
    | Uint8ArrayConstructor
    | Uint8ClampedArrayConstructor
    | Uint16ArrayConstructor
    | Uint32ArrayConstructor
    | BigInt64ArrayConstructor
    | BigUint64ArrayConstructor;

/**
 * Creates multiple instances through array destructuring.
 *
 * @example
 * // Typed arrays with length
 * const [a, b, c] = mint(Float32Array, 42)
 *
 * @example
 * // Typed arrays with values
 * const [a, b] = mint(Uint8Array, [1, 2, 3])
 *
 * @example
 * // Custom classes
 * const [pos, vel] = mint(Vec3, 0, 0, 0)
 *
 * Each destructured variable receives a unique instance.
 * Instances are created lazily on access, not cached.
 */
interface MintFunction {
    <T extends TypedArrayConstructor>(Constructor: T, ...args: any[]): InstanceType<T>[];
    <T, Args extends any[]>(Constructor: AnyConstructor<T, Args>, ...args: Args): T[];
}

export const mint: MintFunction = <T, Args extends any[]>(
    Constructor: AnyConstructor<T, Args>,
    ...args: Args
): T[] => new Proxy([] as any, {
    get(target, prop) {
        if (typeof prop === "string") {
            const index = Number(prop)
            if (!isNaN(index) && index >= 0 && Number.isInteger(index)) {
                return new Constructor(...args)
            }
        }
        if (prop === Symbol.iterator) {
            return function* () {
                while (true) {
                    yield new Constructor(...args)
                }
            }
        }
        return target[prop as any]
    },
    has(target, prop) {
        if (typeof prop === "string") {
            const index = Number(prop)
            if (!isNaN(index) && index >= 0) {
                return true
            }
        }
        return prop in target
    }
}) as T[]