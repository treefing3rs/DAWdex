export class Smooth {
    readonly #a: number

    value = 0.0

    constructor(time: number, sampleRate: number) {
        this.#a = 1.0 - Math.exp(-1.0 / (time * sampleRate))
    }

    process(x: number): number {
        this.value += this.#a * (x - this.value)
        return this.value
    }
}