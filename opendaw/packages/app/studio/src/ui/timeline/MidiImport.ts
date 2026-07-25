import {
    Arrays,
    DefaultObservableValue,
    Errors,
    int,
    isDefined,
    Maybe,
    quantizeCeil,
    RuntimeNotifier,
    tryCatch,
    UUID
} from "@opendaw/lib-std"
import {BoxEditing} from "@opendaw/lib-box"
import {NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter, ColorCodes, TrackType} from "@opendaw/studio-adapters"
import {PPQN, ppqn} from "@opendaw/lib-dsp"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {Promises, Wait} from "@opendaw/lib-runtime"
import {Files} from "@opendaw/lib-dom"
import {Project} from "@opendaw/studio-core"
import {MidiFile} from "@opendaw/lib-midi"
import {decodeMidiNoteSpans} from "@/midi/MidiNoteSpans"

export namespace MidiImport {
    export const toTracks = async (project: Project, audioUnitBoxAdapter: AudioUnitBoxAdapter) => {
        const browseResult = await Promises.tryCatch(Files.open())
        if (browseResult.status === "rejected") {
            if (Errors.isAbort(browseResult.error) || Errors.isNotAllowed(browseResult.error)) {return}
            await Dialogs.info({headline: "File Access Error", message: String(browseResult.error)})
            return
        }
        const [file] = browseResult.value
        const readResult = await Promises.tryCatch(file.arrayBuffer())
        if (readResult.status === "rejected") {
            await Dialogs.info({
                headline: "File Read Error",
                message: `'${file.name}' could not be read. The file may be on an inaccessible location.`
            })
            return
        }
        const progress = new DefaultObservableValue(0.0)
        const dialog = RuntimeNotifier.progress({headline: "Import Midi", progress})
        await Wait.frame()
        const formatResult = tryCatch(() => MidiFile.decoder(readResult.value).decode())
        if (formatResult.status === "failure") {
            dialog.terminate()
            Dialogs.info({message: String(formatResult.error)}).then()
            return
        }
        const {value: format} = formatResult
        const {boxGraph, editing} = project
        let reuseTrackBox: Maybe<TrackBox> = Arrays.peekLast(audioUnitBoxAdapter.tracks.collection.adapters())?.box
        let trackIndex: int = 0
        if (isDefined(reuseTrackBox)) {
            if (reuseTrackBox.type.getValue() === TrackType.Notes && reuseTrackBox.regions.pointerHub.isEmpty()) {
                trackIndex = reuseTrackBox.index.getValue()
            } else {
                trackIndex = reuseTrackBox.index.getValue() + 1
                reuseTrackBox = null
            }
        }
        let lastTime = Date.now()
        function* generate() {
            for (const {channel, notes: midiNotes} of decodeMidiNoteSpans(format)) {
                console.debug(`Importing ${midiNotes.length} notes of channel #${channel}.`)
                const notes: Array<{ position: ppqn, duration: ppqn, pitch: int, velocity: number }> = []
                let duration = 0 | 0
                for (const [index, midiNote] of midiNotes.entries()) {
                    const position = PPQN.fromSignature(midiNote.ticks / format.timeDivision, 4) | 0
                    const noteDuration = Math.max(
                        1,
                        PPQN.fromSignature(midiNote.durationTicks / format.timeDivision, 4) | 0
                    )
                    notes.push({
                        position,
                        duration: noteDuration,
                        pitch: midiNote.pitch,
                        velocity: midiNote.velocity
                    })
                    duration = Math.max(duration, position + noteDuration)
                    progress.setValue(index / midiNotes.length)
                    if (Date.now() - lastTime > 16.0) {
                        lastTime = Date.now()
                        yield
                    }
                }
                duration = quantizeCeil(duration, PPQN.Bar)
                if (duration === 0) {
                    console.warn(`Channel #${channel}: no playable notes, skipping region.`)
                    continue
                }
                let trackBox: TrackBox
                if (isDefined(reuseTrackBox)) {
                    trackBox = reuseTrackBox
                    reuseTrackBox = null
                    trackIndex++
                } else {
                    trackBox = TrackBox.create(boxGraph, UUID.generate(), box => {
                        box.type.setValue(TrackType.Notes)
                        box.tracks.refer(audioUnitBoxAdapter.box.tracks)
                        box.index.setValue(trackIndex++)
                        box.target.refer(audioUnitBoxAdapter.box)
                    })
                }
                const collection = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                notes.forEach(({position, duration: noteDuration, pitch, velocity}) => {
                    NoteEventBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(position)
                        box.duration.setValue(noteDuration)
                        box.pitch.setValue(pitch)
                        box.velocity.setValue(velocity)
                        box.events.refer(collection.events)
                    })
                })
                NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                    box.position.setValue(0)
                    box.duration.setValue(duration)
                    box.loopDuration.setValue(duration)
                    box.events.refer(collection.owners)
                    box.hue.setValue(ColorCodes.forTrackType(TrackType.Notes))
                    box.label.setValue(`Ch#${channel}`)
                    box.regions.refer(trackBox.regions)
                })
            }
        }
        console.time("midi-import")
        // TODO Remove the cast by refactoring
        // use modify and revertPending on error
        const boxEditing = editing as BoxEditing
        const modificationProcess = boxEditing.beginModification()
        const {status, error} = await Promises.tryCatch(Wait.complete(generate()))
        console.timeEnd("midi-import")
        if (status === "resolved") {
            modificationProcess.approve()
        } else {
            modificationProcess.revert()
            await Dialogs.info({headline: "Error Importing Midi-File", message: String(error)})
        }
        console.debug("finished import.")
        dialog.terminate()
    }
}
