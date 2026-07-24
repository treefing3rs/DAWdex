import {InaccessibleProperty} from "@opendaw/lib-std"
import {Api} from "@opendaw/studio-scripting"
import {Chord, PPQN} from "@opendaw/lib-dsp"

const openDAW: Api = InaccessibleProperty("Not to be executed.")

// openDAW script editor (very early preview - under heavy construction)

const project = openDAW.newProject("Retro Game")
project.bpm = 125.0
project.output.volume = -6.0

const notes = []

for (let i = 0; i < 16; i++) {
    notes.push({position: i * PPQN.SemiQuaver, pitch: 60 + Chord.Major[i % Chord.Major.length]})
}

project
    .addInstrumentUnit("Vaporisateur")
    .addNoteTrack()
    .addRegion({duration: PPQN.Bar * 4, loopDuration: PPQN.Bar})
    .addEvents(notes)
project.openInStudio()