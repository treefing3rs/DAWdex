# OpenDAW CC64 Sustain Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CC64 sustain pedal events audibly survive both DAWdex asset import and openDAW manual MIDI import.

**Architecture:** Introduce a shared Studio MIDI event-to-note-span decoder that resolves sustain pedal state per channel. Keep openDAW's existing note-region storage by flattening pedal-held releases into longer note spans, then reuse the existing DAWdex bar fitting, transposition, range normalization, fingerprint, and project write path.

**Tech Stack:** TypeScript, `@opendaw/lib-midi`, `@opendaw/lib-dsp`, Vitest, openDAW Studio boxes/adapters.

---

### Task 1: Shared sustain-aware MIDI note decoder

**Files:**
- Create: `opendaw/packages/app/studio/src/midi/MidiNoteSpans.ts`
- Create: `opendaw/packages/app/studio/src/midi/MidiNoteSpans.test.ts`

- [ ] **Step 1: Write the failing CC64 tests**

Create MIDI fixtures that assert:

```ts
expect(decodeMidiNoteSpans(pedalMidi).get(0)).toEqual([
    {ticks: 0, durationTicks: 960, pitch: 60, velocity: 100 / 127}
])
```

The source note ends at tick 480, but CC64 stays down until tick 960. Add
separate cases for retriggering the same sustained pitch and closing pedal-held
notes at the source end.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd opendaw
npm run test -w @opendaw/app-studio -- --run src/midi/MidiNoteSpans.test.ts
```

Expected: FAIL because `decodeMidiNoteSpans` does not exist.

- [ ] **Step 3: Implement the minimal decoder**

Walk each channel's sorted `ControlEvent` list, track active note queues,
sustained releases, CC64 state, retriggers, and the last source tick. Return a
read-only map from channel number to deterministic note spans in source ticks.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 1 command again. Expected: all `MidiNoteSpans` tests pass.

### Task 2: Use the decoder in DAWdex and manual import

**Files:**
- Modify: `opendaw/packages/app/studio/src/agent/music/MidiAsset.ts`
- Modify: `opendaw/packages/app/studio/src/agent/music/MidiAsset.test.ts`
- Modify: `opendaw/packages/app/studio/src/ui/timeline/MidiImport.ts`

- [ ] **Step 1: Write a failing DAWdex asset test**

Add a CC64 fixture where the physical Note Off is one beat but pedal-up is two
beats. Assert `compileMidiAsset(..., "keys", 1)` returns a note whose duration
is two beats in openDAW PPQN.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd opendaw
npm run test -w @opendaw/app-studio -- --run src/agent/music/MidiAsset.test.ts
```

Expected: FAIL because the current compiler ends the note at physical Note Off.

- [ ] **Step 3: Replace both note-only visitors**

Use `decodeMidiNoteSpans` in `MidiAsset.ts`, convert source ticks with
`PPQN.fromSignature`, and keep the current role-specific transforms. Update
`MidiImport.ts` to consume the same channel note spans rather than its local
Note On/Off map.

- [ ] **Step 4: Run focused tests**

Run both `MidiNoteSpans.test.ts` and `MidiAsset.test.ts`. Expected: pass.

### Task 3: Project adapter integration and regression coverage

**Files:**
- Modify: `opendaw/packages/app/studio/src/agent/DawProjectAdapter.test.ts`

- [ ] **Step 1: Write a failing adapter integration test**

Load the CC64 fixture through `MidiAssetLoader`, apply one Keys upsert, and
assert the resulting project note duration reaches pedal-up rather than the
physical Note Off.

- [ ] **Step 2: Verify RED, then make only required fixture plumbing changes**

Run:

```bash
cd opendaw
npm run test -w @opendaw/app-studio -- --run src/agent/DawProjectAdapter.test.ts
```

Expected before the production integration: FAIL on the note duration.

- [ ] **Step 3: Verify focused GREEN**

Run:

```bash
cd opendaw
npm run test -w @opendaw/app-studio -- --run \
  src/midi/MidiNoteSpans.test.ts \
  src/agent/music/MidiAsset.test.ts \
  src/agent/DawProjectAdapter.test.ts
```

Expected: all focused tests pass.

### Task 4: Required verification and PR

**Files:**
- Modify only if verification exposes a defect in the scoped change.

- [ ] **Step 1: Run required checks**

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
npm run build -w @opendaw/app-studio
npm run test -w @opendaw/app-studio
cd ..
git diff --check
```

- [ ] **Step 2: Commit and push**

Commit the design separately from implementation, then push
`codex/opendaw-midi-expression`.

- [ ] **Step 3: Create the pull request**

Create a PR into `main` describing the CC64 source-to-project data flow,
explicitly noting that other expressive MIDI still requires a future generic
expression lane.
