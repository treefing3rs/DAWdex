import {describe, expect, it} from "vitest"
import {dawdexTrackName, readDawdexTrackMetadata} from "./DawdexTrackMetadata"

describe("DawdexTrackMetadata", () => {
    it("recognizes current drums, bass, and keys labels", () => {
        expect(readDawdexTrackMetadata(dawdexTrackName("drums", "dubstep")))
            .toEqual({role: "drums", style: "dubstep"})
        expect(readDawdexTrackMetadata(dawdexTrackName("bass", "rnb")))
            .toEqual({role: "bass", style: "rnb"})
        expect(readDawdexTrackMetadata(dawdexTrackName("keys", "rnb")))
            .toEqual({role: "keys", style: "rnb"})
    })

    it("maps legacy DAWdex chords and lead tracks to keys", () => {
        expect(readDawdexTrackMetadata("DAWdex Chords")).toEqual({role: "keys", style: null})
        expect(readDawdexTrackMetadata("DAWdex Lead")).toEqual({role: "keys", style: null})
    })

    it("does not claim user tracks", () => {
        expect(readDawdexTrackMetadata("User Bass")).toBeNull()
    })
})
