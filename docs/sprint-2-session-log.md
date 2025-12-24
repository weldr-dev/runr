# Sprint 2 Session Log

**Period**: December 23-24, 2025 (~30 hours)
**Goal**: Make the agent framework "faster and more useful" with measurement capabilities

---

## Summary

This session implemented the KPI measurement system (Task 001) and Context Packer v1 (Task 002) for Sprint 2. The work focused on:
1. Deriving KPIs from timeline events at report time (no boot chain changes)
2. Building a compare command to diff two runs
3. Creating a context pack to reduce IMPLEMENT churn by providing verification commands, reference patterns, and config templates

---

## Major Features Implemented

### 1. KPI Summary in Report Command (Task 001a)

**Files changed:**
- `src/commands/report.ts` - Core KPI computation
- `src/commands/__tests__/report.test.ts` - 15 test fixtures

**What it does:**
- Streams through `timeline.jsonl` to compute:
  - Total duration and unattributed time
  - Phase durations (plan, implement, review, verify) with counts
  - Worker calls (claude/codex) - shows "unknown" not "0" for older runs
  - Verification attempts and retries
  - Milestones completed
  - Outcome (complete/stopped/running) with stop reason
- Added `--kpi-only` flag for compact output
- Added `latest` support for run ID

**Key design decisions:**
- Read-only derivation from timeline (no schema changes)
- Graceful degradation for older runs without worker_stats events
- Unattributed time = total_duration - sum(phase_durations)

### 2. Compare Command (Task 001b)

**Files changed:**
- `src/commands/compare.ts` - New file
- `src/cli.ts` - Wiring

**What it does:**
- Loads KPIs for two runs and shows side-by-side comparison
- Shows delta (Δ) for: duration, unattributed, worker calls, verification, milestones, phases
- Highlights phases with 20%+ increase with warning indicator

### 3. Context Packer v1 (Task 002)

**Files changed:**
- `src/context/pack.ts` - Core pack builder (~310 lines)
- `src/context/artifact.ts` - Persistence helpers
- `src/context/index.ts` - Exports
- `src/context/__tests__/pack.test.ts` - 15 tests
- `src/context/__tests__/artifact.test.ts` - 10 tests

**What it does:**
- Builds a context pack containing:
  - Verification commands from config (tier0, tier1, tier2)
  - Reference files (e.g., RNG pattern from deckbuilder)
  - Scope constraints (allowlist/denylist)
  - Nearest config patterns (tsconfig, eslint, package.json)
- `formatContextPackForPrompt()` renders pack as ~500 tokens for prompt injection
- `estimatePackTokens()` provides rough token count

**Known patterns:**
- RNG pattern → `apps/deckbuilder/src/engine/rng.ts`
- Types pattern → `apps/deckbuilder/src/engine/types.ts`

### 4. Context Pack Integration

**Files changed:**
- `src/workers/prompts.ts` - Added `contextPack?: string` parameter
- `src/supervisor/runner.ts` - Build and inject pack in handleImplement

**Wiring:**
- Flag-gated via `CONTEXT_PACK=1` environment variable
- Pack is built in `handleImplement()` before calling worker
- Injected at top of prompt under `## CONTEXT PACK (read first)` header
- Pack is persisted to `artifacts/context-pack.json` for debugging

### 5. Context Pack Artifact Persistence

**Files changed:**
- `src/context/artifact.ts` - write/read/format helpers
- `src/commands/report.ts` - Shows context_pack status line

**What it does:**
- Writes `artifacts/context-pack.json` on each IMPLEMENT phase
- Report shows: `context_pack: present (N tokens)` / `disabled` / `(not found)`
- Graceful handling for older runs without the artifact

---

## Documentation Improvements

### New Documents
- `docs/vision.md` - Comprehensive "why this exists" document
- `docs/self-hosting-safety.md` - Safety guide for self-modification
- `CONTRIBUTING.md` - Contribution guidelines
- `tasks/sprint-2/*.md` - Sprint 2 task specifications

### Enhanced Documents
- `docs/glossary.md` - Complete rewrite with organized sections, examples, tables
- `README.md` - Added tagline, "Why This Exists" section
- `docs/verification.md` - Expanded with block protocol documentation
- `docs/run-store.md` - Added examples
- `templates/prompts/*.md` - Enhanced prompt templates
- Various cross-reference additions

---

## Self-Hosting Configuration

**File:** `agent.config.self.json`

