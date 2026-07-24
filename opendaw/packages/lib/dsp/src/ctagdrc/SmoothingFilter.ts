// Smoothing Filter (1-pole IIR filter)
export class SmoothingFilter {
    readonly #sampleRate: number

    #a1: number = 1.0
    #b1: number = 0.0
    #state: number = 0.0
    #first: boolean = true

    constructor(sampleRate: number) {
        this.#sampleRate = sampleRate
        this.#a1 = 1
        this.#b1 = 1 - this.#a1
    }

    process(sample: number): void {
        if (this.#first) {
            this.#state = sample
            this.#first = false
        }
        this.#state = this.#a1 * sample + this.#b1 * this.#state
    }

    setAlpha(a: number): void {
        this.#a1 = a
        this.#b1 = 1 - this.#a1
    }

    setAlphaWithTime(timeInSeconds: number): void {
        this.#a1 = Math.exp(-1.0 / (this.#sampleRate * timeInSeconds))
        this.#b1 = 1 - this.#a1
    }

    getState(): number {
        return this.#state
    }
}