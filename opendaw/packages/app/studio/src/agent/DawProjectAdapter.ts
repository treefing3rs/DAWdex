import {clamp, int} from "@opendaw/lib-std"
import {PPQN, ppqn} from "@opendaw/lib-dsp"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {StudioService} from "@/service/StudioService"
import {
    AgentPlan,
    CreateInstrumentAction,
    DawAction,
    DawProjectSnapshot,
    NotePattern
} from "./AgentProtocol"

type CompiledNote = {
    readonly position: ppqn
    readonly duration: ppqn
    readonly pitch: int
    readonly velocity: number
}

const progression = [
    {offset: 0, intervals: [0, 3, 7]},
    {offset: -4, intervals: [0, 4, 7]},
    {offset: 3, intervals: [0, 4, 7]},
    {offset: -2, intervals: [0, 4, 7]}
] as const

const compilePattern = (pattern: NotePattern, bars: int, rootMidi: int,
                        velocity: number, density: number): ReadonlyArray<CompiledNote> => {
    const notes: Array<CompiledNote> = []
    for (let bar = 0; bar < bars; bar++) {
        const chord = progression[bar % progression.length]
        const barPosition = bar * PPQN.Bar
        if (pattern === "bass") {
            const pulses = density < 0.55 ? 2 : 4
            const step = PPQN.Bar / pulses
            for (let pulse = 0; pulse < pulses; pulse++) {
                notes.push({
                    position: barPosition + pulse * step,
                    duration: step * 0.82,
                    pitch: rootMidi + chord.offset - 12,
                    velocity
                })
            }
        } else if (pattern === "chords") {
            chord.intervals.forEach(interval => notes.push({
                position: barPosition,
                duration: PPQN.Bar * 0.88,
                pitch: rootMidi + chord.offset + interval,
                velocity: velocity * 0.86
            }))
        } else if (pattern === "pulse") {
            const pulses = density < 0.65 ? 2 : 4
            const step = PPQN.Bar / pulses
            for (let pulse = 0; pulse < pulses; pulse++) {
                chord.intervals.forEach(interval => notes.push({
                    position: barPosition + pulse * step,
                    duration: step * 0.62,
                    pitch: rootMidi + chord.offset + interval,
                    velocity: velocity * (pulse === 0 ? 1.0 : 0.82)
                }))
            }
        } else {
            const scale = [0, 2, 3, 5, 7, 8, 10]
            const pulses = density < 0.55 ? 4 : 8
            const step = PPQN.Bar / pulses
            for (let pulse = 0; pulse < pulses; pulse++) {
                const scaleIndex = (bar * 2 + pulse * 2 + (pulse % 3)) % scale.length
                notes.push({
                    position: barPosition + pulse * step,
                    duration: step * 0.72,
                    pitch: rootMidi + chord.offset + scale[scaleIndex],
                    velocity: velocity * (pulse % 4 === 0 ? 1.0 : 0.78)
                })
            }
        }
    }
    return notes
}

export type ApplyResult = {
    readonly success: boolean
    readonly message: string
}

export class DawProjectAdapter {
    readonly #service: StudioService

    constructor(service: StudioService) {this.#service = service}

    snapshot(): DawProjectSnapshot {
        if (!this.#service.hasProfile) {return {hasProject: false, bpm: 120, tracks: []}}
        const project = this.#service.project
        const tracks = project.rootBoxAdapter.audioUnits.adapters()
            .filter(adapter => adapter.isInstrument)
            .map(adapter => ({
                name: adapter.label,
                trackCount: adapter.tracks.values().length,
                regionCount: adapter.tracks.values()
                    .reduce((count, track) => count + track.regions.collection.asArray().length, 0)
            }))
        return {
            hasProject: true,
            bpm: project.timelineBox.bpm.getValue(),
            tracks
        }
    }

    async apply(plan: AgentPlan): Promise<ApplyResult> {
        if (!this.#service.hasProfile) {await this.#service.newProject()}
        if (!this.#service.hasProfile) {return {success: false, message: "No project is open."}}
        const project = this.#service.project
        project.editing.modify(() => plan.actions.forEach(action => this.#applyAction(action)))
        return {
            success: true,
            message: `Applied ${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"} as one undo step.`
        }
    }

    undo(): ApplyResult {
        if (!this.#service.hasProfile || !this.#service.project.editing.canUndo()) {
            return {success: false, message: "Nothing to undo."}
        }
        this.#service.project.editing.undo()
        return {success: true, message: "Reverted the last DAWdex edit."}
    }

    #applyAction(action: DawAction): void {
        switch (action.type) {
            case "set-tempo":
                this.#service.project.api.setBpm(clamp(action.bpm, 30, 240))
                return
            case "create-instrument":
                this.#createInstrument(action)
                return
        }
    }

    #createInstrument(action: CreateInstrumentAction): void {
        const project = this.#service.project
        const startBar = clamp(Math.round(action.startBar), 1, 128)
        const bars = clamp(Math.round(action.bars), 1, 16)
        const rootMidi = clamp(Math.round(action.rootMidi), 24, 84)
        const velocity = clamp(action.velocity, 0.1, 1.0)
        const density = clamp(action.density, 0.1, 1.0)
        const {trackBox} = project.api.createInstrument(InstrumentFactories.Vaporisateur, {name: action.name})
        const region = project.api.createNoteRegion({
            trackBox,
            position: (startBar - 1) * PPQN.Bar,
            duration: bars * PPQN.Bar,
            name: action.name
        })
        compilePattern(action.pattern, bars, rootMidi, velocity, density).forEach(note =>
            project.api.createNoteEvent({
                owner: region,
                position: note.position,
                duration: note.duration,
                pitch: note.pitch,
                velocity: note.velocity
            }))
    }
}