Established allowlist/denylist for safe self-modification:
- **Allowlist**: `src/commands/report.ts`, `src/commands/compare.ts`, `src/context/**`, `docs/**`
- **Denylist (boot chain)**: `src/supervisor/**`, `src/store/**`, `src/workers/**`, `src/cli.ts`

---

## Issues Encountered

### 1. Verification Commands Running from Wrong Directory
**Problem:** `npm run lint` failed because it ran from repo root, not `apps/tactical-grid/`
**Fix:** Changed config to use `cd apps/tactical-grid && npm run lint` prefix
**Commit:** `d99215a`

### 2. Codex Parse Errors
**Problem:** Transient codex errors returning malformed JSON (thread.started events instead of expected output)
**Impact:** Runs failed with `implement_parse_failed`
**Status:** Infrastructure flakiness, not code issue

### 3. Run Stalling
**Problem:** Agent runs would stall mid-execution requiring `resume` command
**Observed:** Run progressed to milestone 1, then stopped responding
**Status:** Unclear root cause - possibly timeout or process issue

### 4. Dirty Worktree Guard
**Problem:** Modified config file triggered guard violation
**Fix:** Committed config changes before running

---

## Commits (Non-checkpoint, chronological)

| Commit | Description |
|--------|-------------|
| `de149ef` | Add Sprint 2 task specs |
| `9fe8aad` | Add self-hosting safety guide |
| `7b81358` | Fix self-hosting safety - no boot chain in allowlists |
| `e6d9530` | Task 001a Milestone 1 - KPI computation |
| `a3dc081` | Align documentation with implementation |
| `aae06aa` | Improve README |
| `f35388f` | Task 001a & 001b complete - compare command |
| `d50237f` | CLI wiring complete |
| `ed33e9a` | Add CONTRIBUTING.md |
| `4ec7289` | Add cross-references to docs |
| `657cede` | Add verification and implementer docs |
| `8b47d26` | Add run-store examples |
| `334fe5b` | Add JSDoc to runner.ts |
| `268770e` | Expand glossary with 11 terms |
| `665c163` | Context Packer v1 implemented |
| `070615c` | Add vision document |
| `de844f0` | Wire context pack into IMPLEMENT phase |
| `18034e1` | Context pack artifact persistence |
| `cba1ea4` | Persist context pack in handleImplement |
| `d99215a` | Fix verification command directory |

---

## Files Created This Session

### New Source Files
- `src/commands/compare.ts`
- `src/context/pack.ts`
- `src/context/artifact.ts`
- `src/context/index.ts`
- `src/context/__tests__/pack.test.ts`
- `src/context/__tests__/artifact.test.ts`
- `src/commands/__tests__/report.test.ts`

### New Documentation
- `docs/vision.md`
- `docs/self-hosting-safety.md`
- `CONTRIBUTING.md`
- `tasks/sprint-2/000_sprint_overview.md`
- `tasks/sprint-2/001_kpi_scoreboard.md`
- `tasks/sprint-2/002_context_packer.md`
- `tasks/sprint-2/002a_context_pack_artifact.md`
- `tasks/sprint-2/003_fast_path.md`
- `tasks/sprint-2/004_adaptive_autonomy.md`
- `tasks/sprint-2/005_throughput.md`

---

## Test Coverage

- **report.test.ts**: 15 tests for KPI computation
- **pack.test.ts**: 15 tests for context pack building
- **artifact.test.ts**: 10 tests for artifact persistence
- **Total new tests**: 40
- **All tests passing**: 212 total

---

## Pending Work

### Context Pack Validation
The context pack was implemented and wired, but comparison testing was interrupted:
- Baseline run `20251224183616` started but stalled at milestone 1
- Need to complete baseline run + CONTEXT_PACK=1 run
- Use `compare` to measure IMPLEMENT cycle reduction

**Success criteria:**
- IMPLEMENT cycles ≤4 (down from 10 in Run A)
- OR verify retries = 0
- OR worker calls drop ≥25%

### Remaining Sprint 2 Tasks
- Task 003: Fast Path (skip review for low-risk changes)
- Task 004: Adaptive Autonomy (graduated trust levels)
- Task 005: Throughput (parallel workers)

---

## Key Learnings

1. **Self-hosting discipline**: Boot chain files should stay in denylist; use manual patches for critical paths
2. **Flag gating**: Environment variables avoid config schema changes during experimentation
3. **Artifact persistence**: Writing structured data to run artifacts enables debugging and reporting
4. **Graceful degradation**: Show "unknown" not "0" for missing data in older runs
5. **Verification commands**: Must specify working directory explicitly when running from repo root
