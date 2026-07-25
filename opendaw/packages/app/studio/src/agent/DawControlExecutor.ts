import {clamp, isInstanceOf, UUID} from "@opendaw/lib-std"
import {Interpolation, PPQN} from "@opendaw/lib-dsp"
import {
    ApparatDeviceBox,
    AudioFileBox,
    AuxSendBox,
    NanoDeviceBox,
    NoteEventBox,
    PlayfieldDeviceBox,
    PlayfieldSampleBox,
    SoundfontDeviceBox,
    SoundfontFileBox,
    ValueEventBox,
    ValueEventCollectionBox,
    ValueRegionBox
} from "@opendaw/studio-boxes"
import {
    AudioBusBoxAdapter,
    AudioBusFactory,
    AudioUnitBoxAdapter,
    AutomatableParameterFieldAdapter,
    Devices,
    EffectDeviceBoxAdapter,
    InstrumentBox,
    InstrumentFactories,
    InstrumentFactory,
    InterpolationFieldAdapter,
    NoteRegionBoxAdapter,
    TrackBoxAdapter,
    TrackType
} from "@opendaw/studio-adapters"
import {AudioUnitType, Colors, IconSymbol} from "@opendaw/studio-enums"
import {EffectBox, EffectFactories, Project} from "@opendaw/studio-core"
import type {StudioService} from "@/service/StudioService"
import type {
    DawAuxSendSnapshot,
    DawAssetSnapshot,
    DawAutomationPoint,
    DawBusSnapshot,
    DawCapabilitySnapshot,
    DawControlAction,
    DawDeviceSnapshot,
    DawParameterSnapshot,
    DawTransportSnapshot
} from "./AgentProtocol"
import {
    defaultCapabilitySnapshot,
    parameterMap,
    SafeAudioEffectKinds,
    SafeInstrumentKinds,
    SafeMidiEffectKinds,
    validateControlEnvelope
} from "./DawCapabilityRegistry"
import {dawdexTrackName, readDawdexTrackMetadata} from "./music/DawdexTrackMetadata"

type ParameterOwner = {
    readonly namedParameter?: Readonly<Record<string, unknown>>
}

type EngineLike = {
    play(): void
    stop(reset?: boolean): void
    setPosition(position: number): void
    readonly position: {getValue(): number}
    readonly isPlaying: {getValue(): boolean}
}

const isParameter = (value: unknown): value is AutomatableParameterFieldAdapter =>
    value !== null
    && typeof value === "object"
    && "getUnitValue" in value
    && typeof value.getUnitValue === "function"
    && "setUnitValue" in value
    && typeof value.setUnitValue === "function"

const snapshotNumber = (value: number): number =>
    Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : value

const parameterEntries = (
    owner: ParameterOwner
): ReadonlyArray<readonly [string, AutomatableParameterFieldAdapter]> => {
    const result: Array<readonly [string, AutomatableParameterFieldAdapter]> = []
    const visit = (value: unknown, path: string): void => {
        if (isParameter(value)) {
            result.push([path, value])
            return
        }
        if (value === null || typeof value !== "object") {return}
        Object.entries(value).forEach(([key, child]) => visit(child, path.length === 0 ? key : `${path}.${key}`))
    }
    visit(owner.namedParameter ?? {}, "")
    return result
}

const deviceParameters = (owner: ParameterOwner): ReadonlyArray<DawParameterSnapshot> =>
    parameterEntries(owner).map(([key, parameter]) => {
        const print = parameter.getPrintValue()
        const value = parameter.getValue()
        return {
            key,
            name: parameter.name,
            value: typeof value === "boolean" ? value : snapshotNumber(Number(value)),
            unitValue: snapshotNumber(parameter.getUnitValue()),
            displayValue: `${print.value}${print.unit.length > 0 ? ` ${print.unit}` : ""}`,
            automated: parameter.track.nonEmpty()
        }
    })

