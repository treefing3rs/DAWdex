export type MidiFingerprintEntry = {
    readonly id: string
    readonly fingerprint: string
}

export const hasDuplicateMidiFingerprint = (
    candidate: string,
    existing: ReadonlyArray<MidiFingerprintEntry>,
    excludedId: string | null = null
): boolean => existing.some(entry => entry.id !== excludedId && entry.fingerprint === candidate)
