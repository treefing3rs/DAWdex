import {clamp} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {
    AudioUnitBoxAdapter,
    InstrumentFactories,
    NoteRegionBoxAdapter,
    TrackBoxAdapter,
    TrackType
} from "@opendaw/studio-adapters"
import type {StudioService} from "@/service/StudioService"
import {
    AgentPlan,
    DawControlAction,
    DawProjectSnapshot,
    UpsertRoleTrackAction
} from "./AgentProtocol"
import {DawControlExecutor} from "./DawControlExecutor"
import {
    CompiledNote,
    midiFingerprint
} from "./music/PatternCompiler"
import {
    dawdexTrackName,
    DawdexTrackMetadata,
    readDawdexTrackMetadata
} from "./music/DawdexTrackMetadata"
import {hasDuplicateMidiFingerprint} from "./music/QualityGate"
import {
    compileMidiAsset,
    loadMidiAsset,
    MidiAssetLoader
} from "./music/MidiAsset"
import {
    applyTrackSound,
    readTrackSound,
    sanitizeTrackSoundDesign,
    soundDesignFingerprint
} from "./music/TrackSound"

type InstrumentTrack = {
    readonly audioUnit: AudioUnitBoxAdapter
    readonly track: TrackBoxAdapter
    readonly metadata: DawdexTrackMetadata | null
    readonly fingerprint: string | null
    readonly soundFingerprint: string | null
}

type PreparedUpsert = {
    readonly action: UpsertRoleTrackAction
    readonly target: InstrumentTrack | null
    readonly notes: ReadonlyArray<CompiledNote>
    readonly fingerprint: string
    readonly replaceMidi: boolean
}

type PreparationResult =
    | {readonly success: true, readonly operations: ReadonlyArray<PreparedUpsert>, readonly skipped: number}
    | {readonly success: false, readonly message: string}

export type ApplyResult = {
    readonly success: boolean
    readonly message: string
}

const absoluteNotes = (notes: ReadonlyArray<CompiledNote>, startBar: number): ReadonlyArray<CompiledNote> => {
    const offset = (startBar - 1) * PPQN.Bar
    return notes.map(note => ({...note, position: note.position + offset}))
}

const notesForRegion = (region: NoteRegionBoxAdapter): ReadonlyArray<CompiledNote> =>
    region.optCollection.mapOr(collection => collection.events.asArray().map(event => ({
        position: region.position + event.position,
        duration: event.duration,
        pitch: event.pitch,
        velocity: event.velocity
    })), [])

export class DawProjectAdapter {
    readonly #service: StudioService
    readonly #midiAssetLoader: MidiAssetLoader
    readonly #controls: DawControlExecutor

    constructor(service: StudioService, midiAssetLoader: MidiAssetLoader = loadMidiAsset) {
        this.#service = service
        this.#midiAssetLoader = midiAssetLoader
        this.#controls = new DawControlExecutor(service)
    }

    snapshot(): DawProjectSnapshot {
        if (!this.#service.hasProfile) {
            return {
                hasProject: false,
                bpm: 120,
                tracks: [],
                transport: this.#controls.transportSnapshot(),
                buses: [],
                assets: [],
                capabilities: this.#controls.capabilitySnapshot()
            }
        }
        const project = this.#service.project
        const tracks = project.rootBoxAdapter.audioUnits.adapters()
            .filter(audioUnit => audioUnit.isInstrument)
            .flatMap(audioUnit => audioUnit.tracks.values()
                .filter(track => track.type === TrackType.Notes)
                .map(track => {
                    const noteRegions = track.regions.collection.asArray()
                        .filter(region => region.isNoteRegion())
                    const regionSnapshots = noteRegions.map(region => {
                        const notes = notesForRegion(region)
                        return {
                            id: region.address.toString(),
                            name: region.label,
                            position: region.position,
                            duration: region.duration,
                            loopOffset: region.loopOffset,
                            loopDuration: region.loopDuration,
                            mute: region.mute,
                            noteCount: notes.length,
                            midiFingerprint: notes.length === 0 ? null : midiFingerprint(notes)
                        }
                    })
                    const notes = noteRegions.flatMap(notesForRegion)
                    const metadata = readDawdexTrackMetadata(audioUnit.label)
                    return {
                        id: track.address.toString(),
                        name: audioUnit.label,
                        trackCount: audioUnit.tracks.values().length,
                        regionCount: noteRegions.length,
                        generated: metadata !== null,
                        role: metadata?.role ?? null,
                        style: metadata?.style ?? null,
                        midiFingerprint: notes.length === 0 ? null : midiFingerprint(notes),
                        sound: readTrackSound(audioUnit),
                        regions: regionSnapshots,
                        devices: this.#controls.devices(audioUnit),
                        sends: this.#controls.sends(audioUnit)
                    }
                }))
        return {
            hasProject: true,
            bpm: project.timelineBox.bpm.getValue(),
            tracks,
            transport: this.#controls.transportSnapshot(),
            buses: this.#controls.buses(),
            assets: this.#controls.assets(),
            capabilities: this.#controls.capabilitySnapshot()
        }
    }

