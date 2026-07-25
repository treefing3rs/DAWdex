# DAWdex Local CLI Runtime Adapter Design

**Date:** 2026-07-25  
**Status:** Ready for user review  
**Branch:** `codex/local-cli-runtime-adapter`

## 1. Outcome

DAWdex will automatically detect supported local agent CLIs that are actually
installed and invocable, let the user select one, and use that selection for
Creative Brief and arrangement planning.

This work is deliberately split from the CRT and keyboard frontend:

- Kimi owns the physical Setting key and keyboard-screen presentation.
- This branch owns local CLI detection, runtime status, persisted selection,
  safe process invocation, and the HTTP contract consumed by that screen.
- The branches join through JSON/SSE contracts rather than shared UI code.

The existing Codex ChatGPT `app-server`, OpenAI API fallback, MIDI catalog,
plan validation, DAW adapter, Undo behavior, room UI, and keyboard UI remain
authoritative in their current modules.

## 2. Scope

### Included

1. A registry of DAWdex-compatible local CLI adapters.
2. GUI-safe executable discovery on macOS, Linux, and Windows.
3. A bounded version probe that proves the resolved executable can spawn.
4. Incremental scan events and a cached scan snapshot.
5. Persistent selection of execution mode, runtime, and model.
6. A Kimi CLI planning provider that returns the same validated
   `CreativeBrief` and `PlanOutput` structures as the existing providers.
7. Routing a selected runtime into the current planning pipeline.
8. A stable HTTP contract for Kimi's keyboard-screen Settings page.
9. Unit and route tests using temporary fake executables and injected process
   runners.

### Excluded

- Any edit to `AgentOverlay.tsx`, `AgentOverlay.sass`, scene assets, object
  hotspots, or keyboard-screen layout.
- An installable CLI catalog.
- Installing, updating, or logging into third-party CLIs.
- Copying Open Design's complete daemon or Settings product.
- Open Design's own CLI/runtime identity.
- Changes to MIDI retrieval, musical schemas, plan approval, DAW execution,
  Undo, or the existing Codex `app-server` implementation.
- Arbitrary user-supplied executable paths.
- Session resume, MCP forwarding, image input, and user-facing tool execution
  for the Kimi planning provider.

## 3. Initial Compatibility Set

The first release supports three local CLIs. All three commands are installed
on the target machine:

| Runtime | Command | Local verification | Planning transport |
|---|---|---|---|
| Codex CLI | `codex` | `codex-cli 0.145.0-alpha.30` | Existing `CodexAppServer` |
| Kimi CLI | `kimi` | `0.29.1` | `kimi --prompt ... --output-format text` |
| Qoder CLI | `qodercli` | `1.1.5` | `qodercli -p --output-format stream-json` |

Codex is not reimplemented through `codex exec`; selecting Codex delegates to
the current `CodexAppServer`, preserving ChatGPT login, structured output, rate
limits, and current behavior.

Kimi and Qoder receive new adapters because both expose bounded non-interactive
prompt modes. Each adapter executes in an empty DAWdex-owned temporary working
directory and asks for structured data only.

Qoder's official CLI documentation confirms `qodercli` as the command,
`--version` as the installation probe, `-p` as print mode, and
`text`/`json`/`stream-json` output formats. The installed 1.1.5 command surface
also exposes `--list-models`, `--tools`, `--permission-mode dont_ask`,
`--no-session-persistence`, and `--max-output-tokens`. Authentication remains
Qoder-owned through a persisted `qodercli login` session or the inherited
`QODER_PERSONAL_ACCESS_TOKEN`; DAWdex never stores or returns that token.

The registry is intentionally extensible. A newly detected command is not
selectable until DAWdex has an adapter that can produce both validated output
stages. This prevents a Settings row from promising functionality based only
on a filename found on `PATH`.

## 4. Components

### 4.1 `LocalCliRegistry`

