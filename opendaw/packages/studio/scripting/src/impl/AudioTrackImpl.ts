import {AudioRegion, AudioTrack, AudioUnit} from "../Api"
import {AudioRegionImpl} from "./AudioRegionImpl"
import {AudioUnitImpl} from "./AudioUnitImpl"

export class AudioTrackImpl implements AudioTrack {
    readonly audioUnit: AudioUnit
    readonly #regions: AudioRegionImpl[]

    enabled: boolean

    constructor(audioUnit: AudioUnitImpl, props?: Partial<AudioTrack>) {
        this.audioUnit = audioUnit
        this.#regions = []

        this.enabled = props?.enabled ?? true
    }

    addRegion(sample: Sample, props?: Partial<AudioRegion>): AudioRegion {
        const region = new AudioRegionImpl(this, sample, props)
        this.#regions.push(region)
        return region
    }

    get regions(): ReadonlyArray<AudioRegionImpl> {return this.#regions}
}