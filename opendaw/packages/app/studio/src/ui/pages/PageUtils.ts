// TODO Remove?
export namespace PageUtils {
    export const extractFirstSegment = (path: string) => {
        const match = path.match(/^\/([^\/]+)(?:\/|$)/)
        return match ? match[1] : null
    }

    export const extractSecondSegment = (path: string) => {
        const match = path.match(/^\/[^\/]+\/([^\/]+)\/?$/)
        return match ? match[1] : null
    }
}