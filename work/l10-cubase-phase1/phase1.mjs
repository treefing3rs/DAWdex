#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMidiBuffer, parseMidi } from "./smf.mjs";
import {
  DEFAULT_BPM,
  PASSES,
  TRACKS,
  buildTracks,
} from "./score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function printUsage() {
  console.log(`Usage:
  node phase1.mjs --dry [--bpm=96] [--out=out]
  node phase1.mjs --export [--bpm=96] [--out=out]
  node phase1.mjs --check [--midi=out/phase1.mid]
  node phase1.mjs --live --armed [--bpm=96] [--port="IAC Driver Bus 1"]`);
}

const command = args.find((arg) =>
  ["--dry", "--export", "--check", "--live"].includes(arg));
if (!command || args.includes("--help")) {
  printUsage();
  process.exit(args.includes("--help") ? 0 : 2);
}

const bpm = Number(flagValue("bpm", String(DEFAULT_BPM)));
if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) {
  console.error(`[stop] invalid BPM: ${flagValue("bpm", String(DEFAULT_BPM))}`);
  process.exit(2);
}

const outDir = resolve(flagValue("out", join(here, "out")));
const defaultMidiPath = join(outDir, "phase1.mid");

function buildEvents() {
  const beatSeconds = 60 / bpm;
  const events = [];
  const humanize = [
    [0, 0.006],
    [1, -0.004],
    [2, 0.009],
    [3, -0.007],
  ];

  for (const track of buildTracks()) {
    for (const [noteIndex, note] of track.notes.entries()) {
      const sequence = Math.round(note.beat * 2) % humanize.length;
      const [offsetBeats, velocityOffset] = humanize[sequence];
      const start = (note.beat + offsetBeats) * beatSeconds;
      const duration = Math.max(
        0.03,
        note.durationBeats * beatSeconds - 0.012);
      events.push({
        time: start,
        type: "note.on",
        channel: track.channel,
        pitch: note.pitch,
        velocity: Math.max(1, Math.min(127, note.velocity + velocityOffset)),
        track: track.id,
        noteIndex,
      });
      events.push({
        time: start + duration,
        type: "note.off",
        channel: track.channel,
        pitch: note.pitch,
        velocity: 0,
        track: track.id,
        noteIndex,
      });
    }
  }

  events.sort((left, right) =>
    left.time - right.time
    || (left.type === "note.off" ? -1 : 1) - (right.type === "note.off" ? -1 : 1)
    || left.pitch - right.pitch
    || left.noteIndex - right.noteIndex);
  return events;
}

