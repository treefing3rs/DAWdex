import {describe, expect, it} from "vitest"
import {Color} from "./color"
import hslStringToHex = Color.hslStringToHex
import hslToHex = Color.hslToHex
import hexToHsl = Color.hexToHsl

describe("color", () => {
    it("parse", () => {
        expect(Color.parseCssRgbOrRgba("rgb(0, 0, 0)")).toStrictEqual([0, 0, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 0, 0)")).toStrictEqual([1, 0, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 255, 0)")).toStrictEqual([1, 1, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 255, 255)")).toStrictEqual([1, 1, 1, 1])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 0.0)")).toStrictEqual([1, 1, 1, 0])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 0.5)")).toStrictEqual([1, 1, 1, 0.5])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 1.0)")).toStrictEqual([1, 1, 1, 1])
        expect(Color.parseCssRgbOrRgba("    rgba( 127.5 ,  255 ,     255,    1.0 )   ")).toStrictEqual([0.5, 1, 1, 1])
        expect(() => Color.parseCssRgbOrRgba("rgba(foo,255,255,1.0)")).toThrow()
    })
    it("converts primary colors", () => {
        expect(hslStringToHex("hsl(0,100%,50%)")).toBe("#ff0000")     // Red
        expect(hslStringToHex("hsl(120,100%,50%)")).toBe("#00ff00")   // Green
        expect(hslStringToHex("hsl(240,100%,50%)")).toBe("#0000ff")   // Blue
    })
    it("converts secondary colors", () => {
        expect(hslStringToHex("hsl(60,100%,50%)")).toBe("#ffff00")    // Yellow
        expect(hslStringToHex("hsl(180,100%,50%)")).toBe("#00ffff")   // Cyan
        expect(hslStringToHex("hsl(300,100%,50%)")).toBe("#ff00ff")   // Magenta
    })
    it("handles neutral tones", () => {
        expect(hslStringToHex("hsl(0,0%,50%)")).toBe("#808080")       // Gray
    })
    it("converts custom color", () => {
        expect(hslStringToHex("hsl(30,60%,75%)")).toBe("#e6bf99")
    })
    it("should convert HSL to HEX correctly", () => {
        expect(hslToHex(30, 0.6, 0.75)).toBe("#e6bf99")
        expect(hslToHex(0, 1, 0.5)).toBe("#ff0000")
        expect(hslToHex(120, 1, 0.5)).toBe("#00ff00")
        expect(hslToHex(240, 1, 0.5)).toBe("#0000ff")
    })

    it("should convert HEX to HSL correctly (approximate)", () => {
        const {h, s, l} = hexToHsl("#e6bf99")
        expect(h).toBeCloseTo(30, 0)
        expect(s).toBeCloseTo(0.6, 1)
        expect(l).toBeCloseTo(0.75, 2)
    })

    it("should work without leading # in hex", () => {
        const {h, s, l} = hexToHsl("e6bf99")
        expect(h).toBeCloseTo(30, 0)
        expect(s).toBeCloseTo(0.6, 1)
        expect(l).toBeCloseTo(0.75, 2)
    })

    it("should round-trip between HSL and HEX", () => {
        const colors = [
            {h: 0, s: 1, l: 0.5},
            {h: 120, s: 1, l: 0.5},
            {h: 240, s: 1, l: 0.5},
            {h: 30, s: 0.6, l: 0.75},
            {h: 200, s: 0.4, l: 0.3}
        ]

        for (const c of colors) {
            const hex = hslToHex(c.h, c.s, c.l)
            const result = hexToHsl(hex)
            expect(result.h).toBeCloseTo(c.h, 0)
            expect(result.s).toBeCloseTo(c.s, 1)
            expect(result.l).toBeCloseTo(c.l, 2)
        }
    })
})