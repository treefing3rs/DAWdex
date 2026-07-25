import type {RoleId} from "./ui-contract"

export type DawdexRoomId = "main" | "drums" | "strings" | "keys" | "control" | "lounge"

export type DawdexRoom = {
    readonly id: DawdexRoomId
    readonly label: string
    readonly bg: string
    readonly video: string
}

export type DawdexStageRole = {
    readonly id: RoleId
    readonly label: string
    readonly img: string
}

export const DAWDEX_ROOMS: ReadonlyArray<DawdexRoom> = [
    {
        id: "main",
        label: "演播大厅",
        bg: "/dawdex/studio_base.jpg",
        video: "/dawdex/studio_night_loop.mp4"
    },
    {
        id: "drums",
        label: "鼓棚",
        bg: "/dawdex/room_drums.jpg",
        video: "/dawdex/room_drums_loop.mp4"
    },
    {
        id: "strings",
        label: "吉他贝斯棚",
        bg: "/dawdex/room_guitar_bass.jpg",
        video: "/dawdex/room_guitar_bass_loop.mp4"
    },
    {
        id: "keys",
        label: "键盘阁楼",
        bg: "/dawdex/room_keyboards.jpg",
        video: "/dawdex/room_keyboards_loop.mp4"
    },
    {
        id: "control",
        label: "控制室",
        bg: "/dawdex/control_room_night.jpg",
        video: "/dawdex/control_room_loop.mp4"
    },
    {
        id: "lounge",
        label: "休息室",
        bg: "/dawdex/room_lounge.jpg",
        video: "/dawdex/room_lounge_loop.mp4"
    }
]

export const DAWDEX_STAGE_ROLES: ReadonlyArray<DawdexStageRole> = [
    {id: "drums", label: "鼓手", img: "/dawdex/drummer_v2.png"},
    {id: "bass", label: "贝斯手", img: "/dawdex/bassist_v2.png"},
    {id: "keys", label: "键盘手", img: "/dawdex/keyboardist_v2.png"}
]

export const DAWDEX_PRODUCER: DawdexStageRole = {
    id: "producer",
    label: "制作人",
    img: "/dawdex/producer_v2.png"
}

export const dawdexRoom = (id: DawdexRoomId): DawdexRoom =>
    DAWDEX_ROOMS.find(room => room.id === id) ?? DAWDEX_ROOMS[0]
