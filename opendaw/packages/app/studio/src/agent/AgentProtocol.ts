export type AgentPlanSource = "model" | "local"
export type NotePattern = "bass" | "chords" | "pulse" | "lead"

export type ProjectTrackSnapshot = {
    readonly name: string
    readonly trackCount: number
    readonly regionCount: number
}

export type DawProjectSnapshot = {
    readonly hasProject: boolean
    readonly bpm: number
    readonly tracks: ReadonlyArray<ProjectTrackSnapshot>
}

export type SetTempoAction = {
    readonly type: "set-tempo"
    readonly bpm: number
}

export type CreateInstrumentAction = {
    readonly type: "create-instrument"
    readonly name: string
    readonly pattern: NotePattern
    readonly startBar: number
    readonly bars: number
    readonly rootMidi: number
    readonly velocity: number
    readonly density: number
}

export type DawAction = SetTempoAction | CreateInstrumentAction

export type AgentPlan = {
    readonly id: string
    readonly prompt: string
    readonly title: string
    readonly summary: string
    readonly rationale: ReadonlyArray<string>
    readonly actions: ReadonlyArray<DawAction>
    readonly source: AgentPlanSource
}

export namespace DawAction {
    export const describe = (action: DawAction): string => {
        switch (action.type) {
            case "set-tempo":
                return `Set tempo to ${Math.round(action.bpm)} BPM`
            case "create-instrument":
                return `Create ${action.name} · ${action.pattern} · bars ${action.startBar}–${action.startBar + action.bars - 1}`
        }
    }
}
