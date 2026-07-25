import {describe, expect, it} from "vitest"
import {PPQN} from "@opendaw/lib-dsp"
import {compileMidiAsset} from "./MidiAsset"

const singleNoteMidi = (pitch: number): ArrayBuffer => new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B,
    0x00, 0x00, 0x00, 0x0D,
    0x00, 0x90, pitch, 0x64,
    0x83, 0x60, 0x80, pitch, 0x00,
    0x00, 0xFF, 0x2F, 0x00
]).buffer

const chordMidi = (root: number): ArrayBuffer => new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B,
    0x00, 0x00, 0x00, 0x1D,
    0x00, 0x90, root, 0x64,
    0x00, 0x90, root + 3, 0x5A,
    0x00, 0x90, root + 7, 0x50,
    0x83, 0x60, 0x80, root, 0x00,
    0x00, 0x80, root + 3, 0x00,
    0x00, 0x80, root + 7, 0x00,
    0x00, 0xFF, 0x2F, 0x00
]).buffer

const sustainPedalMidi = new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B,
    0x00, 0x00, 0x00, 0x16,
    0x00, 0xB0, 0x40, 0x7F,
    0x00, 0x90, 0x3C, 0x64,
    0x83, 0x60, 0x80, 0x3C, 0x00,
    0x83, 0x60, 0xB0, 0x40, 0x00,
    0x00, 0xFF, 0x2F, 0x00
]).buffer

describe("compileMidiAsset", () => {
    it("moves low Keys material out of the bass register and loops it to the requested bars", () => {
        const notes = compileMidiAsset(singleNoteMidi(24), "keys", 4)
        expect(notes).toHaveLength(4)
        expect(notes.every(note => note.pitch >= 48 && note.pitch <= 88)).toBe(true)
        expect(notes.map(note => note.position)).toEqual([
            0,
            PPQN.Bar,
            PPQN.Bar * 2,
            PPQN.Bar * 3
        ])
    })

    it("moves high Bass material into the bass register", () => {
        const notes = compileMidiAsset(singleNoteMidi(72), "bass", 4)
        expect(notes.every(note => note.pitch >= 28 && note.pitch <= 55)).toBe(true)
    })

    it("maps General MIDI drum roles onto the audible Playfield TR kit octave", () => {
        const notes = compileMidiAsset(singleNoteMidi(36), "drums", 4, 5)
        expect(notes.every(note => note.pitch === 60)).toBe(true)
        expect(compileMidiAsset(singleNoteMidi(38), "drums", 1)[0].pitch).toBe(62)
        expect(compileMidiAsset(singleNoteMidi(42), "drums", 1)[0].pitch).toBe(67)
        expect(compileMidiAsset(singleNoteMidi(46), "drums", 1)[0].pitch).toBe(68)
    })

    it("applies bundle key transposition to pitched roles before fitting their register", () => {
        const notes = compileMidiAsset(singleNoteMidi(64), "keys", 4, 2)
        expect(notes.every(note => note.pitch === 66)).toBe(true)
    })

    it("imports a representative polyphonic Keys MIDI fixture above the bass register", () => {
        const notes = compileMidiAsset(chordMidi(36), "keys", 4)
        expect(notes).toHaveLength(12)
        expect(Math.min(...notes.map(note => note.pitch))).toBeGreaterThanOrEqual(48)
        expect(Math.max(...notes.map(note => note.pitch))).toBeLessThanOrEqual(88)
    })

    it("keeps a Keys note sounding until CC64 pedal-up", () => {
        const notes = compileMidiAsset(sustainPedalMidi, "keys", 1)
        expect(notes).toHaveLength(1)
        expect(notes[0].duration).toBe(PPQN.Quarter * 2)
    })
})
