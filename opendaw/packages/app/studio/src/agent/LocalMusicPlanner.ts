import {isAbsent, isDefined, Nullable} from "@opendaw/lib-std"
import {AgentPlan, CreateInstrumentAction, DawProjectSnapshot, NotePattern} from "./AgentProtocol"

const includesAny = (text: string, words: ReadonlyArray<string>): boolean =>
    words.some(word => text.includes(word))

const extractTempo = (prompt: string): Nullable<number> => {
    const match = prompt.match(/(?:bpm|tempo|速度|节奏)\s*[:：]?\s*(\d{2,3})/i)
    if (isAbsent(match)) {return null}
    const value = Number(match[1])
    return Number.isFinite(value) && value >= 30 && value <= 240 ? value : null
}

const createInstrument = (name: string, pattern: NotePattern, startBar: number,
                          bars: number, rootMidi: number, density: number): CreateInstrumentAction => ({
    type: "create-instrument",
    name,
    pattern,
    startBar,
    bars,
    rootMidi,
    velocity: pattern === "bass" ? 0.82 : 0.72,
    density
})

export namespace LocalMusicPlanner {
    export const create = (prompt: string, snapshot: DawProjectSnapshot): AgentPlan => {
        const normalized = prompt.toLowerCase()
        const chorus = includesAny(normalized, ["副歌", "chorus", "更炸", "爆发"])
        const wantsBass = chorus || includesAny(normalized, ["贝斯", "bass", "低频"])
        const wantsChords = chorus || includesAny(normalized, ["和弦", "chord", "铺底", "氛围"])
        const preservesLead = includesAny(normalized, [
            "保留 lead", "保留lead", "保留主奏", "preserve the lead", "keep the lead"
        ])
        const wantsLead = !preservesLead && includesAny(normalized, ["旋律", "lead", "主奏", "hook"])
        const startBar = chorus ? 9 : 1
        const bars = chorus ? 8 : 4
        const density = includesAny(normalized, ["不要太满", "留白", "简单", "稀疏"]) ? 0.45 : 0.72
        const actions: Array<AgentPlan["actions"][number]> = []
        const tempo = extractTempo(prompt)
        if (isDefined(tempo) && Math.round(snapshot.bpm) !== tempo) {
            actions.push({type: "set-tempo", bpm: tempo})
        }
        if (wantsBass) {actions.push(createInstrument("DAWdex Bass", "bass", startBar, bars, 38, density))}
        if (wantsChords) {
            const pattern: NotePattern = density < 0.6 ? "chords" : "pulse"
            actions.push(createInstrument("DAWdex Chords", pattern, startBar, bars, 50, density))
        }
        if (wantsLead) {actions.push(createInstrument("DAWdex Lead", "lead", startBar, bars, 62, density))}
        if (actions.length === 0) {
            actions.push(createInstrument("DAWdex Idea", "lead", startBar, bars, 62, density))
        }
        const title = chorus ? "Build the chorus lift" : "Develop a musical idea"
        return {
            id: crypto.randomUUID(),
            prompt,
            title,
            summary: chorus
                ? "Add controlled low-end and harmonic motion in the chorus while leaving space for the lead."
                : "Create an editable MIDI idea that fits the current project.",
            rationale: [
                `Keep all notes editable inside openDAW`,
                `Apply the change as one undoable transaction`,
                `Use ${density < 0.6 ? "restrained" : "medium"} note density`
            ],
            actions,
            source: "local"
        }
    }
}
