# Stability & Autonomy Roadmap

**Goal**: Prove stability → lock in benchmark loop → prune complexity → add autonomy multipliers.

**Started**: 2025-12-25
**Last Updated**: 2025-12-25 (Phases 4-7 complete)

---

## Phase 1: Validation Harness [COMPLETE]

- [x] Create `scripts/bench.ts` benchmark harness
- [x] Support presets: minimal, context, stress, full
- [x] Capture run IDs and call `summarize` for each
- [x] Output markdown table with KPIs
- [x] Output CSV export for analysis
- [x] Add npm scripts: `bench`, `bench:dry`, `bench:minimal`, `bench:context`, `bench:stress`, `bench:full`
- [x] Support `--repeat N` for variance analysis
- [x] Support `--config <path>` for custom scenarios

**Artifacts**: `scripts/bench.ts`, `bench-results.md`, `bench-report.html`

---

## Phase 2: Diagnostic Runs [COMPLETE]

### 2.1 Initial Validation Runs
- [x] Run minimal preset (noop tasks) - 2025-12-25
  - Run IDs: `20251225153352`, `20251225153524`
  - Result: noop-worktree completed, noop-no-worktree failed (guard check on dirty repo)

### 2.2 Context Pack A/B - First Attempt
- [x] Run context preset (engine-bootstrap) - 2025-12-25
  - Run IDs: `20251225153714` (ctx-off), `20251225154343` (ctx-on)
  - Result: Both stopped with `implement_blocked`
  - Root cause: verification commands running at repo root instead of `apps/tactical-grid`
  - Finding: Context pack ON was 8% faster (5m49s vs 6m19s)

### 2.3 Configuration Fixes
- [x] Create task-specific config: `tasks/tactical-grid/agent.config.json`
  - Added `verification.cwd: "apps/tactical-grid"`
  - Scoped verification commands to run in subdirectory
- [x] Enhance context pack with `blockers` guidance section
- [x] Add verification cwd to context pack output

### 2.4 Context Pack A/B - Re-run with Fixed Config [COMPLETE]
- [x] Run context preset with `--config tasks/tactical-grid/agent.config.json`
- [x] Verify runs complete (not blocked)
- [x] Compare worker_calls, verify_retries, duration

**Results** (2025-12-25):

| Metric | ctx-off (20251225171118) | ctx-on (20251225171938) |
|--------|--------------------------|-------------------------|
| Stop Reason | complete ✅ | complete ✅ |
| Duration | ~8 min | ~8 min |
| Worker Calls | 9 (claude=5, codex=4) | 9 (claude=5, codex=4) |
| Milestone Retries | 0 | 0 |
| Ticks Used | 18 | 18 |

**Key Finding**: Config fix solved the blocking issue. Both runs now complete successfully.
Context pack didn't show measurable improvement on this task (possibly too simple to benefit).

### 2.5 Stress Test Runs [COMPLETE]
- [x] Run stress preset for multi-milestone churn analysis
- [x] Identify top recurring stop_reasons
- [x] Document 0-intervention success rate

**Results** (2025-12-25):

| Scenario | Run ID | Stop Reason | Milestones | Workers |
|----------|--------|-------------|------------|---------|
| verify-stress-deckbuilder | 20251225182042 | complete ✅ | 2/2 | claude=5 |
| impl-churn-engine | 20251225182409 | complete ✅ | 4/4 | claude=5, codex=4 |
| noop-strict | 20251225183051 | max_ticks_reached | 0/2 | claude=2, codex=2 |

**Analysis**:
- 2/3 runs completed successfully (67% 0-intervention success)
- `noop-strict` hit tick limit by design (only 5 ticks allowed)
- No verification retries, no blocked runs
- verify-stress used only Claude (pure review task, no implementation needed)

---

## Phase 3: Context Pack A/B Analysis [PENDING]

**Success Criteria** (need 1-2 to consider context pack validated):
- [ ] worker_calls down ≥ 25%
- [ ] verify_retries down to zero (or near-zero)
- [ ] IMPLEMENT phase time down ≥ 20%
- [ ] fewer IMPLEMENT↔VERIFY cycles (measured by ticks_used)

**If criteria not met**:
- [ ] Change context pack contents (exact commands + 1-2 code patterns > big blobs)
- [ ] Re-run A/B until criteria met or approach abandoned

