import {MidiDevices} from "@opendaw/studio-core"
import {Notifier, Observer, Subscription} from "@opendaw/lib-std"

export class ShadertoyMIDIOutput {
    static readonly #notifier: Notifier<Uint8Array> = new Notifier()

    static subscribe(observer: Observer<Uint8Array>): Subscription {
        return this.#notifier.subscribe(observer)
    }

    static readonly Default = MidiDevices.createSoftwareMIDIOutput(
        message => this.#notifier.notify(message), "Shadertoy", "openDAW-shadertoy")
}