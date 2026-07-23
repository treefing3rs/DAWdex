# DAWdex

> A Codex-like desktop agent for music production that understands creative intent and operates your DAW directly.

DAWdex 是一个直接操控 DAW 的 Electron Agent App。它读取 Ableton Live 工程，理解用户的创作或修改意图，制定可解释的制作计划，并通过 MCP 在 DAW 中完成可继续编辑的编曲操作。

弹幕实时编曲是 DAWdex 的一个演示 Skill，不是产品本体。

## Product loop

```text
User request
  → DAW context
  → Music Director plan
  → role proposals
  → user approval
  → serialized MCP tool calls
  → Ableton read-back verification
  → Before / After
```

## Architecture

```text
Electron UI
  → Open Agent Runtime Adapter
  → MCP Host
  → ableton-mcp
  → AbletonMCP Remote Script
  → Ableton Live 12
```

The concrete open-source agent runtime is intentionally undecided. Candidates are evaluated behind a provider-neutral runtime contract instead of being coupled to the product UI.

## Current status

- Product definition and UX architecture documented.
- Ableton Live 12.1.5 connection verified locally.
- Ableton MCP can inspect projects, create MIDI tracks and clips, add notes, load native sounds, place clips in Arrangement, and control playback.
- A 32-bar, four-track MIDI arrangement has been created through the Agent → MCP → Ableton path.
- Electron application implementation has not started yet.

## Documentation

- [Product requirements](docs/PRD_DAWdex.md)
- [Technical specification](docs/DAWdex_TechSpec.md)
- [Architecture](docs/architecture.md)
- [Coding conventions](docs/coding-conventions.md)
- [Division of labor](docs/division-of-labor.md)
- [Contribution workflow](CONTRIBUTING.md)

## Repository layout

```text
docs/          Product and engineering specifications
patches/       Reproducible patches for local third-party integrations
prd生成/       Original product research and hackathon references
third_party/   Local dependency checkouts; ignored by the main repository
```

## Ableton MCP development setup

Clone the upstream dependency locally:

```bash
git clone https://github.com/ahujasid/ableton-mcp.git third_party/ableton-mcp-upstream
```

Apply the DAWdex local connection patch:

```bash
git -C third_party/ableton-mcp-upstream apply ../../patches/ableton-mcp-localhost-8765.patch
```

The patch changes the Remote Script connection from `0.0.0.0:9877` to `127.0.0.1:8765`, matching the verified local setup.

Do not commit API keys, `.env` files, local Codex configuration, Ableton project files, or rendered audio directly. Use environment variables, Git LFS, or agreed shared storage.

## Collaboration

Development happens through short-lived branches and pull requests. Do not push feature work directly to `main`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the three-person workflow.
