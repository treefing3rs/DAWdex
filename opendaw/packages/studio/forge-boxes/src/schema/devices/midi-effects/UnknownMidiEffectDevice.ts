import {BoxSchema} from "@opendaw/lib-box-forge"
import {Pointers} from "@opendaw/studio-enums"
import {DeviceFactory} from "../../std/DeviceFactory"

export const UnknownMidiEffectDevice: BoxSchema<Pointers> =
    DeviceFactory.createMidiEffect("UnknownMidiEffectDeviceBox", {
        10: {type: "string", name: "comment"}
    })