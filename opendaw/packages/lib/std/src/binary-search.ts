import {Comparator, Func, int} from "./lang"

// https://en.wikipedia.org/wiki/Binary_search_algorithm
//
export namespace BinarySearch {
    export const exact = <T>(sorted: ReadonlyArray<T>, key: T, comparator: Comparator<T>): int => {
        let l: int = 0 | 0
        let r: int = sorted.length - 1
        while (l <= r) {
            const m: int = (l + r) >>> 1
            const cmp = comparator(sorted[m], key)
            if (cmp === 0) {return m}
            if (cmp < 0) {l = m + 1} else {r = m - 1}
        }
        return -1
    }

    export const exactMapped = <T, U>(sorted: ReadonlyArray<U>, key: T, comparator: Comparator<T>, map: Func<U, T>): int => {
        let l: int = 0 | 0
        let r: int = sorted.length - 1
        while (l <= r) {
            const m: int = (l + r) >>> 1
            const cmp = comparator(map(sorted[m]), key)
            if (cmp === 0) {return m}
            if (cmp < 0) {l = m + 1} else {r = m - 1}
        }
        return -1
    }

    export const leftMost = <T>(sorted: ReadonlyArray<T>, key: T, comparator: Comparator<T>): int => {
        let l: int = 0 | 0
        let r: int = sorted.length
        while (l < r) {
            const m: int = (l + r) >>> 1
            if (comparator(sorted[m], key) < 0) {
                l = m + 1
            } else {
                r = m
            }
        }
        return l
    }

    export const rightMost = <T>(sorted: ReadonlyArray<T>, key: T, comparator: Comparator<T>): int => {
        let l: int = 0 | 0
        let r: int = sorted.length
        while (l < r) {
            const m: int = (l + r) >>> 1
            if (comparator(sorted[m], key) <= 0) {
                l = m + 1
            } else {
                r = m
            }
        }
        return r - 1
    }

    /**
     * stableInsert
     *
     * A hybrid binary-search variant is used when inserting into a sorted array
     * that must remain both numerically sorted and stable for equal values.
     *
     * - `leftMost` inserts before existing equal elements → breaks stability
     *   (newer equal values appear before older ones)
     * - `rightMost` inserts after existing equal elements → preserves stability
     *   but may misplace smaller values if used naively
     *
     * `stableInsert` combines both:
     * it finds the first element greater than the key (not equal),
     * ensuring correct ascending order while appending after any equals.
     *
     * This pattern is common in associative containers like multimaps,
     * priority queues, or event lists where items share the same key
     * but must preserve their original insertion order.
     */
    export const stableInsert = <T>(sorted: ReadonlyArray<T>, key: T, comparator: Comparator<T>): int => {
        let l = 0
        let r = sorted.length
        while (l < r) {
            const m = (l + r) >>> 1
            const cmp = comparator(sorted[m], key)
            if (cmp < 0) {
                l = m + 1
            } else {
                r = m
            }
        }
        while (l < sorted.length && comparator(sorted[l], key) === 0) {
            l++
        }
        return l
    }

    export const leftMostMapped =
        <T, U>(sorted: ReadonlyArray<U>, key: T, comparator: Comparator<T>, map: Func<U, T>): int => {
            let l: int = 0 | 0
            let r: int = sorted.length
            while (l < r) {
                const m: int = (l + r) >>> 1
                if (comparator(map(sorted[m]), key) < 0) {
                    l = m + 1
                } else {
                    r = m
                }
            }
            return l
        }

    export const rightMostMapped =
        <T, U>(sorted: ReadonlyArray<U>, key: T, comparator: Comparator<T>, map: Func<U, T>): int => {
            let l: int = 0 | 0
            let r: int = sorted.length
            while (l < r) {
                const m: int = (l + r) >>> 1
                if (comparator(map(sorted[m]), key) <= 0) {
                    l = m + 1
                } else {
                    r = m
                }
            }
            return r - 1
        }

    export const rangeMapped =
        <T, U>(sorted: ReadonlyArray<U>, key: T, comparator: Comparator<T>, map: Func<U, T>): [int, int] =>
            [leftMostMapped(sorted, key, comparator, map), rightMostMapped(sorted, key, comparator, map)]
}