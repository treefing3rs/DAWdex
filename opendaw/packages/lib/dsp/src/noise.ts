export class C64Noise {
    #state = 0x7FFFFF // 23-bit LFSR
    readonly #mask = (1 << 23) - 1
    readonly #phaseInc: number
    #phase = 0

    constructor(frequency: number, sampleRate: number) {
        this.#phaseInc = frequency / sampleRate
    }

    process(): number {
        this.#phase += this.#phaseInc
        while (this.#phase >= 1.0) {
            this.#phase -= 1.0
            // advance the LFSR every phase wrap
            const bit = ((this.#state >> 22) ^ (this.#state >> 17)) & 1
            this.#state = ((this.#state << 1) | bit) & this.#mask
        }
        // the SID outputs the top 12 bits as a DAC value
        const value = (this.#state >> 11) & 0xFFF
        return (value / 2047.5) - 1.0
    }

    reset(): void {
        this.#state = 0x7FFFFF
        this.#phase = 0
    }
}
