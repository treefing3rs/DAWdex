import {AnyDevice, AudioUnit, ValueRegion, ValueRegionProps, ValueTrack} from "../Api"
import {ValueRegionImpl} from "./ValueRegionImpl"
import {AudioUnitImpl} from "./AudioUnitImpl"

export class ValueTrackImpl<
    DEVICE extends AnyDevice = AnyDevice, PARAMETER extends keyof DEVICE = keyof DEVICE> implements ValueTrack {
    readonly audioUnit: AudioUnit
    readonly device: DEVICE
    readonly parameter: PARAMETER
    readonly #regions: Array<ValueRegionImpl>

    enabled: boolean

    constructor(audioUnit: AudioUnitImpl, device: DEVICE, parameter: PARAMETER, props?: Partial<ValueTrack>) {
        this.audioUnit = audioUnit
        this.device = device
        this.parameter = parameter
        this.enabled = props?.enabled ?? true
        this.#regions = []
    }

    addRegion(props?: ValueRegionProps): ValueRegion {
        const region = new ValueRegionImpl(this, props)
        this.#regions.push(region)
        return region
    }

    get regions(): ReadonlyArray<ValueRegionImpl> {return this.#regions}
}