Contains declarative definitions for supported runtimes:

```ts
type LocalCliDefinition = {
    readonly id: "codex" | "kimi" | "qoder"
    readonly name: string
    readonly command: string
    readonly fallbackCommands: ReadonlyArray<string>
    readonly versionArgs: ReadonlyArray<string>
    readonly versionProbeTimeoutMs: number
    readonly supportsModelOverride: boolean
}
```

The registry contains no filesystem scanning and no child-process state. Adding
a future runtime requires a definition plus a provider implementation and
tests.

### 4.2 `LocalCliDiscovery`

Discovery creates a GUI-safe search path by preserving the server's existing
`PATH` and appending common user toolchain directories:

- `~/.local/bin`
- `~/.npm-global/bin`
- `~/.bun/bin`
- `~/.cargo/bin`
- `/opt/homebrew/bin`
- `/usr/local/bin`
- platform-specific executable suffixes on Windows

For each registered runtime it:

1. Resolves a concrete executable candidate without using a shell.
2. Spawns that exact path with its version arguments.
3. Applies a three-second default timeout and a small output buffer.
4. Marks `ENOENT`, `ENOTDIR`, `EACCES`, exit 126, and exit 127 as unavailable.
5. Treats other version-command failures as invocable with an unknown version,
   because the program did start.
6. Returns only display-safe paths, replacing the home-directory prefix with
   `~`; the raw resolved path stays server-side.

Scanning registered runtimes runs concurrently. Each completed probe emits an
incremental event so the keyboard screen can populate rows without waiting for
the slowest CLI.

### 4.3 `RuntimeSelectionStore`

Selection is non-secret data persisted at:

```text
~/.dawdex/runtime-selection.json
```

Tests override the location with `DAWDEX_STATE_DIR`.

The file contains:

```json
{
  "mode": "local-cli",
  "runtimeId": "codex",
  "model": null
}
```

The validated selection is a discriminated union:

```ts
type RuntimeSelection =
    | {readonly mode: "auto", readonly runtimeId: null, readonly model: null}
    | {
        readonly mode: "local-cli"
        readonly runtimeId: "codex" | "kimi" | "qoder"
        readonly model: string | null
    }
    | {readonly mode: "api-key", readonly runtimeId: null, readonly model: null}
```

`api-key` selects the existing OpenAI API provider; API keys remain supplied by
the Agent Server environment and are never written to the selection file.

Writes use a temporary sibling file followed by rename. Unknown modes,
unregistered runtimes, unavailable runtimes, oversized model strings, and
models unsupported by the adapter are rejected before persistence.

`DAWDEX_AGENT_PROVIDER` remains an operator override. When set to a concrete
provider it takes precedence over the persisted UI selection; the status API
reports that the selection is locked by environment configuration.

### 4.4 `KimiCliProvider`

The Kimi provider implements the same two planning operations used by the
current pipeline:

```ts
interface StructuredPlanningProvider {
    createCreativeBrief(
        prompt: string,
        snapshot: ProjectSnapshot
    ): Promise<CreativeBrief>

    createPlan(
        prompt: string,
        snapshot: ProjectSnapshot,
        brief: CreativeBrief,
        candidates: ReadonlyArray<MidiCandidate>
    ): Promise<PlanOutput>
}
```

Invocation rules:

- `execFile`/`spawn` with an argument array; never a shell command string.
- Executable path comes only from the latest server-owned successful scan.
- Prompt is sent through Kimi's verified non-interactive `--prompt` mode.
- `--output-format text` is fixed by the adapter.
- `--model` is added only for a validated non-default model selection.
- Working directory is an empty DAWdex-owned temporary directory.
- The prompt explicitly forbids filesystem inspection and tool use and asks
  only for the requested structured JSON.
- The adapter does not pass `--auto` or `--yolo`; an unexpected permission
  request cannot be auto-approved and will terminate through the invocation
  timeout.
