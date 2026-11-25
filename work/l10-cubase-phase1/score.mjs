export const DEFAULT_BPM = 96;
export const BARS = 2;
export const PASSES = 2;

const NOTE = (beat, durationBeats, pitch, velocity) => ({
  beat,
  durationBeats,
  pitch,
  velocity,
});

const chord = (beat, durationBeats, pitches, velocity) =>
  pitches.map((pitch) => NOTE(beat, durationBeats, pitch, velocity));

const bassPattern = (root) => [
  NOTE(0, 0.42, root, 96),
  NOTE(1, 0.42, root, 84),
  NOTE(2, 0.42, root, 92),
  NOTE(3, 0.42, root, 84),
  NOTE(3.5, 0.42, root + 12, 72),
];

const pianoPart = [
  ...chord(0, 4, [52, 55, 59, 65], 82),
  ...chord(4, 4, [53, 57, 60, 64], 82),
];

const padPart = [
  ...chord(0, 4, [59, 64], 54),
  ...chord(4, 4, [60, 65], 54),
];

const drumPattern = (barOffset) => [
  NOTE(barOffset, 0.25, 36, 104),
  NOTE(barOffset + 2, 0.25, 36, 92),
  NOTE(barOffset + 1, 0.25, 37, 74),
  NOTE(barOffset + 3, 0.25, 37, 78),
  ...Array.from({ length: 8 }, (_, step) =>
    NOTE(barOffset + step * 0.5, 0.12, 42, step % 2 === 0 ? 58 : 44)),
];

export const TRACKS = [
  { id: "piano", name: "Felt Piano", channel: 1, program: 0 },
  { id: "bass", name: "Sub Bass", channel: 2, program: 38 },
  { id: "pad", name: "Dust Pad", channel: 3, program: 88 },
  { id: "drums", name: "Frame Drum", channel: 10, program: 0 },
];

export const PASS_ROOTS = [40, 38];

export function buildPassNotes(passIndex, root) {
  const offsetBeats = passIndex * BARS * 4;
  const shift = (notes) =>
    notes.map((note) => ({
      ...note,
      beat: note.beat + offsetBeats,
    }));

  return {
    piano: shift(pianoPart),
    bass: shift([...bassPattern(root), ...bassPattern(root)]),
    pad: shift(padPart),
    drums: shift([...drumPattern(0), ...drumPattern(4)]),
  };
}

export function buildPerformance() {
  return Array.from({ length: PASSES }, (_, passIndex) =>
    buildPassNotes(passIndex, PASS_ROOTS[passIndex]));
}

export function buildTracks() {
  const passes = buildPerformance();
  return TRACKS.map((track) => ({
    ...track,
    notes: passes.flatMap((pass) => pass[track.id]),
  }));
}
