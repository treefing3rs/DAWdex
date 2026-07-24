import {clamp, isInstanceOf} from "@opendaw/lib-std"
import {ClassicWaveform} from "@opendaw/lib-dsp"
import {VoicingMode} from "@opendaw/studio-enums"
import {
    CompressorDeviceBox,
    DattorroReverbDeviceBox,
    DelayDeviceBox,
    MaximizerDeviceBox,
    StereoToolDeviceBox,
    VaporisateurDeviceBox
} from "@opendaw/studio-boxes"
import {AudioUnitBoxAdapter, InstrumentBox, InstrumentFactories} from "@opendaw/studio-adapters"
import {EffectFactories, Project} from "@opendaw/studio-core"
import type {
    DelayTiming,
    ProjectTrackSoundSnapshot,
    SynthSoundParameters,
    SynthWaveform,
    TrackEffect,
    TrackMixerSettings,
    TrackSoundDesign
} from "../AgentProtocol"

const managedEffectPrefix = "DAWdex "

const waveformToValue: Readonly<Record<SynthWaveform, ClassicWaveform>> = {
    sine: ClassicWaveform.sine,
    triangle: ClassicWaveform.triangle,
    saw: ClassicWaveform.saw,
    square: ClassicWaveform.square
}

const waveformFromValue = (value: ClassicWaveform): SynthWaveform => {
    switch (value) {
        case ClassicWaveform.sine:
            return "sine"
        case ClassicWaveform.triangle:
            return "triangle"
        case ClassicWaveform.square:
            return "square"
        default:
            return "saw"
    }
}

const delayTimingIndex: Readonly<Record<DelayTiming, number>> = {
    eighth: 11,
    "dotted-eighth": 13,
    quarter: 14,
    "dotted-quarter": 17,
    half: 19
}

const delayTimingFromIndex = (value: number): DelayTiming =>
    (Object.entries(delayTimingIndex)
        .find(([, index]) => index === Math.round(value))?.[0] as DelayTiming | undefined) ?? "quarter"

const round = (value: number): number =>
    Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : -96

const normalizeForFingerprint = (value: unknown): unknown => {
    if (typeof value === "number") {return round(value)}
    if (Array.isArray(value)) {return value.map(normalizeForFingerprint)}
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .map(([key, entry]) => [key, normalizeForFingerprint(entry)]))
    }
    return value
}

const hash = (value: string): string => {
    let result = 2166136261
    for (let index = 0; index < value.length; index++) {
        result ^= value.charCodeAt(index)
        result = Math.imul(result, 16777619)
    }
    return (result >>> 0).toString(16).padStart(8, "0")
}

const soundState = (sound: TrackSoundDesign): unknown => ({
    instrument: {
        kind: sound.instrument.kind,
        parameters: sound.instrument.parameters
    },
    mixer: sound.mixer,
    effects: sound.effects
})

export const soundDesignFingerprint = (sound: TrackSoundDesign): string =>
    hash(JSON.stringify(normalizeForFingerprint(soundState(sound))))

const sanitizeSynth = (value: SynthSoundParameters): SynthSoundParameters => ({
    attack: clamp(value.attack, 0.001, 4),
    decay: clamp(value.decay, 0.001, 4),
    sustain: clamp(value.sustain, 0, 1),
    release: clamp(value.release, 0.001, 8),
    cutoff: clamp(value.cutoff, 40, 20_000),
    resonance: clamp(value.resonance, 0, 10),
    voicing: value.voicing === "mono" ? "mono" : "poly",
    unisonCount: value.unisonCount === 5 ? 5 : value.unisonCount === 3 ? 3 : 1,
    unisonDetune: clamp(value.unisonDetune, 0, 100),
    oscillator1: {
        waveform: value.oscillator1.waveform,
        volumeDb: clamp(value.oscillator1.volumeDb, -96, 6),
        octave: clamp(Math.round(value.oscillator1.octave), -3, 3)
    },
    oscillator2: {
        waveform: value.oscillator2.waveform,
        volumeDb: clamp(value.oscillator2.volumeDb, -96, 6),
        octave: clamp(Math.round(value.oscillator2.octave), -3, 3)
    },
    noiseAttack: clamp(value.noiseAttack, 0.001, 4),
    noiseHold: clamp(value.noiseHold, 0.001, 4),
    noiseRelease: clamp(value.noiseRelease, 0.001, 8),
    noiseVolumeDb: clamp(value.noiseVolumeDb, -96, 0)
})