const deviceSnapshot = (
    adapter: ParameterOwner & {
        readonly address: {toString(): string}
        readonly box: {name: string}
        readonly labelField?: {getValue(): string}
        readonly enabledField?: {getValue(): boolean}
        readonly indexField?: {getValue(): number}
    },
    category: DawDeviceSnapshot["category"]
): DawDeviceSnapshot => ({
    id: adapter.address.toString(),
    kind: adapter.box.name.replace(/DeviceBox$|Box$/, ""),
    category,
    label: adapter.labelField?.getValue() ?? (category === "channel-strip" ? "Channel Strip" : adapter.box.name),
    enabled: adapter.enabledField?.getValue() ?? true,
    index: adapter.indexField?.getValue() ?? -1,
    parameters: deviceParameters(adapter)
})

const targetAudioUnit = (project: Project, trackId: string): {
    readonly audioUnit: AudioUnitBoxAdapter
    readonly track: TrackBoxAdapter
} | null => {
    for (const audioUnit of project.rootBoxAdapter.audioUnits.adapters()) {
        const track = audioUnit.tracks.values().find(candidate => candidate.address.toString() === trackId)
        if (track !== undefined) {return {audioUnit, track}}
    }
    return null
}

const targetRegion = (
    track: TrackBoxAdapter,
    regionId: string
): NoteRegionBoxAdapter | null =>
    track.regions.collection.asArray()
        .find((region): region is NoteRegionBoxAdapter =>
            region.address.toString() === regionId && region.isNoteRegion()) ?? null

const targetBus = (project: Project, busId: string): AudioBusBoxAdapter | null =>
    project.rootBoxAdapter.audioBusses.adapters()
        .find(bus => bus.address.toString() === busId) ?? null

const findBoxById = (project: Project, id: string) =>
    Array.from(project.boxGraph.boxes()).find(box => box.address.toString() === id) ?? null

const effectAdapters = (audioUnit: AudioUnitBoxAdapter): ReadonlyArray<EffectDeviceBoxAdapter> => [
    ...audioUnit.midiEffects.mapOr(chain => chain.adapters(), []),
    ...audioUnit.audioEffects.mapOr(chain => chain.adapters(), [])
]

const targetDevice = (
    audioUnit: AudioUnitBoxAdapter,
    deviceId: string
): (ParameterOwner & {readonly address: {toString(): string}}) | null => {
    if (audioUnit.address.toString() === deviceId) {return audioUnit}
    const input = audioUnit.input.adapter().unwrapOrNull()
    if (input?.address.toString() === deviceId) {return input as typeof input & ParameterOwner}
    const effect = effectAdapters(audioUnit).find(candidate => candidate.address.toString() === deviceId)
    if (effect !== undefined) {return effect as typeof effect & ParameterOwner}
    const send = audioUnit.auxSends.adapters().find(candidate => candidate.address.toString() === deviceId)
    return send === undefined ? null : send as typeof send & ParameterOwner
}

const parameterFor = (
    audioUnit: AudioUnitBoxAdapter,
    deviceId: string,
    key: string
): AutomatableParameterFieldAdapter | null => {
    const device = targetDevice(audioUnit, deviceId)
    return device === null
        ? null
        : parameterEntries(device).find(([candidate]) => candidate === key)?.[1] ?? null
}

const setUnitParameters = (
    owner: ParameterOwner,
    parameters: DawControlAction["parameters"]
): void => {
    const available = new Map(parameterEntries(owner))
    for (const parameter of parameters) {
        const target = available.get(parameter.key)
        if (target === undefined) {throw new Error(`Unknown device parameter "${parameter.key}".`)}
        target.setUnitValue(clamp(parameter.numberValue, 0, 1))
    }
}

const lcg = (seed: number): (() => number) => {
    let state = seed >>> 0
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
    }
}

const automationBounds = (points: ReadonlyArray<DawAutomationPoint>): {from: number, to: number} => {
    const pulses = points.map(point => Math.round((point.bar - 1) * PPQN.Bar))
    return {from: Math.min(...pulses), to: Math.max(...pulses)}
}

export class DawControlExecutor {
    readonly #service: StudioService

    constructor(service: StudioService) {
        this.#service = service
    }

