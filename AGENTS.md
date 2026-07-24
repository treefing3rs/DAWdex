# DAWdex Codex Notes

Read `docs/HANDOFF_2026-07-24.md` before changing the Agent or music execution
path. Preserve unrelated uncommitted work and do not reset or rewrite the
existing Codex Provider.

## MIDI source of truth

DAWdex must retrieve and import existing MIDI assets. The production planning
path must not synthesize replacement note patterns with the legacy
`PatternCompiler` or fixed Bass/Chord/Pulse/Lead templates.

The authorized library is under `midi/easy/`:

- 194,553 MIDI files total;
- 193,320 files currently pass catalog validation;
- roles are `drums`, `bass`, and `keys`.

The Agent Server uses
`opendaw/packages/server/dawdex-agent/src/MidiCatalog.ts`. It searches a local
SQLite metadata catalog, ranks real files, removes duplicate fingerprints, and
gives the model a small list of exact asset IDs and paths. Studio then downloads
the selected asset from `/v1/midi-assets/:id`, parses it, and writes those notes
to openDAW.

The generated database is `midi/.dawdex/catalog.sqlite`. It is intentionally
ignored by Git and is never downloaded with the repository. After a fresh clone
or after changing `midi/easy/`, build it locally:

```powershell
cd opendaw
npm.cmd run index:midi -w @dawdex/agent-server
```

When the Agent Server starts successfully with the full index, its log should
report approximately:

```text
DAWdex opened 193320 indexed MIDI assets
```

If `catalog.sqlite` is missing, `MidiCatalog` falls back to scanning a much
smaller curated set of directories. That fallback is for resilience only and
must not be mistaken for full-library retrieval.

## Planning architecture

The current path is:

```text
natural-language request
-> Creative Brief (open-ended style, mood, BPM, instrumentation, search terms)
-> SQLite retrieval over the existing MIDI library
-> arranger selects exact real MIDI candidates
-> user approval
-> upsert/replace generated openDAW tracks
```

Styles are not limited to Dubstep and R&B. Those names remain in some legacy
tests and temporary instrument profiles, but the model-facing schema accepts
arbitrary styles such as House, neo-soul, jazz, ambient, or hybrids.

The formal instrument/sound catalog is a separate unfinished task. MIDI
retrieval is implemented; realistic SoundFont, drum-kit, and instrument mapping
still needs dedicated assets and should not be confused with MIDI selection.

## Required checks

After changing this path, run:

```powershell
cd opendaw
npm.cmd run build -w @dawdex/agent-server
npm.cmd run test -w @dawdex/agent-server
npm.cmd run build -w @opendaw/app-studio
npm.cmd run test -w @opendaw/app-studio
git diff --check
```
