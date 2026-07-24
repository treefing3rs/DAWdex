import {int} from "./lang"

export class ObjectPool<T> {
    readonly #available: Array<T> = []
    readonly #inUse: Set<T> = new Set<T>()
    readonly #factory: () => T

    constructor(factory: () => T, initialSize: number = 0) {
        this.#factory = factory
        this.#grow(initialSize)
    }

    acquire(): T {
        if (this.#available.length === 0) {this.#grow(8)}
        const instance = this.#available.pop()!
        this.#inUse.add(instance)
        return instance
    }

    release(instance: T): void {
        if (!this.#inUse.has(instance)) {
            throw new Error("Attempted to release an instance that was not acquired from this pool")
        }

        this.#inUse.delete(instance)
        this.#available.push(instance)
    }

    releaseAll(): void {
        for (const instance of this.#inUse) {
            this.#available.push(instance)
        }
        this.#inUse.clear()
    }

    #grow(count: int): void {
        for (let i = 0; i < count; i++) {
            this.#available.push(this.#factory())
        }
    }

    get inUseCount(): int {return this.#inUse.size}
    get totalSize(): int {return this.#available.length + this.#inUse.size}
    get availableCount(): int {return this.#available.length}
}