    transportSnapshot(): DawTransportSnapshot {
        if (!this.#service.hasProfile) {
            return {playing: false, position: 0, loopEnabled: false, loopFrom: 0, loopTo: 4 * PPQN.Bar}
        }
        const project = this.#service.project
        const loop = project.timelineBox.loopArea
        const engine = this.#engine()
        return {
            playing: engine?.isPlaying.getValue() ?? false,
            position: engine?.position.getValue() ?? 0,
            loopEnabled: loop.enabled.getValue(),
            loopFrom: loop.from.getValue(),
            loopTo: loop.to.getValue()
        }
    }

    capabilitySnapshot(): DawCapabilitySnapshot {
        const snapshot = defaultCapabilitySnapshot()
        if (!this.#service.hasProfile) {return snapshot}
        const boxes = Array.from(this.#service.project.boxGraph.boxes())
        return {
            ...snapshot,
            instruments: snapshot.instruments.map(instrument => ({
                ...instrument,
                available: instrument.available
                    || (instrument.kind === "Soundfont" && boxes.some(box => isInstanceOf(box, SoundfontFileBox)))
                    || (instrument.kind === "Nano" && boxes.some(box => isInstanceOf(box, AudioFileBox)))
                    || (instrument.kind === "Playfield" && boxes.some(box => isInstanceOf(box, PlayfieldDeviceBox)))
                    || (instrument.kind === "Apparat" && boxes.some(box => isInstanceOf(box, ApparatDeviceBox)))
            }))
        }
    }

    assets(): ReadonlyArray<DawAssetSnapshot> {
        if (!this.#service.hasProfile) {return []}
        const assets: Array<DawAssetSnapshot> = []
        for (const box of this.#service.project.boxGraph.boxes()) {
            if (isInstanceOf(box, AudioFileBox)) {
                assets.push({id: box.address.toString(), kind: "audio-file", name: box.fileName.getValue()})
            } else if (isInstanceOf(box, SoundfontFileBox)) {
                assets.push({id: box.address.toString(), kind: "soundfont", name: box.fileName.getValue()})
            } else if (isInstanceOf(box, PlayfieldDeviceBox)) {
                assets.push({id: box.address.toString(), kind: "playfield", name: box.label.getValue()})
            } else if (isInstanceOf(box, ApparatDeviceBox)) {
                assets.push({id: box.address.toString(), kind: "apparat", name: box.label.getValue()})
            }
        }
        return assets
    }

    devices(audioUnit: AudioUnitBoxAdapter): ReadonlyArray<DawDeviceSnapshot> {
        const input = audioUnit.input.adapter().unwrapOrNull()
        return [
            deviceSnapshot(audioUnit, "channel-strip"),
            ...(input === null ? [] : [deviceSnapshot(input as typeof input & ParameterOwner, "instrument")]),
            ...audioUnit.midiEffects.mapOr(chain =>
                chain.adapters().map(effect => deviceSnapshot(effect as typeof effect & ParameterOwner, "midi-effect")), []),
            ...audioUnit.audioEffects.mapOr(chain =>
                chain.adapters().map(effect => deviceSnapshot(effect as typeof effect & ParameterOwner, "audio-effect")), [])
        ]
    }

    sends(audioUnit: AudioUnitBoxAdapter): ReadonlyArray<DawAuxSendSnapshot> {
        return audioUnit.auxSends.adapters().flatMap(send => send.optTargetBus.mapOr(bus => [{
            id: send.address.toString(),
            targetBusId: bus.address.toString(),
            gainDb: snapshotNumber(send.sendGain.getValue()),
            panning: snapshotNumber(send.sendPan.getValue())
        }], []))
    }

    buses(): ReadonlyArray<DawBusSnapshot> {
        if (!this.#service.hasProfile) {return []}
        return this.#service.project.rootBoxAdapter.audioBusses.adapters().map(bus => {
            const audioUnit = bus.audioUnitBoxAdapter()
            return {
                id: bus.address.toString(),
                name: bus.labelField.getValue(),
                volumeDb: audioUnit.box.volume.getValue(),
                panning: audioUnit.box.panning.getValue(),
                mute: audioUnit.box.mute.getValue(),
                solo: audioUnit.box.solo.getValue(),
                channelStrip: deviceSnapshot(audioUnit, "channel-strip"),
                effects: audioUnit.audioEffects.mapOr(chain =>
                    chain.adapters().map(effect =>
                        deviceSnapshot(effect as typeof effect & ParameterOwner, "audio-effect")), [])
            }
        })
    }

    validate(action: DawControlAction): string | null {
        const envelopeFailure = validateControlEnvelope(action)
        if (envelopeFailure !== null) {return envelopeFailure}
        if (!this.#service.hasProfile) {
            return action.command === "transport" || action.command === "loop"
                ? "No project is open."
                : "No project is open."
        }
        const project = this.#service.project
        if (action.command === "transport" || action.command === "loop" || action.command === "bus") {
            return this.#validateGlobal(project, action)
        }
        const trackTarget = action.targetTrackId === null
            ? null
            : targetAudioUnit(project, action.targetTrackId)
        const busTarget = action.targetBusId === null
            ? null
            : targetBus(project, action.targetBusId)
        const targetUnit = trackTarget?.audioUnit ?? busTarget?.audioUnitBoxAdapter() ?? null
        if (targetUnit === null) {
            return action.targetTrackId !== null
                ? `Target track ${action.targetTrackId} no longer exists.`
                : `Target bus ${action.targetBusId} no longer exists.`
        }
        if (action.command === "region" || action.command === "midi-transform") {
            if (trackTarget === null || targetRegion(trackTarget.track, action.targetRegionId!) === null) {
                return `Target region ${action.targetRegionId} no longer exists on the track.`
            }
        }
        if (action.command === "instrument") {
            return this.#validateInstrument(project, action)
        }
        if (action.command === "effect") {
            return this.#validateEffect(targetUnit, action)
        }
        if (action.command === "device-parameter" || action.command === "automation") {
            const key = action.parameters[0]?.key ?? action.name
            if (key.length === 0) {return `${action.command} requires a parameter key.`}
            if (parameterFor(targetUnit, action.targetDeviceId!, key) === null) {
                return `Parameter "${key}" is not exposed by device ${action.targetDeviceId}.`
            }
        }
        if ((action.command === "send" || action.command === "routing")
            && action.operation !== "remove"
            && targetBus(project, action.targetBusId!) === null) {
            return `Target bus ${action.targetBusId} no longer exists.`
        }
        return null
    }

    applyEdit(action: DawControlAction): void {
        const project = this.#service.project
        if (action.command === "loop") {
            const loop = project.timelineBox.loopArea
            const from = Math.max(0, Math.round((action.value - 1) * PPQN.Bar))
            const duration = Math.max(PPQN.Bar / 4, Math.round(action.secondaryValue * PPQN.Bar))
            loop.from.setValue(from)
            loop.to.setValue(from + duration)
            loop.enabled.setValue(action.enabled)
            return
        }
        if (action.command === "bus") {
            this.#applyBus(project, action)
            return
        }
        if (action.command === "transport") {return}
        const trackTarget = action.targetTrackId === null
            ? null
            : targetAudioUnit(project, action.targetTrackId)
        const busTarget = action.targetBusId === null
            ? null
            : targetBus(project, action.targetBusId)
        const targetUnit = trackTarget?.audioUnit ?? busTarget?.audioUnitBoxAdapter() ?? null
        if (targetUnit === null) {throw new Error("Missing target track or bus")}
        switch (action.command) {
            case "track":
                this.#applyTrack(project, targetUnit, trackTarget!.track, action)
                return
            case "region":
                this.#applyRegion(project, trackTarget!.track, action)
                return
            case "midi-transform":
                this.#applyMidiTransform(project, trackTarget!.track, action)
                return
            case "instrument":
                this.#applyInstrument(project, targetUnit, action)
                return
            case "effect":
                this.#applyEffect(project, targetUnit, action)
                return
            case "device-parameter":
                this.#applyDeviceParameter(targetUnit, action)
                return
            case "automation":
                this.#applyAutomation(project, targetUnit, action)
                return
            case "send":
                this.#applySend(project, targetUnit, action)
                return
            case "routing":
                targetUnit.box.output.refer(targetBus(project, action.targetBusId!)!.box.input)
                return
            default:
                return
        }
    }

    applyTransport(action: DawControlAction): void {
        if (action.command !== "transport") {return}
        const engine = this.#engine()
        if (engine === null) {throw new Error("The audio engine is not available.")}
        switch (action.operation) {
            case "play":
                engine.play()
                break
            case "pause":
                engine.stop(false)
                break
            case "stop":
                engine.stop(true)
                break
            case "seek":
                engine.setPosition(Math.max(0, Math.round((action.value - 1) * PPQN.Bar)))
                break
        }
    }

    #validateGlobal(project: Project, action: DawControlAction): string | null {
        if (action.command === "transport" && this.#engine() === null) {
            return "The audio engine is not available."
        }
        if (action.command === "loop" && (action.value < 1 || action.secondaryValue <= 0)) {
            return "Loop start must be bar 1 or later and loop length must be positive."
        }
        if (action.command === "bus" && action.operation !== "create") {
            const bus = action.targetBusId === null ? null : targetBus(project, action.targetBusId)
            if (bus === null) {return `Target bus ${action.targetBusId} no longer exists.`}
            if (bus.audioUnitBoxAdapter().isOutput) {return "The primary output bus cannot be modified by this command."}
            if (action.operation === "delete") {
                const usedAsOutput = project.rootBoxAdapter.audioUnits.adapters()
                    .some(unit => unit.box.output.targetVertex
                        .mapOr(vertex => vertex === bus.box.input, false))
                const usedAsSend = project.rootBoxAdapter.audioUnits.adapters()
                    .some(unit => unit.auxSends.adapters()
                        .some(send => send.optTargetBus.mapOr(target => target.address.equals(bus.address), false)))
                if (usedAsOutput || usedAsSend) {return "The bus is still in use; reroute tracks and remove sends first."}
            }
        }
        return null
    }

    #validateInstrument(project: Project, action: DawControlAction): string | null {
        if (!(SafeInstrumentKinds as ReadonlyArray<string>).includes(action.kind)) {
            return `Unsupported instrument "${action.kind}".`
        }
        if (action.kind === "Vaporisateur" || action.kind === "MIDIOutput") {return null}
        if (action.assetId.length === 0) {return `${action.kind} requires an existing project asset ID.`}
        const asset = findBoxById(project, action.assetId)
        if (action.kind === "Soundfont" && !isInstanceOf(asset, SoundfontFileBox)) {
            return "Soundfont requires a SoundfontFile asset already loaded in the project."
        }
        if (action.kind === "Nano" && !isInstanceOf(asset, AudioFileBox)) {
            return "Nano requires an AudioFile asset already loaded in the project."
        }
        if (action.kind === "Playfield" && !isInstanceOf(asset, PlayfieldDeviceBox)) {
            return "Playfield requires an existing loaded Playfield device to clone."
        }
        if (action.kind === "Apparat" && !isInstanceOf(asset, ApparatDeviceBox)) {
            return "Apparat requires an existing trusted Apparat device to clone."
        }
        return null
    }

