import {describe, expect, it} from "vitest"
import {MidiFile} from "@opendaw/lib-midi"
import {decodeMidiNoteSpans} from "./MidiNoteSpans"

const midi = (track: ReadonlyArray<number>): ArrayBuffer => new Uint8Array([
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xE0,
    0x4D, 0x54, 0x72, 0x6B,
    (track.length >>> 24) & 0xFF,
    (track.length >>> 16) & 0xFF,
    (track.length >>> 8) & 0xFF,
    track.length & 0xFF,
    ...track
]).buffer

const decode = (track: ReadonlyArray<number>) =>
    decodeMidiNoteSpans(MidiFile.decoder(midi(track)).decode())

describe("decodeMidiNoteSpans", () => {
    it("holds a released note until CC64 pedal-up", () => {
        const groups = decode([
            0x00, 0xB0, 0x40, 0x7F,
            0x00, 0x90, 0x3C, 0x64,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x83, 0x60, 0xB0, 0x40, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])

        expect(groups).toEqual([{
            trackIndex: 0,
            channel: 0,
            notes: [{
                ticks: 0,
                durationTicks: 960,
                pitch: 60,
                velocity: 100 / 127
            }]
        }])
    })

    it("ends an older sustained pitch when the same pitch is retriggered", () => {
        const groups = decode([
            0x00, 0xB0, 0x40, 0x7F,
            0x00, 0x90, 0x3C, 0x64,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x81, 0x70, 0x90, 0x3C, 0x5A,
            0x81, 0x70, 0x80, 0x3C, 0x00,
            0x81, 0x70, 0xB0, 0x40, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])

        expect(groups[0].notes).toEqual([
            {ticks: 0, durationTicks: 720, pitch: 60, velocity: 100 / 127},
            {ticks: 720, durationTicks: 480, pitch: 60, velocity: 90 / 127}
        ])
    })

    it("closes pedal-held notes at the source end", () => {
        const groups = decode([
            0x00, 0xB0, 0x40, 0x7F,
            0x00, 0x90, 0x3C, 0x64,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x81, 0x70, 0xFF, 0x2F, 0x00
        ])

        expect(groups[0].notes[0]).toEqual({
            ticks: 0,
            durationTicks: 720,
            pitch: 60,
            velocity: 100 / 127
        })
    })

    it("keeps pedal state isolated to its MIDI channel", () => {
        const groups = decode([
            0x00, 0xB0, 0x40, 0x7F,
            0x00, 0x90, 0x3C, 0x64,
            0x00, 0x91, 0x40, 0x64,
            0x83, 0x60, 0x80, 0x3C, 0x00,
            0x00, 0x81, 0x40, 0x00,
            0x83, 0x60, 0xB0, 0x40, 0x00,
            0x00, 0xFF, 0x2F, 0x00
        ])

        expect(groups.map(({channel, notes}) => ({
            channel,
            durationTicks: notes[0].durationTicks
        }))).toEqual([
            {channel: 0, durationTicks: 960},
            {channel: 1, durationTicks: 480}
        ])
    })
})
