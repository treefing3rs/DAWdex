import {ClassicWaveform} from "@opendaw/lib-dsp"
import {VoicingMode} from "@opendaw/studio-enums"
import {VaporisateurDeviceBox} from "@opendaw/studio-boxes"
import type {MusicRole, SupportedStyle, TrackSoundDesign} from "../AgentProtocol"

type ProfileStyle = "dubstep" | "rnb"

export type RoleInstrumentProfile = {
    readonly attack: number
    readonly decay: number
    readonly sustain: number
    readonly release: number
    readonly cutoff: number
    readonly resonance: number
    readonly voicingMode: VoicingMode
    readonly unisonCount: 1 | 3 | 5
    readonly unisonDetune: number
    readonly oscillators: readonly [
        {readonly waveform: ClassicWaveform, readonly volume: number, readonly octave: number},
        {readonly waveform: ClassicWaveform, readonly volume: number, readonly octave: number}
    ]
    readonly noise: {
        readonly attack: number
        readonly hold: number
        readonly release: number
        readonly volume: number
    }
}

const silentNoise = {
    attack: 0.001,
    hold: 0.001,
    release: 0.001,
    volume: Number.NEGATIVE_INFINITY
} as const

export const RoleInstrumentProfiles: Readonly<
    Record<ProfileStyle, Readonly<Record<MusicRole, RoleInstrumentProfile>>>
> = {
    dubstep: {
        drums: {
            attack: 0.001,
            decay: 0.07,
            sustain: 0,
            release: 0.035,
            cutoff: 14_000,
            resonance: 0.15,
            voicingMode: VoicingMode.Polyphonic,
            unisonCount: 1,
            unisonDetune: 1,
            oscillators: [
                {waveform: ClassicWaveform.sine, volume: -2, octave: 0},
                {waveform: ClassicWaveform.square, volume: -16, octave: 0}
            ],
            noise: {attack: 0.001, hold: 0.018, release: 0.045, volume: -9}
        },
        bass: {
            attack: 0.002,
            decay: 0.12,
            sustain: 0.78,
            release: 0.09,
            cutoff: 950,
            resonance: 1.8,
            voicingMode: VoicingMode.Monophonic,
            unisonCount: 3,
            unisonDetune: 18,
            oscillators: [
                {waveform: ClassicWaveform.saw, volume: -5, octave: 0},
                {waveform: ClassicWaveform.square, volume: -12, octave: -1}
            ],
            noise: silentNoise
        },
        keys: {
            attack: 0.025,
            decay: 0.32,
            sustain: 0.42,
            release: 0.8,
            cutoff: 3_200,
            resonance: 0.7,
            voicingMode: VoicingMode.Polyphonic,
            unisonCount: 3,
            unisonDetune: 11,
            oscillators: [
                {waveform: ClassicWaveform.saw, volume: -11, octave: 0},
                {waveform: ClassicWaveform.square, volume: -19, octave: 1}
            ],
            noise: silentNoise
        }
    },
    rnb: {
        drums: {
            attack: 0.001,
            decay: 0.11,
            sustain: 0,
            release: 0.075,
            cutoff: 10_500,
            resonance: 0.1,
            voicingMode: VoicingMode.Polyphonic,
            unisonCount: 1,
            unisonDetune: 1,
            oscillators: [
                {waveform: ClassicWaveform.triangle, volume: -6, octave: 0},
                {waveform: ClassicWaveform.sine, volume: -15, octave: -1}
            ],
            noise: {attack: 0.001, hold: 0.028, release: 0.08, volume: -14}
        },
        bass: {
            attack: 0.008,
            decay: 0.22,
            sustain: 0.72,
            release: 0.18,
            cutoff: 1_650,
            resonance: 0.35,
            voicingMode: VoicingMode.Monophonic,
            unisonCount: 1,
            unisonDetune: 1,
            oscillators: [
                {waveform: ClassicWaveform.sine, volume: -2, octave: 0},
                {waveform: ClassicWaveform.triangle, volume: -10, octave: 0}
            ],
            noise: silentNoise
        },
        keys: {
            attack: 0.018,
            decay: 0.48,
            sustain: 0.58,
            release: 1.15,
            cutoff: 5_200,
            resonance: 0.22,
            voicingMode: VoicingMode.Polyphonic,
            unisonCount: 1,
            unisonDetune: 1,
            oscillators: [
                {waveform: ClassicWaveform.triangle, volume: -7, octave: 0},
                {waveform: ClassicWaveform.sine, volume: -14, octave: 1}
            ],
            noise: silentNoise
        }
    }
}