    #validateEffect(audioUnit: AudioUnitBoxAdapter, action: DawControlAction): string | null {
        if (action.operation === "add") {
            const supported = [
                ...SafeMidiEffectKinds,
                ...SafeAudioEffectKinds
            ] as ReadonlyArray<string>
            return supported.includes(action.kind) ? null : `Unsupported effect "${action.kind}".`
        }
        const effect = effectAdapters(audioUnit)
            .find(candidate => candidate.address.toString() === action.targetDeviceId)
        if (effect === undefined) {return `Target effect ${action.targetDeviceId} no longer exists.`}
        if (action.operation === "update") {
            const available = new Set(parameterEntries(effect as typeof effect & ParameterOwner)
                .map(([key]) => key))
            const unknown = action.parameters.find(parameter =>
                !available.has(parameter.key))
            if (unknown !== undefined) {return `Unknown effect parameter "${unknown.key}".`}
        }
        return null
    }

    #applyTrack(
        project: Project,
        audioUnit: AudioUnitBoxAdapter,
        track: TrackBoxAdapter,
        action: DawControlAction
    ): void {
        switch (action.operation) {
            case "rename": {
                const requested = action.name.trim().replace(/[·路]/g, "-").slice(0, 72)
                const current = track.targetName.unwrapOrElse("Track")
                const metadata = readDawdexTrackMetadata(current)
                track.targetName = metadata === null
                    ? requested || current
                    : requested.length === 0
                        ? current
                        : `DAWdex ${requested} ${dawdexTrackName(metadata.role, metadata.style ?? "custom")
                            .slice("DAWdex".length).trim()}`
                break
            }
            case "delete":
                project.api.deleteAudioUnit(audioUnit.box)
                break
            case "enable":
                track.enabled.setValue(true)
                break
            case "disable":
                track.enabled.setValue(false)
                break
        }
    }

    #applyRegion(project: Project, track: TrackBoxAdapter, action: DawControlAction): void {
        const region = targetRegion(track, action.targetRegionId!)!
        switch (action.operation) {
            case "move":
                region.position = Math.max(0, Math.round((action.value - 1) * PPQN.Bar))
                break
            case "resize":
                region.duration = Math.max(PPQN.Bar / 16, Math.round(action.value * PPQN.Bar))
                if (action.secondaryValue > 0) {
                    region.loopDuration = Math.max(PPQN.Bar / 16, Math.round(action.secondaryValue * PPQN.Bar))
                }
                break
            case "rename":
                region.box.label.setValue(action.name.trim().slice(0, 120) || "Notes")
                break
            case "mute":
                region.box.mute.setValue(true)
                break
            case "unmute":
                region.box.mute.setValue(false)
                break
            case "duplicate":
                project.api.duplicateRegion(region, {
                    position: action.value >= 1
                        ? Math.round((action.value - 1) * PPQN.Bar)
                        : undefined,
                    findFreeSpace: action.value < 1
                })
                break
            case "delete":
                region.box.delete()
                break
        }
    }

    #applyMidiTransform(project: Project, track: TrackBoxAdapter, action: DawControlAction): void {
        const region = targetRegion(track, action.targetRegionId!)!
        const events = region.optCollection.mapOr(collection => collection.events.asArray(), [])
        switch (action.operation) {
            case "transpose": {
                const semitones = clamp(Math.round(action.value), -36, 36)
                events.forEach(event => event.box.pitch.setValue(clamp(event.pitch + semitones, 0, 127)))
                break
            }
            case "velocity": {
                const scale = clamp(action.value, 0.1, 2)
                events.forEach(event => event.box.velocity.setValue(clamp(event.velocity * scale, 0.01, 1)))
                break
            }
            case "quantize": {
                const division = [4, 8, 16, 32].includes(Math.round(action.value))
                    ? Math.round(action.value)
                    : 16
                project.api.quantiseNotes(events.map(event => event.box as NoteEventBox), {
                    positionQuantisation: PPQN.Bar / division,
                    durationQuantisation: action.enabled ? PPQN.Bar / division : undefined
                })
                break
            }
            case "humanize": {
                const random = lcg(action.seed)
                const timing = clamp(Math.round(action.value), 0, PPQN.Bar / 16)
                const velocity = clamp(action.secondaryValue, 0, 0.5)
                events.forEach(event => {
                    const offset = Math.round((random() * 2 - 1) * timing)
                    const gain = 1 + (random() * 2 - 1) * velocity
                    event.box.position.setValue(Math.max(0, event.position + offset))
                    event.box.velocity.setValue(clamp(event.velocity * gain, 0.01, 1))
                })
                break
            }
        }
    }

    #applyInstrument(project: Project, audioUnit: AudioUnitBoxAdapter, action: DawControlAction): void {
        const current = audioUnit.input.adapter().unwrap("Target track has no instrument")
        const currentLabel = current.labelField.getValue()
        const factory = InstrumentFactories.Named[action.kind as keyof typeof InstrumentFactories.Named] as InstrumentFactory
        const asset = action.assetId.length === 0 ? null : findBoxById(project, action.assetId)
        const attempt = project.api.replaceMIDIInstrument(current.box as InstrumentBox, factory,
            action.kind === "Nano" && isInstanceOf(asset, AudioFileBox) ? asset : undefined)
        if (attempt.isFailure()) {throw new Error(attempt.failureReason())}
        const box = attempt.result()
        box.label.setValue(readDawdexTrackMetadata(currentLabel) === null
            ? action.name.trim().slice(0, 120) || factory.defaultName
            : currentLabel)
        if (isInstanceOf(box, SoundfontDeviceBox) && isInstanceOf(asset, SoundfontFileBox)) {
            box.file.refer(asset)
            box.presetIndex.setValue(clamp(Math.round(action.index), 0, 65535))
        } else if (isInstanceOf(box, PlayfieldDeviceBox) && isInstanceOf(asset, PlayfieldDeviceBox)) {
            asset.samples.pointerHub.incoming().forEach(({box: source}) => {
                if (!isInstanceOf(source, PlayfieldSampleBox)) {return}
                PlayfieldSampleBox.create(project.boxGraph, UUID.generate(), sample => {
                    sample.device.refer(box.samples)
                    sample.index.setValue(source.index.getValue())
                    sample.exclude.setValue(source.exclude.getValue())
                    source.file.targetVertex.ifSome(vertex => sample.file.refer(vertex.box))
                })
            })
        } else if (isInstanceOf(box, ApparatDeviceBox) && isInstanceOf(asset, ApparatDeviceBox)) {
            box.code.setValue(asset.code.getValue())
        } else if (isInstanceOf(box, NanoDeviceBox) && isInstanceOf(asset, AudioFileBox)) {
            box.file.refer(asset)
        }
        const adapter = audioUnit.input.adapter().unwrap("Replacement instrument is unavailable") as ParameterOwner
        setUnitParameters(adapter, action.parameters)
    }

    #applyEffect(project: Project, audioUnit: AudioUnitBoxAdapter, action: DawControlAction): void {
        if (action.operation === "add") {
            const factory = EffectFactories.MergedNamed[action.kind as keyof typeof EffectFactories.MergedNamed]
            const field = factory.type === "audio" ? audioUnit.box.audioEffects : audioUnit.box.midiEffects
            const box = project.api.insertEffect(field, factory, Math.max(0, Math.round(action.index)))
            const adapter = project.boxAdapters.adapterFor(box, Devices.isEffect)
            adapter.labelField.setValue(action.name.trim().slice(0, 120) || factory.defaultName)
            adapter.enabledField.setValue(action.enabled)
            setUnitParameters(adapter as typeof adapter & ParameterOwner, action.parameters)
            return
        }
        const effect = effectAdapters(audioUnit)
            .find(candidate => candidate.address.toString() === action.targetDeviceId)!
        switch (action.operation) {
            case "update":
                if (action.name.trim().length > 0) {effect.labelField.setValue(action.name.trim().slice(0, 120))}
                effect.enabledField.setValue(action.enabled)
                setUnitParameters(effect as typeof effect & ParameterOwner, action.parameters)
                break
            case "remove":
                Devices.deleteEffectDevices([effect])
                break
            case "move": {
                const field = effect.accepts === "audio" ? audioUnit.box.audioEffects : audioUnit.box.midiEffects
                project.api.moveEffects(field, [effect.box as EffectBox], Math.max(0, Math.round(action.index)))
                break
            }
            case "enable":
                effect.enabledField.setValue(true)
                break
            case "disable":
                effect.enabledField.setValue(false)
                break
        }
    }

    #applyDeviceParameter(audioUnit: AudioUnitBoxAdapter, action: DawControlAction): void {
        const device = targetDevice(audioUnit, action.targetDeviceId!)!
        setUnitParameters(device, action.parameters)
    }

    #applyAutomation(project: Project, audioUnit: AudioUnitBoxAdapter, action: DawControlAction): void {
        const key = action.parameters[0]?.key ?? action.name
        const parameter = parameterFor(audioUnit, action.targetDeviceId!, key)!
        const existing = audioUnit.tracks.values()
            .filter(track => track.type === TrackType.Value
                && track.target.targetVertex.mapOr(vertex => vertex.address.equals(parameter.field.address), false))
        existing.forEach(track => audioUnit.deleteTrack(track))
        if (action.operation === "clear") {return}
        const points = action.points.toSorted((left, right) => left.bar - right.bar)
        const {from, to} = automationBounds(points)
        const track = project.api.createAutomationTrack(audioUnit.box, parameter.field)
        const events = ValueEventCollectionBox.create(project.boxGraph, UUID.generate())
        points.forEach((point, index) => ValueEventBox.create(project.boxGraph, UUID.generate(), box => {
            box.position.setValue(Math.round((point.bar - 1) * PPQN.Bar) - from)
            box.index.setValue(index)
            box.value.setValue(clamp(point.unitValue, 0, 1))
            box.events.refer(events.events)
            InterpolationFieldAdapter.write(box.interpolation,
                index === points.length - 1 ? Interpolation.None : Interpolation.Linear)
        }))
        ValueRegionBox.create(project.boxGraph, UUID.generate(), region => {
            region.position.setValue(from)
            region.duration.setValue(Math.max(PPQN.Bar / 16, to - from))
            region.loopDuration.setValue(Math.max(PPQN.Bar / 16, to - from))
            region.label.setValue(action.name.trim().slice(0, 120) || `${parameter.name} automation`)
            region.regions.refer(track.regions)
            region.events.refer(events.owners)
        })
    }

    #applyBus(project: Project, action: DawControlAction): void {
        if (action.operation === "create") {
            const type = action.kind.toLowerCase() === "aux" ? AudioUnitType.Aux : AudioUnitType.Bus
            const bus = AudioBusFactory.create(project.skeleton,
                action.name.trim().slice(0, 120) || (type === AudioUnitType.Aux ? "FX Bus" : "Bus"),
                type === AudioUnitType.Aux ? IconSymbol.Effects : IconSymbol.AudioBus,
                type,
                type === AudioUnitType.Aux ? Colors.green : Colors.orange)
            const audioUnit = project.boxAdapters.adapterFor(
                bus.output.targetVertex.unwrap("New bus has no audio unit").box,
                AudioUnitBoxAdapter)
            audioUnit.box.volume.setValue(clamp(action.value, -96, 6))
            audioUnit.box.panning.setValue(clamp(action.secondaryValue, -1, 1))
            return
        }
        const bus = targetBus(project, action.targetBusId!)!
        if (action.operation === "delete") {
            project.api.deleteAudioUnit(bus.audioUnitBoxAdapter().box)
            bus.box.delete()
            return
        }
        bus.labelField.setValue(action.name.trim().slice(0, 120) || bus.labelField.getValue())
        const audioUnit = bus.audioUnitBoxAdapter()
        const parameters = parameterMap(action.parameters)
        if (parameters.has("volume")) {
            audioUnit.namedParameter.volume.setUnitValue(clamp(parameters.get("volume")!.numberValue, 0, 1))
        }
        if (parameters.has("panning")) {
            audioUnit.namedParameter.panning.setUnitValue(clamp(parameters.get("panning")!.numberValue, 0, 1))
        }
        if (parameters.has("mute")) {
            audioUnit.box.mute.setValue(parameters.get("mute")!.booleanValue)
        }
        if (parameters.has("solo")) {
            audioUnit.box.solo.setValue(parameters.get("solo")!.booleanValue)
        }
    }

    #applySend(project: Project, audioUnit: AudioUnitBoxAdapter, action: DawControlAction): void {
        const existing = audioUnit.auxSends.adapters().find(send =>
            action.targetDeviceId !== null
                ? send.address.toString() === action.targetDeviceId
                : send.optTargetBus.mapOr(bus => bus.address.toString() === action.targetBusId, false))
        if (action.operation === "remove") {
            existing?.delete()
            return
        }
        const bus = targetBus(project, action.targetBusId!)!
        const send = (existing?.box as AuxSendBox | undefined) ?? AuxSendBox.create(project.boxGraph, UUID.generate(), box => {
            box.audioUnit.refer(audioUnit.box.auxSends)
            box.targetBus.refer(bus.box.input)
            box.index.setValue(audioUnit.auxSends.adapters().length)
            box.routing.setValue(0)
        })
        send.targetBus.refer(bus.box.input)
        send.sendGain.setValue(clamp(action.value, -96, 6))
        send.sendPan.setValue(clamp(action.secondaryValue, -1, 1))
    }

    #engine(): EngineLike | null {
        const service = this.#service as unknown as {readonly engine?: EngineLike}
        try {
            return service.engine ?? null
        } catch {
            return null
        }
    }
}
