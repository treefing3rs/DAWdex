# Easy MIDI Library

MIDI assets are grouped by instrument family while preserving their original
library-relative directory structure.

The team currently keeps this authorized library in Git so every checkout uses
the same files at the same `midi/easy/` path. A future external-library
migration must be handled as a separate, coordinated change.

| Category | MIDI files | Bytes |
|---|---:|---:|
| `bass/` | 8,053 | 4,832,398 |
| `drums/` | 164,441 | 89,573,731 |
| `keys/` | 22,059 | 6,974,486 |
| **Total** | **194,553** | **101,380,615** |

The six zero-filled `.mid` files under the two
`Fox_Samples/Piano_in_Silence/` trees are preserved verbatim from the source
library. All other files begin with a standard MIDI `MThd` header.

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
