# Easy MIDI Library

MIDI assets are grouped by instrument family while preserving their original
library-relative directory structure.

The licensed MIDI asset pack is intentionally installed locally and is not
stored in Git. Each developer must provision `bass/`, `drums/`, and `keys/`
under this directory while preserving their relative paths. MIDI files under
this directory are ignored; this README remains tracked as the library
contract.

| Category | MIDI files | Bytes |
|---|---:|---:|
| `bass/` | 8,053 | 4,832,398 |
| `drums/` | 164,441 | 89,573,731 |
| `keys/` | 22,059 | 6,974,486 |
| **Total** | **194,553** | **101,380,615** |

The six zero-filled `.mid` files under the two
`Fox_Samples/Piano_in_Silence/` trees are preserved verbatim from the source
library. All other files begin with a standard MIDI `MThd` header.

## One-time migration from a tracked checkout

Do not pull the commit that externalizes this library until the existing MIDI
directory has been copied to a verified location outside the repository.
During the first pull, Git removes files that were tracked by the previous
revision; `.gitignore` prevents future tracking but does not protect files
during that transition.

Recommended migration:

1. Stop the Agent server and copy `midi/easy/` to a durable directory outside
   the repository.
2. Verify that the copy contains the expected `bass/`, `drums/`, and `keys/`
   directories and file counts.
3. Pull the repository update only after the copy has been verified.
4. Set `DAWDEX_MIDI_ROOT` to the external `easy/` directory before indexing or
   starting the Agent server.

If a developer wants to keep the library at the legacy in-repository path,
they must still make the external safety copy first, pull the update, and then
copy the files back into `midi/easy/`. The restored files will be ignored by
Git.

## DAWdex catalog

DAWdex retrieves files from this library instead of generating replacement
note patterns. Build or refresh the local SQLite metadata catalog after the
MIDI library changes:

```powershell
cd opendaw
npm.cmd run index:midi -w @dawdex/agent-server
```

The generated catalog is stored at `midi/.dawdex/catalog.sqlite` and is ignored
by Git. It contains paths, roles, style tags, tempo, length, pitch range,
density, and content fingerprints for filtering, ranking, and duplicate
suppression. The Agent server falls back to a smaller curated directory scan
when the catalog does not exist.