const sanitizeMixer = (value: TrackMixerSettings): TrackMixerSettings => ({
    volumeDb: clamp(value.volumeDb, -24, 6),
    panning: clamp(value.panning, -1, 1),
    mute: value.mute,
    solo: value.solo
})

const sanitizeEffect = (effect: TrackEffect): TrackEffect => {
    switch (effect.kind) {
        case "compressor":
            return {
                ...effect,
                thresholdDb: clamp(effect.thresholdDb, -60, 0),
                ratio: clamp(effect.ratio, 1, 24),
                attackMs: clamp(effect.attackMs, 0, 100),
                releaseMs: clamp(effect.releaseMs, 5, 1_500),
                mix: clamp(effect.mix, 0, 1)
            }
        case "delay":
            return {
                ...effect,
                feedback: clamp(effect.feedback, 0, 0.95),
                filter: clamp(effect.filter, -1, 1),
                wetDb: clamp(effect.wetDb, -48, 0)
            }
        case "reverb":
            return {
                ...effect,
                preDelayMs: clamp(effect.preDelayMs, 0, 1_000),
                decay: clamp(effect.decay, 0, 1),
                damping: clamp(effect.damping, 0, 1),
                wetDb: clamp(effect.wetDb, -48, 0)
            }
        case "stereo":
            return {...effect, width: clamp(effect.width, -1, 1)}
        case "maximizer":
            return {...effect, thresholdDb: clamp(effect.thresholdDb, -24, 0)}
    }
}

export const sanitizeTrackSoundDesign = (sound: TrackSoundDesign): TrackSoundDesign => ({
    instrument: {
        kind: "vaporisateur",
        presetLabel: sound.instrument.presetLabel.trim().slice(0, 64) || "Custom Synth",
        parameters: sanitizeSynth(sound.instrument.parameters)
    },
    mixer: sanitizeMixer(sound.mixer),
    effects: sound.effects.slice(0, 4).map(sanitizeEffect)
})

const readSynth = (box: VaporisateurDeviceBox): SynthSoundParameters => ({
    attack: box.attack.getValue(),
    decay: box.decay.getValue(),
    sustain: box.sustain.getValue(),
    release: box.release.getValue(),
    cutoff: box.cutoff.getValue(),
    resonance: box.resonance.getValue(),
    voicing: box.voicingMode.getValue() === VoicingMode.Monophonic ? "mono" : "poly",
    unisonCount: box.unisonCount.getValue() === 5 ? 5 : box.unisonCount.getValue() === 3 ? 3 : 1,
    unisonDetune: box.unisonDetune.getValue(),
    oscillator1: {
        waveform: waveformFromValue(box.oscillators.fields()[0].waveform.getValue()),
        volumeDb: box.oscillators.fields()[0].volume.getValue(),
        octave: box.oscillators.fields()[0].octave.getValue()
    },
    oscillator2: {
        waveform: waveformFromValue(box.oscillators.fields()[1].waveform.getValue()),
        volumeDb: box.oscillators.fields()[1].volume.getValue(),
        octave: box.oscillators.fields()[1].octave.getValue()
    },
    noiseAttack: box.noise.attack.getValue(),
    noiseHold: box.noise.hold.getValue(),
    noiseRelease: box.noise.release.getValue(),
    noiseVolumeDb: box.noise.volume.getValue()
})