- Timeout defaults to 90 seconds and is configurable with
  `DAWDEX_KIMI_TIMEOUT_MS`.
- Standard output is capped; standard error is retained only as a short
  diagnostic tail.
- The result passes through the existing Zod schemas and parsing functions.
  Invalid JSON or schema mismatch fails the request without reaching MIDI
  selection or DAW execution.

The provider does not read or copy Kimi credentials. Authentication remains
owned by the installed CLI.

### 4.5 `QoderCliProvider`

The Qoder provider implements the same `StructuredPlanningProvider` interface.
Its invocation differs from Kimi:

- Prompt content is written to standard input rather than placed in an
  argument, avoiding command-line length limits.
- Fixed arguments are `-p`, `--output-format`, `stream-json`,
  `--permission-mode`, `dont_ask`, `--tools`, `""`,
  `--no-session-persistence`, and a bounded `--max-output-tokens` value.
- `--yolo`, `--dangerously-skip-permissions`, `accept_edits`, and
  `bypass_permissions` are explicitly forbidden. Open Design uses `--yolo`
  for a general coding agent, but DAWdex needs structured planning rather than
  autonomous workspace modification.
- In Qoder headless mode, `dont_ask` fails closed instead of opening an
  approval prompt, while `--tools ""` removes built-in tools from the run.
  Combined with an empty temporary workspace, this is the narrowest boundary
  exposed by the installed CLI without claiming an OS sandbox.
- `-w` points only to the DAWdex-owned temporary directory.
- The discovery service uses `--list-models` after a successful version probe.
  `--model` accepts only a model identifier returned by that installed CLI.
  If live model discovery fails, Settings falls back to the documented tiers
  `lite`, `efficient`, `auto`, `performance`, and `ultimate`; `null` preserves
  the CLI's saved default.
- The adapter parses Qoder's JSONL wrapper records. It concatenates text blocks
  from `assistant` messages, captures the model/version from the `system/init`
  record, and treats a `result` record with `is_error: true` as a failed
  invocation.
- The completed assistant text is parsed by the same existing Zod schemas as
  Codex and Kimi.

The provider does not read or copy Qoder credentials. A persisted Qoder login
or inherited `QODER_PERSONAL_ACCESS_TOKEN` remains owned by Qoder CLI.

### 4.6 `LocalRuntimeService`

This service owns the cached scan, incremental listeners, selection validation,
and adapter lookup.

It exposes a single typed boundary to the HTTP layer and the planning router:

```ts
interface LocalRuntimeService {
    snapshot(): Promise<RuntimeSnapshot>
    scan(onRuntime: (runtime: RuntimeSummary) => void): Promise<RuntimeSnapshot>
    select(input: RuntimeSelectionInput): Promise<RuntimeSnapshot>
    selectedProvider(): Promise<SelectedPlanningProvider>
}
```

Concurrent scan requests share one in-flight promise. Repeated Settings opens
do not spawn duplicate probes.

### 4.7 Planning router integration

The current automatic route remains:

```text
Codex ChatGPT account -> OpenAI API -> local frontend fallback
```

The persisted selection changes it as follows:

- `auto`: preserve the existing route exactly.
- `codex`: use the existing `CodexAppServer`; return its real error rather than
  silently using a different provider.
- `kimi`: use `KimiCliProvider`; return its real error rather than silently
  using a different provider.
- `qoder`: use `QoderCliProvider`; return its real error rather than silently
  using a different provider.
- `api-key`: preserve the existing strict OpenAI selection.

An explicit selection is strict because silently switching models would make
the physical Setting key misleading. The Studio's existing local planning
fallback may still activate after the Agent Server request fails; that behavior
is outside this branch and remains visible to the user as a fallback source.

`ProviderSource` expands from:

```ts
"codex" | "model"
```

to:

```ts
"codex" | "kimi" | "qoder" | "model"
```

