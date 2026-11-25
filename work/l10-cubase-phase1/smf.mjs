const PPQ = 480;

function encodeVlq(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  for (;;) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return Buffer.from(bytes);
}

function meta(type, data = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0xff, type]), encodeVlq(data.length), data]);
}

function textMeta(text) {
  return meta(0x03, Buffer.from(text, "utf8"));
}

function trackChunk(events) {
  const sorted = [...events].sort((left, right) =>
    left.tick - right.tick || left.order - right.order);
  const chunks = [];
  let lastTick = 0;
  for (const event of sorted) {
    chunks.push(encodeVlq(event.tick - lastTick), event.data);
    lastTick = event.tick;
  }
  chunks.push(encodeVlq(0), meta(0x2f));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("MTrk", 0, "ascii");
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function noteEvent(tick, channel, pitch, velocity, isOn) {
  return {
    tick,
    order: isOn ? 2 : 1,
    data: Buffer.from([
      (isOn ? 0x90 : 0x80) | (channel - 1),
      pitch,
      velocity,
    ]),
  };
}

export function buildMidiBuffer(tracks, bpm) {
  const microseconds = Math.round(60000000 / bpm);
  const conductor = [
    { tick: 0, order: 0, data: textMeta("DAWdex Phase 1 / E-D single variable") },
    {
      tick: 0,
      order: 1,
      data: meta(0x51, Buffer.from([
        microseconds >> 16,
        (microseconds >> 8) & 0xff,
        microseconds & 0xff,
      ])),
    },
    { tick: 0, order: 2, data: meta(0x58, Buffer.from([4, 2, 24, 8])) },
    { tick: 0, order: 3, data: meta(0x59, Buffer.from([0, 1])) },
  ];

  const chunks = tracks.map((track) => {
    const events = [
      { tick: 0, order: 0, data: textMeta(track.name) },
      {
        tick: 0,
        order: 1,
        data: Buffer.from([0xc0 | (track.channel - 1), track.program]),
      },
    ];
    for (const note of track.notes) {
      const startTick = Math.round(note.beat * PPQ);
      const endTick = startTick + Math.round(note.durationBeats * PPQ);
      events.push(noteEvent(startTick, track.channel, note.pitch, note.velocity, true));
      events.push(noteEvent(endTick, track.channel, note.pitch, 0, false));
    }
    return trackChunk(events);
  });

  const header = Buffer.alloc(14);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(chunks.length + 1, 10);
  header.writeUInt16BE(PPQ, 12);

  return Buffer.concat([header, trackChunk(conductor), ...chunks]);
}

function readVlq(buffer, offset) {
  let value = 0;
  let cursor = offset;
  for (;;) {
    const byte = buffer[cursor];
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) break;
  }
  return { value, next: cursor };
}

export function parseMidi(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "MThd") {
    throw new Error("Not a Standard MIDI File");
  }
  const format = buffer.readUInt16BE(8);
  const trackCount = buffer.readUInt16BE(10);
  const division = buffer.readUInt16BE(12);
  const tracks = [];
  let offset = 14;

  while (offset < buffer.length && tracks.length < trackCount) {
    if (buffer.toString("ascii", offset, offset + 4) !== "MTrk") {
      throw new Error(`Missing MTrk at ${offset}`);
    }
    const length = buffer.readUInt32BE(offset + 4);
    const end = offset + 8 + length;
    let cursor = offset + 8;
    let tick = 0;
    let runningStatus = null;
    let name = null;
    let program = null;
    const notes = [];
    const open = new Map();
    let noteIndex = 0;

    while (cursor < end) {
      const delta = readVlq(buffer, cursor);
      cursor = delta.next;
      tick += delta.value;
      let status = buffer[cursor];
      if (status < 0x80) {
        if (runningStatus === null) throw new Error("Missing running status");
        status = runningStatus;
      } else {
        cursor += 1;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        const type = buffer[cursor];
        cursor += 1;
        const size = readVlq(buffer, cursor);
        const data = buffer.subarray(size.next, size.next + size.value);
        cursor = size.next + size.value;
        if (type === 0x03 && name === null) name = data.toString("utf8");
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const size = readVlq(buffer, cursor);
        cursor = size.next + size.value;
        continue;
      }

      const kind = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      if (kind === 0xc0) {
        program = buffer[cursor];
        cursor += 1;
        continue;
      }
      const pitch = buffer[cursor];
      const value = buffer[cursor + 1];
      cursor += 2;
      const key = `${channel}:${pitch}:${noteIndex}`;
      if (kind === 0x90 && value > 0) {
        open.set(key, { channel, pitch, velocity: value, startTick: tick });
        noteIndex += 1;
      } else if (kind === 0x80 || (kind === 0x90 && value === 0)) {
        let started = null;
        let startedKey = null;
        for (const [candidateKey, candidate] of open) {
          if (candidate.channel === channel && candidate.pitch === pitch) {
            started = candidate;
            startedKey = candidateKey;
            break;
          }
        }
        if (!started) throw new Error(`Orphan note off at tick ${tick}`);
        open.delete(startedKey);
        notes.push({
          channel,
          pitch,
          velocity: started.velocity,
          startTick: started.startTick,
          endTick: tick,
        });
      }
    }

    if (open.size) throw new Error(`Unclosed notes in ${name ?? "untitled track"}`);
    tracks.push({ name, program, notes });
    offset = end;
  }

  return { format, trackCount, division, tracks };
}