export const applyRoleInstrumentProfile = (
    box: VaporisateurDeviceBox,
    role: MusicRole,
    style: SupportedStyle
): void => {
    const normalized = style.toLowerCase()
    const profileStyle: ProfileStyle = [
        "dubstep", "edm", "house", "techno", "electro", "dance"
    ].some(term => normalized.includes(term)) ? "dubstep" : "rnb"
    const profile = RoleInstrumentProfiles[profileStyle][role]
    box.attack.setValue(profile.attack)
    box.decay.setValue(profile.decay)
    box.sustain.setValue(profile.sustain)
    box.release.setValue(profile.release)
    box.cutoff.setValue(profile.cutoff)
    box.resonance.setValue(profile.resonance)
    box.voicingMode.setValue(profile.voicingMode)
    box.unisonCount.setValue(profile.unisonCount)
    box.unisonDetune.setValue(profile.unisonDetune)
    profile.oscillators.forEach((oscillator, index) => {
        const field = box.oscillators.fields()[index]
        field.waveform.setValue(oscillator.waveform)
        field.volume.setValue(oscillator.volume)
        field.octave.setValue(oscillator.octave)
    })
    box.noise.attack.setValue(profile.noise.attack)
    box.noise.hold.setValue(profile.noise.hold)
    box.noise.release.setValue(profile.noise.release)
    box.noise.volume.setValue(profile.noise.volume)
}

export const createRoleTrackSound = (
    role: MusicRole,
    style: SupportedStyle
): TrackSoundDesign => {
    const normalized = style.toLowerCase()
    const profileStyle: ProfileStyle = [
        "dubstep", "edm", "house", "techno", "electro", "dance"
    ].some(term => normalized.includes(term)) ? "dubstep" : "rnb"
    const profile = RoleInstrumentProfiles[profileStyle][role]
    const presetLabel = profileStyle === "dubstep"
        ? role === "drums" ? "Tight Electronic Percussion"
            : role === "bass" ? "Heavy Wobble Bass"
                : "Wide Digital Stabs"
        : role === "drums" ? "Soft Electronic Percussion"
            : role === "bass" ? "Warm Soul Bass"
                : "Velvet Electric Keys"
    const effects: TrackSoundDesign["effects"] = role === "drums"
        ? [{
            kind: "compressor",
            enabled: true,
            thresholdDb: profileStyle === "dubstep" ? -24 : -18,
            ratio: profileStyle === "dubstep" ? 5 : 3,
            attackMs: profileStyle === "dubstep" ? 8 : 18,
            releaseMs: profileStyle === "dubstep" ? 130 : 220,
            mix: profileStyle === "dubstep" ? 0.92 : 0.68
        }]
        : role === "bass"
            ? [{
                kind: "compressor",
                enabled: true,
                thresholdDb: -20,
                ratio: profileStyle === "dubstep" ? 4.5 : 2.8,
                attackMs: profileStyle === "dubstep" ? 6 : 28,
                releaseMs: profileStyle === "dubstep" ? 110 : 240,
                mix: profileStyle === "dubstep" ? 0.9 : 0.72
            }, {
                kind: "maximizer",
                enabled: profileStyle === "dubstep",
                thresholdDb: -3
            }]
            : [{
                kind: "reverb",
                enabled: true,
                preDelayMs: profileStyle === "dubstep" ? 8 : 24,
                decay: profileStyle === "dubstep" ? 0.42 : 0.68,
                damping: profileStyle === "dubstep" ? 0.34 : 0.58,
                wetDb: profileStyle === "dubstep" ? -18 : -13
            }, {
                kind: "stereo",
                enabled: true,
                width: profileStyle === "dubstep" ? 0.42 : 0.68
            }]
    return {
        instrument: {
            kind: "vaporisateur",
            presetLabel,
            parameters: {
                attack: profile.attack,
                decay: profile.decay,
                sustain: profile.sustain,
                release: profile.release,
                cutoff: profile.cutoff,
                resonance: profile.resonance,
                voicing: profile.voicingMode === VoicingMode.Monophonic ? "mono" : "poly",
                unisonCount: profile.unisonCount,
                unisonDetune: profile.unisonDetune,
                oscillator1: {
                    waveform: ClassicWaveform[profile.oscillators[0].waveform] as
                        "sine" | "triangle" | "saw" | "square",
                    volumeDb: profile.oscillators[0].volume,
                    octave: profile.oscillators[0].octave
                },
                oscillator2: {
                    waveform: ClassicWaveform[profile.oscillators[1].waveform] as
                        "sine" | "triangle" | "saw" | "square",
                    volumeDb: profile.oscillators[1].volume,
                    octave: profile.oscillators[1].octave
                },
                noiseAttack: profile.noise.attack,
                noiseHold: profile.noise.hold,
                noiseRelease: profile.noise.release,
                noiseVolumeDb: profile.noise.volume
            }
        },
        mixer: {
            volumeDb: role === "drums" ? -3 : role === "bass" ? -4 : -7,
            panning: 0,
            mute: false,
            solo: false
        },
        effects
    }
}
