import {describe, expect, it} from "vitest"
import {PPQN} from "@opendaw/lib-dsp"
import {readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
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

const toArrayBuffer = (value: Buffer): ArrayBuffer =>
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer

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

    it("preserves GM drum pitches", () => {
        const notes = compileMidiAsset(singleNoteMidi(36), "drums", 4)
        expect(notes.every(note => note.pitch === 36)).toBe(true)
    })

    it("imports a real R&B Keys asset from the checked-in library above the bass register", async () => {
        const path = fileURLToPath(new URL(
            "../../../../../../../midi/easy/keys/EZkeys Library/MIDI/"
            + "000970@Piano-Loops/000915@RnB_Piano_Ballads_Vol_1/"
            + "025@Song3_C_70_1_bar_rhythms/D_MINOR_RHY.mid",
            import.meta.url
        ))
        const notes = compileMidiAsset(toArrayBuffer(await readFile(path)), "keys", 4)
        expect(notes.length).toBeGreaterThan(0)
        expect(Math.min(...notes.map(note => note.pitch))).toBeGreaterThanOrEqual(48)
        expect(Math.max(...notes.map(note => note.pitch))).toBeLessThanOrEqual(88)
    })
})
