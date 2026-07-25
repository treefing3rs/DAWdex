# DAWdex Docs Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile DAWdex documentation with the merged 0.3.0 implementation and establish full-song creation as the official next product direction.

**Architecture:** Use one canonical product-vision document for durable definitions, then make README, PRD, architecture, technical, design, and historical handoff documents point to the same current-versus-next boundary. Preserve old delivery plans as historical records rather than silently presenting them as current truth.

**Tech Stack:** Markdown, Git, GitHub PR history, current TypeScript implementation evidence.

---

### Task 1: Establish the canonical document map

**Files:**
- Create: `docs/README.md`
- Create: `docs/PRODUCT_VISION.md`

- [x] **Step 1: Add the documentation authority index**

Create `docs/README.md` with:

```markdown
# DAWdex 文档索引

`README.md` is the repository entrypoint. `PRODUCT_VISION.md` owns the durable product definition. `PRD_DAWdex.md`, `architecture.md`, and `DAWdex_TechSpec.md` own product requirements, system boundaries, and implementation contracts respectively. Date-stamped handoffs and division plans are historical evidence.
```

- [x] **Step 2: Add the complete product conclusion**

Create `docs/PRODUCT_VISION.md` defining:

```text
DAWdex = full-song AI virtual studio harness
frontend = operable animated translation of openDAW
current baseline = 0.3.0 loop-oriented vertical slice
next direction = Song Blueprint -> Section -> Phrase -> Region -> Notes
```

The document must separate implemented facts, formal next-phase definitions, future hypotheses, and explicit non-goals.

- [x] **Step 3: Verify discoverability**

Run:

```bash
rg -n "PRODUCT_VISION|完整歌曲|0.3.0" README.md docs
```

Expected: the canonical vision and current baseline are easy to locate from the repository entrypoint.

### Task 2: Reconcile product and architecture truth

**Files:**
- Modify: `README.md`
- Modify: `docs/PRD_DAWdex.md`
- Modify: `docs/architecture.md`
- Modify: `docs/DAWdex_TechSpec.md`

- [x] **Step 1: Rewrite the current-state section**

State that 0.3.0 includes real MIDI catalog retrieval/import, plan approval, undo, real UI event bridging, audible-state gating, five role assets, elevator intro, and six room channels. Do not claim complete-song generation is implemented.

- [x] **Step 2: Add the full-song hierarchy and workflow**

Use this shared hierarchy:

```text
Song Blueprint
└── Section
    └── Phrase
        └── Region
            └── Notes
```

Use this workflow:

```text
request -> creative brief -> song blueprint -> retrieve real MIDI
-> arrange exact assets -> constrained transformations -> validate
-> user approval -> patch openDAW -> listen/evaluate -> next turn
```

- [x] **Step 3: Separate MIDI from sound**

Document that MIDI answers what is played, while SoundFont, sampler, synth, effects, and mix answer how it sounds. The formal sound catalog remains unfinished.

- [x] **Step 4: Verify obsolete current-state claims are removed**

Run:

```bash
rg -n "只有四种固定|尚未实现.*MIDI 检索|PR #6.*待|当前版本.*0\\.2" README.md docs/PRD_DAWdex.md docs/architecture.md docs/DAWdex_TechSpec.md
```

Expected: no obsolete claim is presented as current truth.

### Task 3: Reconcile frontend design documentation

**Files:**
- Modify: `docs/design/README.md`
- Modify: `docs/design/DESIGN_DIRECTION.md`
- Modify: `docs/design/STAGE_UI.md`

- [x] **Step 1: Update merged implementation status**

Record that PR #11 landed the v2 character assets, first-event entrances, elevator intro, room touring, and current real bridge behavior.

- [x] **Step 2: Preserve the causal-translation rule**

Keep this rule explicit:

```text
Every meaningful visual state names its source event.
No audible confirmation -> no performing animation.
```

- [x] **Step 3: Add full-song frontend growth path**

Describe the control-room arrangement board as the diegetic representation of Song Blueprint and section state. Keep real level meters and object hotspots as future work.

- [x] **Step 4: Verify design status language**

Run:

```bash
rg -n "PR #11|六个频道|真实事件|编曲白板|完整歌曲" docs/design
```

Expected: current implementation and next-phase design are both represented without conflation.

### Task 4: Mark historical documents and update submission facts

**Files:**
- Modify: `docs/HANDOFF_2026-07-24.md`
- Modify: `docs/division-of-labor.md`
- Modify: `docs/gallery-submission.md`
- Create: `docs/DEMO_RUNBOOK.md`

- [x] **Step 1: Add historical banners**

Mark the date-stamped handoff and team division document as historical snapshots superseded by `docs/README.md` and `docs/PRODUCT_VISION.md`. Preserve their original detail as evidence.

- [x] **Step 2: Reconcile gallery wording**

Update the public-facing summary to describe the current 0.3.0 vertical slice truthfully and frame complete-song creation as the product direction, not a shipped feature.

- [x] **Step 3: Absorb the current demo runbook**

Move the useful Kimi delivery into the repository, correct its startup paths, and keep Mock, real, fallback, MIDI-index, sound-catalog, and complete-song claims honest.

- [x] **Step 4: Check links and formatting**

Run:

```bash
git diff --check
for path in README.md docs/README.md docs/PRODUCT_VISION.md docs/PRD_DAWdex.md docs/architecture.md docs/DAWdex_TechSpec.md docs/design/README.md docs/design/DESIGN_DIRECTION.md docs/design/STAGE_UI.md docs/HANDOFF_2026-07-24.md docs/division-of-labor.md docs/gallery-submission.md; do test -s "$path"; done
```

Expected: zero formatting errors and every authoritative document is non-empty.

### Task 5: Validate the implementation facts referenced by docs

**Files:**
- Verify only.

- [x] **Step 1: Run Studio tests and attempt the full type check**

Run:

```bash
cd opendaw
npx tsc --noEmit -p packages/app/studio/tsconfig.json
npm run test -w @opendaw/app-studio
```

Expected: TypeScript succeeds and Studio tests pass.

- [x] **Step 2: Run Agent Server checks**

Run:

```bash
cd opendaw
npm run build -w @dawdex/agent-server
npm run test -w @dawdex/agent-server
```

Expected: Agent Server builds and tests pass.

- [x] **Step 3: Review final diff**

Run:

```bash
git diff --stat
git diff --check
git status --short
```

Expected: only documentation files change, with no generated MIDI catalog or application code modifications.

## Verification outcome

- `@opendaw/app-studio`: 10 test files, 33 tests passed.
- `@dawdex/agent-server`: build passed; 2 test files, 9 tests passed.
- Markdown relative links, changed-line whitespace and `git diff --check`: passed.
- Full Studio type/build could not complete in this Mac environment because
  `@opendaw/studio-core-wasm` requires `cargo`, which is not installed. The direct
  type check reached only that missing module after the other Studio dependencies
  were built. No application source file was changed.
