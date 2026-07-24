import type {
    DawCapabilitySnapshot,
    DawControlAction,
    DawControlCommand,
    DawControlParameter
} from "./AgentProtocol"

export const DawControlOperations: Readonly<Record<DawControlCommand, ReadonlyArray<string>>> = {
    transport: ["play", "pause", "stop", "seek"],
    loop: ["set"],
    track: ["rename", "delete", "enable", "disable"],
    region: ["move", "resize", "rename", "mute", "unmute", "duplicate", "delete"],
    "midi-transform": ["transpose", "velocity", "quantize", "humanize"],
    instrument: ["replace"],
    effect: ["add", "update", "remove", "move", "enable", "disable"],
    "device-parameter": ["set"],
    automation: ["replace", "clear"],
    bus: ["create", "update", "delete"],
    send: ["upsert", "remove"],
    routing: ["set-output"]
}

export const SafeInstrumentKinds = [
    "Vaporisateur",
    "Soundfont",
    "Nano",
    "Playfield",
    "MIDIOutput",
    "Apparat"
] as const

export const SafeMidiEffectKinds = [
    "Arpeggio",
    "Pitch",
    "Velocity",
    "Zeitgeist"
] as const

export const SafeAudioEffectKinds = [
    "AudioEffectComposite",
    "StereoComposite",
    "FrequencySplit",
    "Autotune",
    "Compressor",
    "Crusher",
    "DattorroReverb",
    "Delay",
    "Fold",
    "Reverb",
    "Gate",
    "Maximizer",
    "Revamp",
    "StereoTool",
    "Tidal",
    "Vocoder",
    "Waveshaper"
] as const

export const defaultCapabilitySnapshot = (): DawCapabilitySnapshot => ({
    commands: Object.keys(DawControlOperations) as ReadonlyArray<DawControlCommand>,
    instruments: SafeInstrumentKinds.map(kind => ({
        kind,
        requiresAsset: kind === "Soundfont"
            || kind === "Nano"
            || kind === "Playfield"
            || kind === "Apparat",
        available: kind === "Vaporisateur" || kind === "MIDIOutput"
    })),
    midiEffects: SafeMidiEffectKinds,
    audioEffects: SafeAudioEffectKinds
})

export const parameterMap = (
    parameters: ReadonlyArray<DawControlParameter>
): ReadonlyMap<string, DawControlParameter> =>
    new Map(parameters.map(parameter => [parameter.key, parameter]))

const requiresTrack = new Set<DawControlCommand>([
    "track",
    "region",
    "midi-transform",
    "instrument",
    "send",
    "routing"
])

const requiresRegion = new Set<DawControlCommand>(["region", "midi-transform"])
const requiresDevice = new Set<DawControlCommand>(["device-parameter", "automation"])

export const validateControlEnvelope = (action: DawControlAction): string | null => {
    const operations = DawControlOperations[action.command]
    if (operations === undefined || !operations.includes(action.operation)) {
        return `Unsupported ${action.command} operation "${action.operation}".`
    }
    if (requiresTrack.has(action.command) && action.targetTrackId === null) {
        return `${action.command} requires targetTrackId.`
    }
    if (requiresRegion.has(action.command) && action.targetRegionId === null) {
        return `${action.command} requires targetRegionId.`
    }
    if (requiresDevice.has(action.command) && action.targetDeviceId === null) {
        return `${action.command} requires targetDeviceId.`
    }
    if ((action.command === "effect"
        || action.command === "device-parameter"
        || action.command === "automation")
        && action.targetTrackId === null
        && action.targetBusId === null) {
        return `${action.command} requires targetTrackId or targetBusId.`
    }
    if (action.command === "effect" && action.operation !== "add" && action.targetDeviceId === null) {
        return `effect ${action.operation} requires targetDeviceId.`
    }
    if ((action.command === "send" || action.command === "routing")
        && action.operation !== "remove"
        && action.targetBusId === null) {
        return `${action.command} requires targetBusId.`
    }
    if (action.command === "automation" && action.operation === "replace" && action.points.length < 2) {
        return "Automation replacement requires at least two points."
    }
    if (action.points.some(point =>
        !Number.isFinite(point.bar)
        || point.bar < 1
        || !Number.isFinite(point.unitValue)
        || point.unitValue < 0
        || point.unitValue > 1)) {
        return "Automation points must use bars >= 1 and unit values between 0 and 1."
    }
    const duplicateParameter = action.parameters.find((parameter, index) =>
        action.parameters.findIndex(candidate => candidate.key === parameter.key) !== index)
    if (duplicateParameter !== undefined) {
        return `Duplicate control parameter "${duplicateParameter.key}".`
    }
    return null
}