This is the only required plan-response contract addition for the frontend
merge.

## 5. HTTP Contract

### 5.1 Current snapshot

```http
GET /v1/runtimes
```

Example response:

```json
{
  "scan": {
    "state": "complete",
    "startedAt": "2026-07-25T07:30:00.000Z",
    "completedAt": "2026-07-25T07:30:00.412Z"
  },
  "selection": {
    "mode": "local-cli",
    "runtimeId": "codex",
    "model": null,
    "lockedByEnvironment": false
  },
  "runtimes": [
    {
      "id": "codex",
      "name": "Codex CLI",
      "available": true,
      "selectable": true,
      "displayPath": "~/.local/bin/codex",
      "version": "codex-cli 0.145.0-alpha.30",
      "authState": "authenticated",
      "models": [
        {"id": "default", "label": "Default (CLI config)"}
      ],
      "modelsSource": "default"
    }
  ]
}
```

The endpoint performs an initial scan if no snapshot exists. Later reads return
the cache immediately.

### 5.2 Incremental rescan

```http
GET /v1/runtimes/scan
Accept: text/event-stream
```

Events:

```text
event: scan-started
data: {"startedAt":"..."}

event: runtime
data: {"id":"codex","available":true,...}

event: runtime
data: {"id":"kimi","available":true,...}

event: scan-complete
data: {"scan":{...},"selection":{...},"runtimes":[...]}
```

Unavailable definitions may be emitted during diagnostics but are omitted from
the normal selectable list. A previously selected runtime that disappears is
retained once with `available: false`, `selectable: false`, and a diagnostic so
the keyboard screen can explain the invalid state.

### 5.3 Select execution mode

```http
POST /v1/runtimes/selection
Content-Type: application/json
```

Request:

```json
{
  "mode": "local-cli",
  "runtimeId": "kimi",
  "model": null
}
```

Success returns the updated `RuntimeSnapshot`. Invalid or unavailable
selections return `400`; an environment-locked selection returns `409`.

### 5.4 Compatibility status

`GET /v1/provider/status` keeps all existing fields. It gains a
`runtimeSelection` field containing the same public selection and active
runtime summary. Existing clients that ignore unknown fields continue working.

## 6. Keyboard-Screen Merge Contract

Kimi's frontend needs only four operations:

1. Open the Setting screen and call `GET /v1/runtimes`.
2. Start `EventSource("/v1/runtimes/scan")` when the user presses rescan.
3. Submit the chosen row to `POST /v1/runtimes/selection`.
4. Accept `"kimi"` and `"qoder"` as valid plan `source` values.

The frontend does not resolve paths, run version commands, infer
authentication, or persist selection.

The physical key, screen routing, focus behavior, icons, pressed-state
animation, and visual styling remain entirely in Kimi's branch.

## 7. Failure Behavior

| Failure | Server behavior | Keyboard-screen result |
|---|---|---|
| Command absent | Runtime unavailable | Not shown unless it was selected previously |
| Broken shim or permission error | Runtime unavailable with diagnostic | Disabled previous selection with explanation |
| Version flag fails after spawn | Available, version `null` | “Version unknown” |
| Scan probe times out | Runtime unavailable for this scan | Other rows continue arriving |
| Selected runtime disappears | Planning request fails before model invocation | Prompt to rescan or change runtime |
| CLI not authenticated | Provider returns a short authentication error | Keep selection; show runtime-specific login guidance |
| CLI emits invalid JSON | Zod parsing rejects output | No MIDI lookup result is approved or executed |
| CLI exceeds timeout/buffer | Child is terminated, request fails | Retry or switch runtime |
| Settings file is corrupt | Ignore invalid file and use `auto` | Status reports recovered default |
| Agent Server restarts | Reload persisted non-secret selection | Keyboard screen reflects previous choice |

No runtime failure is allowed to mutate project state. The existing
retrieve-validate-approve-execute boundary remains the only route to DAW
changes.