const readManagedEffect = (box: unknown): TrackEffect | null => {
    if (isInstanceOf(box, CompressorDeviceBox)) {
        return {
            kind: "compressor",
            enabled: box.enabled.getValue(),
            thresholdDb: box.threshold.getValue(),
            ratio: box.ratio.getValue(),
            attackMs: box.attack.getValue(),
            releaseMs: box.release.getValue(),
            mix: box.mix.getValue()
        }
    }
    if (isInstanceOf(box, DelayDeviceBox)) {
        return {
            kind: "delay",
            enabled: box.enabled.getValue(),
            timing: delayTimingFromIndex(box.delayMusical.getValue()),
            feedback: box.feedback.getValue(),
            filter: box.filter.getValue(),
            wetDb: box.wet.getValue()
        }
    }
    if (isInstanceOf(box, DattorroReverbDeviceBox)) {
        return {
            kind: "reverb",
            enabled: box.enabled.getValue(),
            preDelayMs: box.preDelay.getValue(),
            decay: box.decay.getValue(),
            damping: box.damping.getValue(),
            wetDb: box.wet.getValue()
        }
    }
    if (isInstanceOf(box, StereoToolDeviceBox)) {
        return {
            kind: "stereo",
            enabled: box.enabled.getValue(),
            width: box.stereo.getValue()
        }
    }
    if (isInstanceOf(box, MaximizerDeviceBox)) {
        return {
            kind: "maximizer",
            enabled: box.enabled.getValue(),
            thresholdDb: box.threshold.getValue()
        }
    }
    return null
}

export const readTrackSound = (audioUnit: AudioUnitBoxAdapter): ProjectTrackSoundSnapshot => {
    const input = audioUnit.input.adapter().unwrapOrNull()
    const synthParameters = input !== null && isInstanceOf(input.box, VaporisateurDeviceBox)
        ? readSynth(input.box)
        : null
    const allEffects = audioUnit.audioEffects.mapOr(chain => chain.adapters(), [])
    const managedEffects = allEffects
        .filter(effect => effect.labelField.getValue().startsWith(managedEffectPrefix))
        .flatMap(effect => {
            const value = readManagedEffect(effect.box)
            return value === null ? [] : [value]
        })
    const mixer: TrackMixerSettings = {
        volumeDb: audioUnit.box.volume.getValue(),
        panning: audioUnit.box.panning.getValue(),
        mute: audioUnit.box.mute.getValue(),
        solo: audioUnit.box.solo.getValue()
    }
    const sound = synthParameters === null ? null : {
        instrument: {
            kind: "vaporisateur" as const,
            presetLabel: input?.labelField.getValue() ?? "Vaporisateur",
            parameters: synthParameters
        },
        mixer,
        effects: managedEffects
    }
    return {
        instrumentKind: input?.box.name ?? "none",
        instrumentLabel: input?.labelField.getValue() ?? "No instrument",
        synthParameters,
        mixer,
        effects: managedEffects,
        unmanagedEffectCount: allEffects.length - managedEffects.length,
        fingerprint: sound === null ? null : soundDesignFingerprint(sound)
    }
}

const applySynth = (box: VaporisateurDeviceBox, parameters: SynthSoundParameters): void => {
    box.attack.setValue(parameters.attack)
    box.decay.setValue(parameters.decay)
    box.sustain.setValue(parameters.sustain)
    box.release.setValue(parameters.release)
    box.cutoff.setValue(parameters.cutoff)
    box.resonance.setValue(parameters.resonance)
    box.voicingMode.setValue(parameters.voicing === "mono"
        ? VoicingMode.Monophonic
        : VoicingMode.Polyphonic)
    box.unisonCount.setValue(parameters.unisonCount)
    box.unisonDetune.setValue(parameters.unisonDetune)
    ;[parameters.oscillator1, parameters.oscillator2].forEach((oscillator, index) => {
        const field = box.oscillators.fields()[index]
        field.waveform.setValue(waveformToValue[oscillator.waveform])
        field.volume.setValue(oscillator.volumeDb)
        field.octave.setValue(oscillator.octave)
    })
    box.noise.attack.setValue(parameters.noiseAttack)
    box.noise.hold.setValue(parameters.noiseHold)
    box.noise.release.setValue(parameters.noiseRelease)
    box.noise.volume.setValue(parameters.noiseVolumeDb)
}