    async apply(plan: AgentPlan): Promise<ApplyResult> {
        if (!this.#service.hasProfile) {await this.#service.newProject()}
        if (!this.#service.hasProfile) {return {success: false, message: "No project is open."}}
        const controlActions = plan.actions
            .filter((action): action is DawControlAction => action.type === "control")
        for (const action of controlActions) {
            const failure = this.#controls.validate(action)
            if (failure !== null) {return {success: false, message: failure}}
        }
        const prepared = await this.#prepare(plan)
        if (!prepared.success) {return {success: false, message: prepared.message}}
        const project = this.#service.project
        const tempoActions = plan.actions.filter(action => action.type === "set-tempo")
        const editControlActions = controlActions.filter(action => action.command !== "transport")
        const transportActions = controlActions.filter(action => action.command === "transport")
        const changesTempo = tempoActions.some(action =>
            Math.round(project.timelineBox.bpm.getValue()) !== Math.round(action.bpm))
        if (prepared.operations.length === 0
            && !changesTempo
            && editControlActions.length === 0
            && transportActions.length === 0) {
            return {
                success: true,
                message: prepared.skipped === 0
                    ? "The plan is already reflected in the project."
                    : `Skipped ${prepared.skipped} duplicate MIDI operation${prepared.skipped === 1 ? "" : "s"}.`
            }
        }
        if (prepared.operations.length > 0 || changesTempo || editControlActions.length > 0) {
            try {
                project.editing.modify(() => {
                    tempoActions.forEach(action => project.api.setBpm(clamp(action.bpm, 30, 240)))
                    prepared.operations.forEach(operation => this.#applyUpsert(operation))
                    editControlActions.forEach(action => this.#controls.applyEdit(action))
                })
            } catch (error) {
                return {success: false, message: `Could not apply DAW control: ${String(error)}`}
            }
        }
        const snapshot = this.snapshot()
        const verificationFailures = prepared.operations.flatMap(operation => {
            const expectedId = operation.target?.track.address.toString()
            const actual = snapshot.tracks.find(track =>
                (expectedId === undefined || track.id === expectedId)
                && track.generated
                && track.role === operation.action.role
                && track.style === operation.action.style)
            return actual?.midiFingerprint === operation.fingerprint
                && actual.sound.fingerprint === soundDesignFingerprint(operation.action.sound)
                ? []
                : [{
                    role: operation.action.role,
                    expected: `${operation.fingerprint}/${soundDesignFingerprint(operation.action.sound)}`,
                    actual: actual === undefined
                        ? "missing"
                        : `${actual.midiFingerprint}/${actual.sound.fingerprint}`
                }]
        })
        if (verificationFailures.length > 0) {
            project.editing.undo()
            const details = verificationFailures
                .map(({role, expected, actual}) => `${role}: expected ${expected}, got ${actual}`)
                .join("; ")
            return {
                success: false,
                message: `DAWdex could not verify the MIDI replacement; the edit was reverted. ${details}`
            }
        }
        try {
            transportActions.forEach(action => this.#controls.applyTransport(action))
        } catch (error) {
            return {success: false, message: `The edit succeeded, but transport control failed: ${String(error)}`}
        }
        const changed = prepared.operations.length
            + (changesTempo ? 1 : 0)
            + editControlActions.length
            + transportActions.length
        const skipped = prepared.skipped === 0 ? "" : ` Skipped ${prepared.skipped} duplicate.`
        return {
            success: true,
            message: `Applied ${changed} change${changed === 1 ? "" : "s"} as one undo step.${skipped}`
        }
    }

    undo(): ApplyResult {
        if (!this.#service.hasProfile || !this.#service.project.editing.canUndo()) {
            return {success: false, message: "Nothing to undo."}
        }
        this.#service.project.editing.undo()
        return {success: true, message: "Reverted the last DAWdex edit."}
    }

    // 走带播放/暂停（演播大厅 REC 监视器热点用；复用能力注册表校验过的 transport 通道）
    setTransport(playing: boolean): ApplyResult {
        if (!this.#service.hasProfile) {
            return {success: false, message: "没有打开的工程，走带无法控制。"}
        }
        try {
            this.#controls.applyTransport({
                type: "control",
                command: "transport",
                operation: playing ? "play" : "pause",
                targetTrackId: null,
                targetRegionId: null,
                targetDeviceId: null,
                targetBusId: null,
                kind: "",
                name: "",
                assetId: "",
                index: 0,
                enabled: true,
                value: 0,
                secondaryValue: 0,
                seed: 0,
                parameters: [],
                points: []
            })
            return {success: true, message: playing ? "走带开始播放。" : "走带已暂停。"}
        } catch (error) {
            return {success: false, message: `走带控制失败：${String(error)}`}
        }
    }

    #instrumentTracks(): ReadonlyArray<InstrumentTrack> {
        return this.#service.project.rootBoxAdapter.audioUnits.adapters()
            .filter(audioUnit => audioUnit.isInstrument)
            .flatMap(audioUnit => audioUnit.tracks.values()
                .filter(track => track.type === TrackType.Notes)
                .map(track => {
                    const notes = track.regions.collection.asArray()
                        .filter(region => region.isNoteRegion())
                        .flatMap(notesForRegion)
                    return {
                        audioUnit,
                        track,
                        metadata: readDawdexTrackMetadata(audioUnit.label),
                        fingerprint: notes.length === 0 ? null : midiFingerprint(notes),
                        soundFingerprint: readTrackSound(audioUnit).fingerprint
                    }
                }))
    }

    async #prepare(plan: AgentPlan): Promise<PreparationResult> {
        const tracks = this.#instrumentTracks()
        const fingerprints = new Map<string, string>()
        tracks.forEach(({track, fingerprint}) => {
            if (fingerprint !== null) {fingerprints.set(track.address.toString(), fingerprint)}
        })
        const operations: Array<PreparedUpsert> = []
        let skipped = 0
        for (const rawAction of plan.actions) {
            if (rawAction.type === "set-tempo") {
                if (Math.round(rawAction.bpm) !== Math.round(plan.brief.bpm)) {
                    return {success: false, message: "Tempo action does not match the MusicBrief."}
                }
                continue
            }
            if (rawAction.type === "control") {continue}
            if (rawAction.style !== plan.brief.style || !plan.brief.targetRoles.includes(rawAction.role)) {
                return {success: false, message: `Invalid ${rawAction.role} operation for this MusicBrief.`}
            }
            if (Math.round(rawAction.bars) > plan.brief.bars) {
                return {success: false, message: `${rawAction.role} length exceeds the MusicBrief (${rawAction.bars} > ${plan.brief.bars}).`}
            }
            const exactTarget = rawAction.targetTrackId === null
                ? null
                : tracks.find(({track}) => track.address.toString() === rawAction.targetTrackId) ?? null
            if (rawAction.targetTrackId !== null && exactTarget === null) {
                return {success: false, message: `Target track ${rawAction.targetTrackId} no longer exists.`}
            }
            if (exactTarget !== null
                && (exactTarget.metadata === null || exactTarget.metadata.role !== rawAction.role)) {
                return {success: false, message: `Target track is not the DAWdex ${rawAction.role} role.`}
            }
            if (exactTarget !== null && plan.brief.preserveTrackIds.includes(exactTarget.track.address.toString())) {
                return {success: false, message: `The plan tried to replace a preserved ${rawAction.role} track.`}
            }
            if (plan.brief.intent === "add" && exactTarget !== null) {
                return {success: false, message: `An add plan cannot replace the existing ${rawAction.role} track.`}
            }
            const implicitTarget = plan.brief.intent === "add"
                ? null
                : tracks.find(({metadata, track}) =>
                    metadata?.role === rawAction.role
                    && !plan.brief.preserveTrackIds.includes(track.address.toString())) ?? null
            const target = exactTarget ?? implicitTarget
            if (rawAction.mode === "replace" && target === null) {
                return {success: false, message: `No generated ${rawAction.role} track is available to replace.`}
            }
            const action: UpsertRoleTrackAction = {
                ...rawAction,
                mode: target === null ? "create" : "replace",
                targetTrackId: target?.track.address.toString() ?? null,
                startBar: clamp(Math.round(rawAction.startBar), 1, 128),
                bars: clamp(Math.round(rawAction.bars), 1, 16),
                rootMidi: clamp(Math.round(rawAction.rootMidi), 24, 84),
                seed: clamp(Math.round(rawAction.seed), 0, 0x7FFFFFFF),
                density: clamp(rawAction.density, 0.1, 1),
                energy: clamp(rawAction.energy, 0.1, 1),
                sound: sanitizeTrackSoundDesign(rawAction.sound)
            }
            let notes: ReadonlyArray<CompiledNote>
            try {
                const buffer = await this.#midiAssetLoader(action.midiAssetId)
                notes = compileMidiAsset(buffer, action.role, action.bars)
            } catch (error) {
                return {
                    success: false,
                    message: `Could not load ${action.role} MIDI asset "${action.midiAssetPath}": ${String(error)}`
                }
            }
            const fingerprint = midiFingerprint(absoluteNotes(notes, action.startBar))
            const targetId = target?.track.address.toString()
            const targetFingerprint = targetId === undefined ? null : fingerprints.get(targetId) ?? null
            const replaceMidi = targetFingerprint !== fingerprint
            const changesSound = target?.soundFingerprint !== soundDesignFingerprint(action.sound)
            const changesMetadata = target?.metadata?.style !== action.style
            if (!replaceMidi && !changesSound && !changesMetadata) {
                skipped++
                continue
            }
            const duplicate = hasDuplicateMidiFingerprint(
                fingerprint,
                Array.from(fingerprints, ([id, value]) => ({id, fingerprint: value})),
                targetId ?? null
            )
            if (duplicate) {
                skipped++
                continue
            }
            if (targetId !== undefined) {fingerprints.delete(targetId)}
            fingerprints.set(targetId ?? `new:${operations.length}`, fingerprint)
            operations.push({action, target, notes, fingerprint, replaceMidi})
        }
        return {success: true, operations, skipped}
    }

    #applyUpsert({action, target, notes, replaceMidi}: PreparedUpsert): void {
        const project = this.#service.project
        const name = dawdexTrackName(action.role, action.style)
        let trackBox
        let audioUnit: AudioUnitBoxAdapter
        if (target === null) {
            const product = project.api.createInstrument(InstrumentFactories.Vaporisateur, {name})
            trackBox = product.trackBox
            audioUnit = project.boxAdapters.adapterFor(product.audioUnitBox, AudioUnitBoxAdapter)
        } else {
            target.track.targetName = name
            trackBox = target.track.box
            audioUnit = target.audioUnit
        }
        applyTrackSound(project, audioUnit, action.sound)
        if (target !== null) {target.track.targetName = name}
        if (target === null || replaceMidi) {
            if (target !== null) {
                target.track.regions.collection.asArray().forEach(region => region.box.delete())
            }
            const region = project.api.createNoteRegion({
                trackBox,
                position: (action.startBar - 1) * PPQN.Bar,
                duration: action.bars * PPQN.Bar,
                name
            })
            notes.forEach(note => project.api.createNoteEvent({
                owner: region,
                position: note.position,
                duration: note.duration,
                pitch: note.pitch,
                velocity: note.velocity
            }))
        }
    }
}
