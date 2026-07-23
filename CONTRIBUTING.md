# Contributing to DAWdex

DAWdex uses a lightweight GitHub Flow designed for a three-person team.

## Team lanes

Each person has a primary lane, but pull requests should remain reviewable by everyone.

| Lane | Primary responsibility | Typical paths |
|---|---|---|
| Experience & Story | Renderer, UI/UX, visual system, pitch and user testing | `apps/desktop/src/renderer/`, `packages/ui/`, `design/` |
| Agent & DAW | Runtime adapter, Music Director, MCP client, Ableton adapter and music acceptance | `packages/agent-runtime/`, `packages/mcp-client/`, `packages/ableton-adapter/`, `skills/` |
| Integration & Reliability | Electron Main/Preload, IPC, events, tests, packaging and demo recovery | `apps/desktop/src/main/`, `apps/desktop/src/preload/`, `packages/shared-contracts/`, `scripts/`, `.github/` |

Shared contracts require extra care:

```text
packages/shared-contracts/
packages/music-domain/
package.json
docs/architecture.md
docs/PRD_DAWdex.md
docs/track-strategy.md
```

Announce shared-contract changes before implementing them.

## Branch model

`main` must always be demoable.

Create one short-lived branch per issue:

```text
feat/electron-shell
feat/runtime-spike
feat/ableton-diagnostics
feat/music-director-plan
fix/mcp-timeout-reconciliation
docs/update-demo-flow
chore/configure-ci
```

Do not create permanent personal branches such as `alice`, `bob-dev`, or `my-work`.

## Start a task

1. Create or claim a GitHub Issue.
2. Assign one owner.
3. Write the acceptance criteria.
4. Update local `main`.
5. Create a branch.

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/short-task-name
```

## Commit style

Use Conventional Commits:

```text
feat(ui): add daw context panel
feat(agent): add runtime capability contract
feat(ableton): verify clip creation by reading arrangement
fix(queue): stop dependent writes after uncertain timeout
docs(prd): clarify danmaku as a demo skill
chore(ci): add pull request checks
```

Keep commits small and do not mix formatting, refactoring, and feature behavior unless necessary.

## Before pushing

Run:

```bash
git status
git diff --check
git diff --staged
```

When application code exists, also run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Never commit:

- `.env` or API keys;
- local `.codex/` or `.agents/` state;
- `node_modules/`, build output, or logs;
- the local `third_party/ableton-mcp-upstream` checkout;
- Ableton `.als` projects or rendered audio without an explicit Git LFS decision.

## Push and open a pull request

```bash
git push -u origin feat/short-task-name
```

Open a PR into `main`. The PR must include:

- what changed;
- why it changed;
- how it was tested;
- screenshots or video for UI work;
- Ableton verification evidence for DAW writes;
- known limitations;
- linked issue.

## Review rules

- Every PR needs at least one approval from another teammate.
- The author must not merge their own unreviewed PR.
- Changes to shared contracts, Agent permissions, Electron security, or destructive DAW tools should be reviewed by both other teammates.
- Review the behavior and failure path, not only code style.
- Resolve all blocking comments before merge.

## Merge rules

Use **Squash and merge** for normal feature branches.

The squash commit should follow Conventional Commits:

```text
feat(ui): add plan approval workflow
```

Delete the remote branch after merging.

After merge:

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/short-task-name
```

## Avoiding conflicts

- Keep PRs small and merge daily.
- One owner edits a shared contract at a time.
- Rebase or merge the latest `main` before requesting final review.
- Do not reformat unrelated files.
- Coordinate before changing `package.json`, schemas, IPC contracts, or Agent event types.
- Never use `git push --force` on `main`.
- If force-updating your own branch is unavoidable, use `--force-with-lease`.

## Ableton-specific review

Every new write action must document:

1. risk level;
2. approval policy;
3. serialized execution behavior;
4. read-back verification;
5. timeout behavior;
6. rollback or recovery limitations.

Multiple Agents may analyze in parallel, but DAW writes must remain serialized.

## Daily team rhythm

### Start of day — 10 minutes

- What did I finish?
- What will I own today?
- Which shared files will I touch?
- What is blocked?

### Midday integration

- Merge small prerequisite PRs.
- Refresh all branches from `main`.
- Run the fixed Ableton smoke flow if MCP code changed.

### End of day

- No unpushed critical work.
- Open draft PRs for unfinished branches.
- Update issue status and blockers.
- Confirm `main` is demoable.

## Releases

Use SemVer tags:

```text
v0.1.0  First hackathon MVP
v0.2.0  New backward-compatible product capability
v0.2.1  Bug fix
```

Create tags only from a reviewed commit on `main`.