const insertEffect = (project: Project, audioUnit: AudioUnitBoxAdapter, effect: TrackEffect): void => {
    switch (effect.kind) {
        case "compressor": {
            const box = project.api.insertEffect(audioUnit.box.audioEffects, EffectFactories.Compressor)
            if (!isInstanceOf(box, CompressorDeviceBox)) {throw new Error("Could not create Compressor")}
            box.label.setValue(`${managedEffectPrefix}Compressor`)
            box.enabled.setValue(effect.enabled)
            box.threshold.setValue(effect.thresholdDb)
            box.ratio.setValue(effect.ratio)
            box.attack.setValue(effect.attackMs)
            box.release.setValue(effect.releaseMs)
            box.mix.setValue(effect.mix)
            break
        }
        case "delay": {
            const box = project.api.insertEffect(audioUnit.box.audioEffects, EffectFactories.Delay)
            if (!isInstanceOf(box, DelayDeviceBox)) {throw new Error("Could not create Delay")}
            box.label.setValue(`${managedEffectPrefix}Delay`)
            box.enabled.setValue(effect.enabled)
            box.delayMusical.setValue(delayTimingIndex[effect.timing])
            box.feedback.setValue(effect.feedback)
            box.filter.setValue(effect.filter)
            box.wet.setValue(effect.wetDb)
            box.dry.setValue(0)
            break
        }
        case "reverb": {
            const box = project.api.insertEffect(audioUnit.box.audioEffects, EffectFactories.DattorroReverb)
            if (!isInstanceOf(box, DattorroReverbDeviceBox)) {throw new Error("Could not create Reverb")}
            box.label.setValue(`${managedEffectPrefix}Reverb`)
            box.enabled.setValue(effect.enabled)
            box.preDelay.setValue(effect.preDelayMs)
            box.decay.setValue(effect.decay)
            box.damping.setValue(effect.damping)
            box.wet.setValue(effect.wetDb)
            box.dry.setValue(0)
            break
        }
        case "stereo": {
            const box = project.api.insertEffect(audioUnit.box.audioEffects, EffectFactories.StereoTool)
            if (!isInstanceOf(box, StereoToolDeviceBox)) {throw new Error("Could not create Stereo Tool")}
            box.label.setValue(`${managedEffectPrefix}Stereo`)
            box.enabled.setValue(effect.enabled)
            box.stereo.setValue(effect.width)
            break
        }
        case "maximizer": {
            const box = project.api.insertEffect(audioUnit.box.audioEffects, EffectFactories.Maximizer)
            if (!isInstanceOf(box, MaximizerDeviceBox)) {throw new Error("Could not create Maximizer")}
            box.label.setValue(`${managedEffectPrefix}Maximizer`)
            box.enabled.setValue(effect.enabled)
            box.threshold.setValue(effect.thresholdDb)
            break
        }
    }
}

export const applyTrackSound = (
    project: Project,
    audioUnit: AudioUnitBoxAdapter,
    rawSound: TrackSoundDesign
): TrackSoundDesign => {
    const sound = sanitizeTrackSoundDesign(rawSound)
    let input = audioUnit.input.adapter().unwrapOrNull()
    if (input === null || !isInstanceOf(input.box, VaporisateurDeviceBox)) {
        if (input === null) {throw new Error("The target track has no instrument")}
        const attempt = project.api.replaceMIDIInstrument(
            input.box as InstrumentBox,
            InstrumentFactories.Vaporisateur
        )
        if (attempt.isFailure()) {throw new Error(attempt.failureReason())}
        input = audioUnit.input.adapter().unwrapOrNull()
    }
    if (input === null || !isInstanceOf(input.box, VaporisateurDeviceBox)) {
        throw new Error("Could not configure the target synth")
    }
    applySynth(input.box, sound.instrument.parameters)
    audioUnit.box.volume.setValue(sound.mixer.volumeDb)
    audioUnit.box.panning.setValue(sound.mixer.panning)
    audioUnit.box.mute.setValue(sound.mixer.mute)
    audioUnit.box.solo.setValue(sound.mixer.solo)
    audioUnit.audioEffects.ifSome(chain => chain.adapters()
        .filter(effect => effect.labelField.getValue().startsWith(managedEffectPrefix))
        .forEach(effect => effect.box.delete()))
    sound.effects.forEach(effect => insertEffect(project, audioUnit, effect))
    return sound
}
