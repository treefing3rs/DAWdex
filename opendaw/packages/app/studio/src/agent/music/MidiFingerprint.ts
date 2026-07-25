export type CompiledNote = {
    readonly position: number
    readonly duration: number
    readonly pitch: number
    readonly velocity: number
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
