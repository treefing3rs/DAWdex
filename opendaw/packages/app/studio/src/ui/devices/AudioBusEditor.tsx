import css from "./AudioBusEditor.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {IconSymbol} from "@opendaw/studio-enums"
import {AudioBusBoxAdapter} from "@opendaw/studio-adapters"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {DevicePeakMeter} from "@/ui/devices/panel/DevicePeakMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "Editor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: AudioBusBoxAdapter
}

export const AudioBusEditor = ({lifecycle, service, adapter}: Construct) => {
    const {project} = service
    return (
        <DeviceEditor lifecycle={lifecycle}
                      service={service}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forAudioUnitInput(parent, service, adapter.deviceHost())}
                      populateControls={() => false}
                      populateMeter={() => (
                          <DevicePeakMeter lifecycle={lifecycle}
                                           receiver={project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={IconSymbol.Merge}>
            <div className={className}>
                <span>audio-bus</span>
            </div>
        </DeviceEditor>
    )
}