---

## Phase 4: Simplify Stop/Progress Authority [MOSTLY COMPLETE]

**Goal**: One canonical "progress stamp" source, dumb supervisor loop.

**Status**: 4.1, 4.2, 4.4, 4.5 complete. 4.3 deferred (current implementation is reasonable).

### 4.1 Audit Current Stop Paths [COMPLETE]

**Stop Reasons and Where They're Set**:

| Reason | Location | Line | Context |
|--------|----------|------|---------|
| `stalled_timeout` | runner.ts | 152 | Watchdog timer fires |
| `time_budget_exceeded` | runner.ts | 188 | Main loop time check |
| `max_ticks_reached` | runner.ts | 216 | End of main loop |
| `plan_parse_failed` | runner.ts | 308 | handlePlan() |
| `plan_scope_violation` | runner.ts | 328 | handlePlan() |
| `milestone_missing` | runner.ts | 367, 651 | handleImplement(), handleReview() |
| `implement_parse_failed` | runner.ts | 456 | handleImplement() |
| `implement_blocked` | runner.ts | 466 | handleImplement() |
| `guard_violation` | runner.ts, run.ts | 490, 312 | handleImplement(), preflight |
| `verification_failed_max_retries` | runner.ts | 586 | handleVerify() |
| `review_parse_failed` | runner.ts | 711 | handleReview() |
| `complete` | runner.ts | 803 | handleFinalize() |

**Stop Check Locations** (`state.phase === 'STOPPED'`):

| Location | Line | Purpose |
|----------|------|---------|
| runner.ts | 182 | Main loop break check |
| runner.ts | 293-294 | Late result check via `checkForLateResult()` (handlePlan) |
| runner.ts | 434-435 | Late result check via `checkForLateResult()` (handleImplement) |
| runner.ts | 682-683 | Late result check via `checkForLateResult()` (handleReview) |

**Key Functions**:
- `stopRun(state, reason)` in `state-machine.ts:58` - Canonical stop function
- `stopWithError(state, options, reason, error)` in `runner.ts:806` - Wrapper that logs event + writes memo
- `checkForLateResult(options, stage, worker)` in `runner.ts:843` - Unified late result check

### 4.2 Unify Late Result Checks [COMPLETE]

- [x] Created `checkForLateResult()` helper function
- [x] Applied to handlePlan (line 293)
- [x] Applied to handleImplement (line 434)
- [x] Applied to handleReview (line 682)
- [x] Verified TypeScript compiles without errors

**Before**: 3 locations with 8 lines of duplicated code each
**After**: 3 locations with 2-line helper calls + 1 shared function

### 4.3 Unify Budget Limit Checks [DEFERRED]

*Stretch goal - current implementation is reasonable*

- [ ] Create single `shouldStop(state, options): { stop: boolean, reason: string, metadata: object }`
- [ ] Move all stop checks into this function
- [ ] Supervisor loop becomes: read state → run phase handler → append events → check shouldStop

### 4.4 Simplify Progress Tracking [COMPLETE]

**Audit Results**: Current design is already clean:
- `recordProgress()` in runner.ts is the canonical progress stamp
- `last_progress_at` tracks meaningful work (for stall detection)
- `updated_at` tracks any state mutation
- `phase_started_at` tracks phase timing

**Changes Made**:
- [x] Added `last_progress_at` to `createInitialState()` for consistency
- [x] Documented progress tracking design in state-machine.ts
- [x] Verified no regressions with bench:minimal

### 4.5 Verify No Regressions [COMPLETE]
- [x] Run bench:minimal after refactor - 2025-12-25
- [x] Confirm same outcomes as before

**Results**: noop-worktree: complete ✅, noop-no-worktree: guard_violation (expected)

---

## Phase 5: Worktree Hardening [COMPLETE]

**Goal**: Make worktrees boringly reliable.

### 5.1 Disk Hygiene [COMPLETE]
- [x] Add `gc` command to CLI: `agent-run gc [--dry-run] [--older-than <days>]`
- [x] Delete old `runs/*/worktree` directories (never touch artifacts)
- [ ] Add `--prune-worktrees` flag to `run` command (clean before start) - *deferred*
- [x] Print disk usage summary

**Implementation**: `src/commands/gc.ts`
- Shows table of worktrees with age and size
- Supports `--dry-run` and `--older-than <days>`
- Preserves artifacts, only deletes worktree directories

