import {PPQN, ppqn} from "@opendaw/lib-dsp"
import {clamp, int} from "@opendaw/lib-std"
import {MusicRole, SupportedStyle, UpsertRoleTrackAction} from "../AgentProtocol"

export type CompiledNote = {
    readonly position: ppqn
    readonly duration: ppqn
    readonly pitch: int
    readonly velocity: number
}

type PatternInput = Pick<UpsertRoleTrackAction,
    "role" | "style" | "bars" | "rootMidi" | "seed" | "density" | "energy">

const eighth = PPQN.Quarter / 2
const sixteenth = PPQN.SemiQuaver
const velocity = (value: number): number => clamp(value, 0.1, 1.0)
const duration = (value: number): ppqn => Math.max(1, Math.round(value))
const position = (value: number): ppqn => Math.max(0, Math.round(value))

const createRandom = (seed: number): (() => number) => {
    let state = Math.trunc(seed) >>> 0
    return () => {
        state += 0x6D2B79F5
        let value = state
        value = Math.imul(value ^ value >>> 15, value | 1)
        value ^= value + Math.imul(value ^ value >>> 7, value | 61)
        return ((value ^ value >>> 14) >>> 0) / 4294967296
    }
}

const add = (notes: Array<CompiledNote>, at: number, length: number,
             pitch: number, strength: number): void => {
    notes.push({
        position: position(at),
        duration: duration(length),
        pitch: clamp(Math.round(pitch), 0, 127),
        velocity: velocity(strength)
    })
}