## 8. Security and Privacy

- Only registry-owned executable names are scanned.
- Only a server-resolved path can be launched.
- No request field becomes a command, shell fragment, environment-variable
  name, or executable path.
- Child processes use argument arrays and bounded resources.
- No credentials, CLI config contents, tokens, or raw home path are returned.
- The provider temporary directory contains only short-lived planning
  artifacts and is removed on disposal.
- Kimi and Qoder run in separate empty directories, receive no DAWdex workspace
  path, and are never granted automatic tool approval. DAWdex does not claim
  stronger filesystem isolation than either host CLI can enforce.
- Structured plan validation and exact MIDI-candidate validation remain
  mandatory after any provider returns.

## 9. Provenance

The design adopts the useful boundaries demonstrated by Open Design's
Apache-2.0 runtime layer: declarative definitions, GUI-safe path construction,
exact-path version probing, bounded child processes, incremental detection,
and a separation between discovery and invocation.

DAWdex will implement the smaller adapter independently rather than copying the
full Open Design daemon. If any source fragment or icon is later copied rather
than reimplemented, its Apache-2.0 notice and modification attribution must be
preserved in the repository.

## 10. Verification

Automated coverage must prove:

1. Search-path augmentation finds a fake executable outside the inherited
   `PATH`.
2. A real successful version probe produces an available runtime with a
   display-safe path.
3. Missing, non-executable, broken-shim, and timed-out commands are not
   selectable.
4. Concurrent scans share one operation and emit each completed runtime once.
5. Selection rejects arbitrary runtime IDs and unavailable runtimes.
6. Selection persists atomically and reloads after service recreation.
7. Corrupt persisted state recovers to `auto`.
8. Kimi arguments are fixed, shell-free, bounded, and include a model only
   when permitted.
9. Kimi valid output passes existing Creative Brief and Plan parsing.
10. Kimi invalid output, timeout, and non-zero exit produce controlled errors.
11. Qoder consumes the prompt from stdin, disables tools, never uses a bypass
    permission mode, restricts model values to live `--list-models` results or
    the five documented fallbacks, and extracts final assistant text from
    representative `stream-json` records.
12. Qoder error records, malformed JSONL, timeout, and non-zero exit produce
    controlled errors.
13. Runtime HTTP routes return the documented status codes and SSE events.
14. New routing tests prove that `auto`, explicit Codex, explicit Kimi,
    explicit Qoder, and `api-key` selections choose the documented provider
    without changing the existing Codex/OpenAI behavior.
15. Agent Server build and complete test suite pass.
16. Studio build and tests pass after Kimi connects the frontend contract.
17. `git diff --check` reports no whitespace errors.

## 11. Integration Sequence

1. Land this backend branch without frontend-file changes.
2. Kimi completes the physical Setting key and keyboard-screen routing.
3. Rebase the backend branch onto the final frontend `main`.
4. Connect the four HTTP operations from Section 6.
5. Run Agent Server and Studio verification.
6. Perform a real-machine scan and confirm the screen reports the installed
   Codex, Kimi, and Qoder versions.
7. Confirm Qoder model discovery returns the signed-in account's live list or
   the documented fallback tiers without exposing credentials.
8. Select each available runtime and generate one Creative Brief and one
   validated plan without approving DAW execution.
9. Approve one plan only after all provider outputs have passed schema and
   MIDI-candidate validation.

This sequence keeps frontend work, runtime plumbing, and music execution
independently reviewable until the final integration.

## 12. Qoder References

- [Qoder CLI Quick Start](https://docs.qoder.com/en/cli/quick-start)
- [Qoder CLI print mode and flags](https://docs.qoder.com/en/cli/using-cli)
- [Qoder CLI permission modes](https://docs.qoder.com/en/cli/permissions)
- [Qoder CLI model tiers](https://docs.qoder.com/en/cli/model)
