import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {OpfsWorker, SamplePeakWorker} from "@opendaw/lib-fusion"
import {AudioData, TransientDetector, TransientProtocol} from "@opendaw/lib-dsp"

const messenger: Messenger = Messenger.for(self)

OpfsWorker.init(messenger)
SamplePeakWorker.install(messenger)

Communicator.executor(messenger.channel("transients"), new class implements TransientProtocol {
    async detect(audioData: AudioData): Promise<Array<number>> {
        return TransientDetector.detect(audioData)
    }
})

messenger.channel("initialize").send("ready")