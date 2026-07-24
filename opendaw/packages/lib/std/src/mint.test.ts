import {describe, expect, it} from "vitest"
import {mint} from "./mint"

class Vec3 {
    constructor(public x: number, public y: number, public z: number) {}
    magnitude() {return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2)}
}

class Counter {
    constructor(public count: number = 0) {}
    increment() {this.count++}
}

describe("mint", () => {
    describe("typed arrays", () => {
        it("should create Float32Array instances", () => {
            const [a, b, c] = mint(Float32Array, 42)
            expect(a).toBeInstanceOf(Float32Array)
            expect(b).toBeInstanceOf(Float32Array)
            expect(c).toBeInstanceOf(Float32Array)
            expect(a.length).toBe(42)
            expect(b.length).toBe(42)
        })

        it("should create unique instances", () => {
            const [a, b] = mint(Float32Array, 10)
            a[0] = 1.5
            b[0] = 2.5
            expect(a[0]).toBe(1.5)
            expect(b[0]).toBe(2.5)
        })

        it("should work with different typed array types", () => {
            const [a] = mint(Uint8Array, 5)
            const [b] = mint(Int16Array, 5)
            expect(a).toBeInstanceOf(Uint8Array)
            expect(b).toBeInstanceOf(Int16Array)
        })

        it("should understand all arguments", () => {
            const [a] = mint(Uint8Array, [1, 2, 7])
            const [b] = mint(Int16Array, 5)
            expect(a[0]).toBe(1)
            expect(a[1]).toBe(2)
            expect(a[2]).toBe(7)
            expect(a).toBeInstanceOf(Uint8Array)
            expect(b).toBeInstanceOf(Int16Array)
        })
    })

    describe("custom classes", () => {
        it("should create class instances with constructor args", () => {
            const [position, velocity] = mint(Vec3, 1, 2, 3)
            expect(position).toBeInstanceOf(Vec3)
            expect(position.x).toBe(1)
            expect(position.y).toBe(2)
            expect(position.z).toBe(3)
            expect(velocity.x).toBe(1)
        })

        it("should create independent instances", () => {
            const [a, b] = mint(Vec3, 0, 0, 0)
            a.x = 5
            a.y = 3
            b.x = 10
            expect(a.x).toBe(5)
            expect(a.y).toBe(3)
            expect(b.x).toBe(10)
            expect(b.y).toBe(0)
        })

        it("should work with methods", () => {
            const [v] = mint(Vec3, 3, 4, 0)
            expect(v.magnitude()).toBe(5)
        })

        it("should work with default constructor args", () => {
            const [c1, c2] = mint(Counter, 100)
            c1.increment()
            c2.increment()
            c2.increment()
            expect(c1.count).toBe(101)
            expect(c2.count).toBe(102)
        })
    })

    describe("destructuring behavior", () => {
        it("should support arbitrary destructuring count", () => {
            const [a, b, c, d, e] = mint(Counter, 0)
            b.increment()
            c.increment()
            d.increment()
            expect(a).toBeInstanceOf(Counter)
            expect(e).toBeInstanceOf(Counter)
        })

        it("should create new instance on each access", () => {
            const arr = mint(Counter, 5)
            const first = arr[0]
            const second = arr[0]
            first.increment()
            expect(first.count).toBe(6)
            expect(second.count).toBe(5)
            expect(first).not.toBe(second)
        })
    })
})