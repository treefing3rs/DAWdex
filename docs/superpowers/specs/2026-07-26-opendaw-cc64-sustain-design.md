# OpenDAW CC64 Sustain Import Design

## Goal

Preserve the audible meaning of MIDI sustain-pedal events when DAWdex or
openDAW imports an existing MIDI asset. A note released while CC64 is down must
continue until the pedal is released, the same pitch is retriggered, or the
source ends.

## Current failure

`@opendaw/lib-midi` decodes controller events, but both the DAWdex asset
compiler and openDAW's manual MIDI importer only visit Note On and Note Off.
The project model then stores only `NoteEventBox` spans. As a result, CC64 is
present in the source file but has no audible effect after import.

The `sustain` field in `TrackSoundDesign` is an ADSR envelope level and is not
MIDI CC64.

## Chosen approach

Add one shared Studio-side MIDI note-span decoder that consumes each channel's
ordered `ControlEvent` stream and resolves CC64 into note durations:

- CC64 values 64–127 mean pedal down; 0–63 mean pedal up.
- Note Off closes a note immediately when the pedal is up.
- Note Off defers release while the pedal is down.
- Pedal up closes all deferred notes at that tick.
- Retriggering a sustained pitch closes the older span at the retrigger tick.
- End-of-track closes any remaining active or sustained notes.

The decoder returns ordinary note spans. DAWdex can therefore retain its
existing looping, transposition, range normalization, fingerprint, undo, and
`NoteEventBox` write path. The manual MIDI importer uses the same decoder, so
drag/import and Agent import agree.

## Why CC64 becomes note duration

The current openDAW note-region schema has no raw per-clip MIDI CC lane.
Creating a new editable controller-lane model would require box schemas, DSP
playback, editing UI, import/export, clipboard, undo, and migration work. That
is a separate feature. Resolving CC64 into note spans gives correct audible
sustain now without pretending that ADSR sustain is a pedal.

## Other expressive MIDI

Pitch bend, channel/poly aftertouch, program changes, and CC values other than
CC64 remain decoded by `@opendaw/lib-midi` but are not mapped into internal
instrument automation by this change. They need explicit instrument-specific
targets or a future generic MIDI-expression lane; silently inventing mappings
would be musically incorrect.

## Safety and edge cases

- Sustain processing is channel-local.
- Drum channel 10 is decoded by the same utility, but DAWdex drum pitch mapping
  and range behavior remain unchanged.
- Notes are always at least one tick long.
- Pedal state never leaks across a source loop; resolved note spans are clipped
  by the existing bar fitter.
- Malformed or unmatched Note Off events are ignored, matching current import
  tolerance.

## Verification

- Unit fixtures prove pedal-down, deferred Note Off, pedal-up, retrigger, and
  source-end behavior.
- Existing no-pedal fixtures retain their current note counts and durations.
- DAWdex adapter integration proves the created `NoteEventBox` duration includes
  the CC64-held portion.
- Agent Server and Studio required builds/tests plus `git diff --check` pass.