### 5.2 Resume Correctness [COMPLETE]
- [x] If worktree missing on resume, recreate deterministically at same base SHA
- [x] If branch mismatch, warn loudly and require `--force`
- [x] Add `worktree_recreated` timeline event when recreated
- [x] Add `worktree_branch_mismatch` timeline event

**Implementation**: Enhanced `src/repo/worktree.ts` with `WorktreeRecreateResult`

### 5.3 Node Modules Strategy [COMPLETE]
- [x] Document strategy in `docs/worktrees.md`
- [x] Enforce symlink creation in `createWorktree()`
- [x] Add `node_modules_symlinked` timeline event
- [x] Handle missing source node_modules gracefully (skip symlink)

**Strategy**: Symlink `node_modules` from source repo for speed. Trade-off documented.

### 5.4 Verify Reliability [COMPLETE]
- [x] Run bench:full with worktree enabled - 2025-12-25
- [x] Confirm 0 worktree-related failures

**Results** (2025-12-25):

| Scenario | Run ID | Stop Reason | Milestones | Worktree |
|----------|--------|-------------|------------|----------|
| noop-worktree | 20251225183721 | complete ✅ | 2/2 | yes |
| noop-no-worktree | 20251225183937 | guard_violation | 0/1 | no |
| engine-bootstrap | 20251225183949 | complete ✅ | 4/4 | yes |

**Analysis**:
- 2/3 runs completed successfully
- Both worktree runs completed without issues
- Non-worktree noop hit guard_violation (expected for dirty repo)
- Engine-bootstrap: full 4-milestone run completed with worktree isolation

---

## Phase 6: Defaults & Knobs UX [COMPLETE]

**Goal**: Eliminate "is it broken?" moments.

### 6.1 Print Active Defaults at Run Start [COMPLETE]
- [x] Log effective config at startup:
  - time, maxTicks, worktree, context_pack, allow_deps
- [x] Format as single-line compact block

**Implementation**:
- `formatEffectiveConfig()` in `src/commands/run.ts:94`
- `formatResumeConfig()` in `src/commands/resume.ts:23`
- Output: `Config: time=60min | ticks=50 | worktree=on | context_pack=off | allow_deps=no`

### 6.2 Resume Command Hints [COMPLETE]
- [x] When `max_ticks_reached`: emit exact resume command with suggested tick increase
- [x] When `time_budget_exceeded`: emit exact resume command with suggested time increase
- [x] Include `--time` and `--max-ticks` suggestions

**Implementation**: Integrated into `buildStructuredStopMemo()` in runner.ts

### 6.3 Structured Stop Output [COMPLETE]
- [x] Write structured memo with:
  - What happened (stop_reason with human-readable description)
  - Likely cause (from last_error if available)
  - Next action (exact command or manual step)
  - Tips for common issues

**Implementation**: `buildStructuredStopMemo()` in `src/supervisor/runner.ts:114`

**Sample Output**:
```
# Run Stopped

## What Happened
- **Stop Reason**: max_ticks_reached
- **Phase**: IMPLEMENT
- **Milestone**: 2/4

## Description
Maximum phase transitions (ticks) reached before completion.

## Likely Cause
Reached 50 tick limit. Task may need more iterations or there may be oscillation between phases.

## Next Action
Resume with increased tick limit:
node dist/cli.js resume <run_id> --max-ticks 75

## Tips
- Check timeline.jsonl for patterns
- Consider simplifying milestones
- Review last worker output for blockers
```

---

## Phase 7: Autonomy Multiplier [COMPLETE]

**Chose Option B: Auto-Diagnose Stop Reason**

### Option B: Auto-Diagnose Stop Reason [COMPLETE]

**Implementation**: Created diagnosis module with 10 diagnostic rules.

**Output Artifacts** (for stopped runs):
- `runs/<id>/handoffs/stop.json` - Machine-readable diagnosis
- `runs/<id>/handoffs/stop.md` - Human-readable diagnosis

**Diagnostic Categories Implemented**:
1. `auth_expired` - Worker authentication issues
2. `verification_cwd_mismatch` - Wrong directory for verification
3. `scope_violation` - Files outside allowlist
4. `lockfile_restricted` - Lockfile modified without --allow-deps
5. `verification_failure` - Tests/lint/typecheck failed
6. `worker_parse_failure` - Malformed worker response
7. `stall_timeout` - No progress detected
8. `max_ticks_reached` - Tick limit hit
9. `time_budget_exceeded` - Time limit hit
10. `guard_violation_dirty` - Uncommitted changes in repo