const compileDubstepDrums = ({bars, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    for (let bar = 0; bar < bars; bar++) {
        const start = bar * PPQN.Bar
        add(notes, start, sixteenth * 0.65, 36, 0.78 + energy * 0.18)
        add(notes, start + PPQN.Quarter * 2, sixteenth * 0.72, 38, 0.84 + energy * 0.14)
        const extraKick = random() > 0.46
            ? PPQN.Quarter * (bar % 2 === 0 ? 1.5 : 3.25)
            : PPQN.Quarter * 2.75
        add(notes, start + extraKick, sixteenth * 0.6, 36, 0.68 + energy * 0.2)
        const hatStep = density < 0.55 ? eighth : sixteenth
        for (let at = 0; at < PPQN.Bar; at += hatStep) {
            if (random() < 0.12) {continue}
            add(notes, start + at, sixteenth * 0.42, 42,
                0.38 + energy * 0.22 + (at % PPQN.Quarter === 0 ? 0.12 : random() * 0.08))
        }
        if (bar % 2 === 1) {
            add(notes, start + PPQN.Bar - eighth, sixteenth * 0.52, 46, 0.55 + energy * 0.2)
        }
    }
    return notes
}

const compileDubstepBass = ({bars, rootMidi, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    const lowRoot = clamp(rootMidi - 12, 24, 48)
    for (let bar = 0; bar < bars; bar++) {
        const start = bar * PPQN.Bar
        const variation = random() > 0.5 ? 7 : 12
        add(notes, start, PPQN.Quarter * 0.92, lowRoot, 0.72 + energy * 0.2)
        add(notes, start + PPQN.Quarter * 1.5, eighth * 0.72,
            lowRoot + variation, 0.58 + energy * 0.24)
        add(notes, start + PPQN.Quarter * 2.75, eighth * 0.66,
            lowRoot + (bar % 2 === 0 ? 3 : 0), 0.66 + energy * 0.22)
        if (density > 0.68) {
            add(notes, start + PPQN.Quarter * 3.5, sixteenth * 0.78,
                lowRoot + (random() > 0.5 ? 10 : 12), 0.56 + energy * 0.2)
        }
    }
    return notes
}

const compileDubstepKeys = ({bars, rootMidi, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    const voicing = [0, 3, 7, 10]
    for (let bar = 0; bar < bars; bar++) {
        if (bar % 2 === 1 && density < 0.72) {continue}
        const start = bar * PPQN.Bar + (bar % 2 === 0 ? 0 : PPQN.Quarter * 2.5)
        const inversion = random() > 0.62 ? 12 : 0
        voicing.forEach((interval, index) => add(
            notes,
            start,
            eighth * (bar % 2 === 0 ? 1.25 : 0.82),
            rootMidi + interval + (index === voicing.length - 1 ? inversion : 0),
            0.42 + energy * 0.24 - index * 0.025
        ))
    }
    return notes
}

const rnbSwingOffset = (step: number): number =>
    step % 2 === 1 ? sixteenth * 0.32 : 0

const compileRnbDrums = ({bars, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    for (let bar = 0; bar < bars; bar++) {
        const start = bar * PPQN.Bar
        const kicks = bar % 2 === 0 ? [0, 1.75, 3.25] : [0, 2.5, 3.5]
        kicks.forEach((beat, index) => add(notes, start + PPQN.Quarter * beat,
            sixteenth * 0.62, 36, 0.58 + energy * 0.25 - index * 0.04))
        const snares = [1, 3]
        snares.forEach((beat, index) => add(notes, start + PPQN.Quarter * beat + (index === 1 ? 18 : 0),
            sixteenth * 0.68, 38, 0.55 + energy * 0.2 + random() * 0.08))
        const hatStep = density > 0.72 ? sixteenth : eighth
        const steps = Math.round(PPQN.Bar / hatStep)
        for (let step = 0; step < steps; step++) {
            if (random() < 0.16) {continue}
            add(notes, start + step * hatStep + rnbSwingOffset(step),
                sixteenth * 0.38, step % 8 === 7 ? 46 : 42,
                0.32 + energy * 0.2 + random() * 0.12)
        }
    }
    return notes
}

const compileRnbBass = ({bars, rootMidi, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    const roots = [0, -5, -2, 3]
    for (let bar = 0; bar < bars; bar++) {
        const start = bar * PPQN.Bar
        const root = clamp(rootMidi - 12 + roots[bar % roots.length], 24, 52)
        add(notes, start, PPQN.Quarter * 0.76, root, 0.58 + energy * 0.24)
        add(notes, start + PPQN.Quarter * 1.75 + rnbSwingOffset(3), eighth * 0.74,
            root + (random() > 0.5 ? 7 : 10), 0.48 + energy * 0.22)
        add(notes, start + PPQN.Quarter * 3.25 + rnbSwingOffset(7), eighth * 0.66,
            root + (bar % 2 === 0 ? 2 : -2), 0.52 + energy * 0.2)
        if (density > 0.68) {
            add(notes, start + PPQN.Quarter * 2.5, sixteenth * 0.86,
                root + 12, 0.42 + energy * 0.18)
        }
    }
    return notes
}

const compileRnbKeys = ({bars, rootMidi, seed, density, energy}: PatternInput): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    const random = createRandom(seed)
    const roots = [0, -5, -2, 3]
    const voicings = [
        [0, 3, 7, 10, 14],
        [0, 3, 7, 10, 14],
        [0, 4, 7, 11, 14],
        [0, 4, 7, 11]
    ] as const
    for (let bar = 0; bar < bars; bar++) {
        const chordIndex = bar % roots.length
        const chordRoot = rootMidi + roots[chordIndex]
        const starts = density < 0.6 ? [0.5] : [0.5, 2.75]
        starts.forEach((beat, chordHit) => {
            const at = bar * PPQN.Bar + PPQN.Quarter * beat + (chordHit === 1 ? rnbSwingOffset(5) : 0)
            voicings[chordIndex].forEach((interval, index) => add(
                notes,
                at,
                PPQN.Quarter * (chordHit === 0 ? 1.45 : 0.72),
                chordRoot + interval + (index === 0 && random() > 0.76 ? 12 : 0),
                0.38 + energy * 0.22 + random() * 0.05 - index * 0.018
            ))
        })
    }
    return notes
}

export const compileRolePattern = (input: PatternInput): ReadonlyArray<CompiledNote> => {
    const compilers: Readonly<Record<SupportedStyle, Readonly<Record<MusicRole,
        (value: PatternInput) => ReadonlyArray<CompiledNote>>>>> = {
        dubstep: {
            drums: compileDubstepDrums,
            bass: compileDubstepBass,
            keys: compileDubstepKeys
        },
        rnb: {
            drums: compileRnbDrums,
            bass: compileRnbBass,
            keys: compileRnbKeys
        }
    }
    return compilers[input.style][input.role](input)
}

export const midiFingerprint = (notes: ReadonlyArray<CompiledNote>): string => {
    const value = notes
        .map(note => [
            Math.round(note.pitch),
            Math.round(note.position),
            Math.round(note.duration),
            Math.round(note.velocity * 1000)
        ].join(":"))
        .toSorted()
        .join("|")
    let hash = 0x811C9DC5
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return `midi-${(hash >>> 0).toString(16).padStart(8, "0")}-${notes.length}`
}