function writeExport() {
  mkdirSync(outDir, { recursive: true });
  const buffer = buildMidiBuffer(buildTracks(), bpm);
  writeFileSync(defaultMidiPath, buffer);
  const parsed = parseMidi(buffer);
  const report = {
    file: defaultMidiPath,
    bpm,
    passes: PASSES,
    tracks: parsed.tracks.slice(1).map((track) => ({
      name: track.name,
      channel: track.notes[0]?.channel ?? null,
      notes: track.notes.length,
    })),
    noteOn: parsed.tracks.reduce((sum, track) => sum + track.notes.length, 0),
    noteOff: parsed.tracks.reduce((sum, track) => sum + track.notes.length, 0),
    cubase: "not opened",
  };
  writeFileSync(
    join(outDir, "phase1.export.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[export] ${defaultMidiPath}`);
  console.log(JSON.stringify(report, null, 2));
}

function checkMidi(midiPath) {
  const buffer = readFileSync(midiPath);
  const parsed = parseMidi(buffer);
  const failures = [];
  if (parsed.format !== 1) failures.push(`format ${parsed.format} != 1`);
  if (parsed.division !== 480) failures.push(`PPQ ${parsed.division} != 480`);
  if (parsed.trackCount !== TRACKS.length + 1) {
    failures.push(`track count ${parsed.trackCount} != ${TRACKS.length + 1}`);
  }

  const detail = {};
  const halfTicks = 4 * 480 * 2;
  const comparePasses = (track) => {
    const first = [];
    const second = [];
    for (const note of track.notes) {
      const entry = {
        tick: note.startTick,
        duration: note.endTick - note.startTick,
        pitch: note.pitch,
        velocity: note.velocity,
      };
      if (note.startTick < halfTicks) first.push(entry);
      else second.push({ ...entry, tick: entry.tick - halfTicks });
    }
    const sortNotes = (notes) => notes.sort((left, right) =>
      left.tick - right.tick
      || left.pitch - right.pitch
      || left.duration - right.duration);
    return { first: sortNotes(first), second: sortNotes(second) };
  };

  for (const track of parsed.tracks.slice(1)) {
    const { first, second } = comparePasses(track);
    if (first.length !== second.length) {
      failures.push(`${track.name}: pass note count ${first.length} != ${second.length}`);
      continue;
    }

    const differences = [];
    for (let index = 0; index < first.length; index += 1) {
      const left = first[index];
      const right = second[index];
      if (left.tick !== right.tick) {
        failures.push(`${track.name} #${index}: tick ${left.tick} != ${right.tick}`);
      }
      if (left.duration !== right.duration) {
        failures.push(`${track.name} #${index}: duration ${left.duration} != ${right.duration}`);
      }
      if (left.velocity !== right.velocity) {
        failures.push(`${track.name} #${index}: velocity ${left.velocity} != ${right.velocity}`);
      }
      if (left.pitch !== right.pitch) {
        differences.push({ tick: left.tick, from: left.pitch, to: right.pitch });
      }
    }

    if (track.name === "Sub Bass") {
      const expected = differences.filter((item) => item.from - item.to === 2);
      if (differences.length !== 10 || expected.length !== 10) {
        failures.push(`Sub Bass: expected 10 pitch changes of -2, got ${JSON.stringify(differences)}`);
      }
    } else if (differences.length) {
      failures.push(`${track.name}: ${differences.length} unexpected pitch changes`);
    }

    detail[track.name] = {
      notes: track.notes.length,
      pitchDifferences: differences,
    };
  }

  const reportPath = join(dirname(midiPath), "phase1.check.json");
  const report = {
    file: midiPath,
    ok: failures.length === 0,
    failures,
    rule: "bars 1-2 twice; only Sub Bass changes E (40/52) to D (38/50)",
    tracks: detail,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[check] ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(1);
}

function printDryRun(events) {
  console.log("[dry] Cubase untouched; no MIDI port opened");
  console.log(`[dry] ${bpm} BPM, 2 bars x 2 passes, ${events.filter((event) => event.type === "note.on").length} notes`);
  console.log(`[dry] port would be ${flagValue("port", "IAC Driver Bus 1")}`);
  for (const event of events) {
    const action = event.type === "note.on"
      ? `on  ch${event.channel} pitch ${event.pitch} vel ${event.velocity}`
      : `off ch${event.channel} pitch ${event.pitch}`;
    console.log(`${event.time.toFixed(3).padStart(8)}s ${action}`);
  }
  console.log("[dry] all notes would be off at end");
}

async function runLive(events) {
  if (!hasFlag("armed")) {
    console.error("[stop] live mode requires --armed; Cubase was not touched");
    process.exit(2);
  }
  let midi;
  try {
    midi = await import("@julusian/midi");
  } catch {
    console.error("[stop] @julusian/midi is not installed; no port opened");
    process.exit(1);
  }
  const Midi = midi.default ?? midi;
  const portName = flagValue("port", "IAC Driver Bus 1");
  const output = new Midi.Output();
  output.openPort(portName);

  const allNotesOff = () => {
    for (let channel = 0; channel < 16; channel += 1) {
      output.sendMessage([0xb0 | channel, 123, 0]);
      output.sendMessage([0xb0 | channel, 120, 0]);
    }
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    allNotesOff();
    output.closePort();
  };
  process.on("SIGINT", () => {
    close();
    process.exit(130);
  });

  const start = performance.now();
  let index = 0;
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      const tick = () => {
        if (closed) {
          rejectPromise(new Error("interrupted"));
          return;
        }
        const elapsed = (performance.now() - start) / 1000;
        while (index < events.length && events[index].time <= elapsed + 0.01) {
          output.sendMessage([
            events[index].type === "note.on" ? 0x90 : 0x80,
            events[index].pitch,
            events[index].velocity,
          ], { channels: [events[index].channel - 1] });
          index += 1;
        }
        if (index < events.length) setTimeout(tick, 4);
        else resolvePromise();
      };
      tick();
    });
  } finally {
    close();
  }
  console.log(`[live] sent ${events.length} events on ${portName}; all notes off`);
}

const events = buildEvents();
if (command === "--dry") {
  printDryRun(events);
} else if (command === "--export") {
  writeExport();
} else if (command === "--check") {
  checkMidi(resolve(flagValue("midi", defaultMidiPath)));
} else if (command === "--live") {
  await runLive(events);
}