**Each Diagnosis Includes**:
- `stop_reason_family`: high-level grouping (guard, budget, verification, worker, stall, auth)
- `resume_command`: pre-filled for budget stops (max_ticks_reached, time_budget_exceeded, stall_timeout)
- Confidence score (0-1)
- Evidence signals with dot-notation sources (e.g., `guard.reasons`, `event.max_ticks_reached`)
- Prioritized next actions with runnable shell commands (no placeholders)
- Escalation advice for repeated failures

**Integration**:
- `summarize` command now generates diagnosis for failed stops
- `bench.ts` aggregates diagnoses by category
- Summary output includes primary diagnosis and next action

**Files Created**:
- `src/diagnosis/types.ts` - Type definitions
- `src/diagnosis/analyzer.ts` - Diagnostic rules engine
- `src/diagnosis/formatter.ts` - Markdown formatter
- `src/diagnosis/index.ts` - Module exports

### Option A: Fast Path for Trivial Diffs [DEFERRED]
- [ ] Detect "trivial" change set (< N files, < M lines)
- [ ] If tier0 passed and change set trivial: skip REVIEW
- [ ] Checkpoint immediately
- [ ] Add `fast_path_used` timeline event

---

## Metrics to Track

After each significant change, record:

| Date | Change | bench:minimal | bench:context | bench:stress | Notes |
|------|--------|---------------|---------------|--------------|-------|
| 2025-12-25 | Initial harness | 1 pass, 1 guard-fail | 2 blocked (cwd) | - | Need config fix |
| 2025-12-25 | Config fix + context pack | TBD | 2 complete ✅ | - | Both runs completed |
| 2025-12-25 | Late result + worktree | - | - | 2/3 complete | noop-strict: tick limit by design |
| 2025-12-25 | Phase 6: Defaults UX | - | - | - | Config logging + structured stop memos |
| 2025-12-25 | Phase 5.4: bench:full | 1 guard-fail | 1 complete ✅ | - | Worktree runs passed |
| 2025-12-25 | Phase 4.4: progress tracking | 1 complete, 1 guard-fail | - | - | `last_progress_at` now set initially |
| 2025-12-25 | Phase 7: auto-diagnose | - | - | - | 10 diagnostic rules, stop.json/stop.md artifacts |
| 2025-12-25 | Phase 7: taxonomy fixes | - | - | - | stop_reason_family, resume_command, runnable next_actions |

---

## Files Modified/Created

- `scripts/bench.ts` - Benchmark harness
- `tasks/tactical-grid/agent.config.json` - Task-specific config
- `src/context/pack.ts` - Enhanced with blockers guidance
- `src/context/__tests__/artifact.test.ts` - Fixed to include blockers field
- `src/supervisor/runner.ts` - Added `checkForLateResult()` helper, `buildStructuredStopMemo()`, structured stop output
- `src/supervisor/state-machine.ts` - Added `last_progress_at` to initial state, documented progress tracking design
- `src/diagnosis/types.ts` - **NEW** Diagnosis type definitions
- `src/diagnosis/analyzer.ts` - **NEW** Diagnostic rules engine (10 rules)
- `src/diagnosis/formatter.ts` - **NEW** Markdown formatter for stop.md
- `src/diagnosis/index.ts` - **NEW** Module exports
- `src/commands/summarize.ts` - Integrated diagnosis generation, writes handoffs/stop.json + stop.md
- `scripts/bench.ts` - Added diagnosis aggregation and per-run diagnosis in reports
- `src/commands/gc.ts` - **NEW** Disk cleanup command
- `src/commands/run.ts` - Added `formatEffectiveConfig()` for config logging at startup
- `src/commands/resume.ts` - Added `formatResumeConfig()`, worktree event logging
- `src/cli.ts` - Added gc command
- `src/repo/worktree.ts` - Enhanced with branch mismatch detection, WorktreeRecreateResult
- `docs/worktrees.md` - **NEW** Worktree strategy documentation
- `bench-report.html` - Analysis report
- `ROADMAP-STABILITY.md` - This file
