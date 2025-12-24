# Task: Fast Path Mode

## Goal
Skip ceremony (full PLAN→REVIEW loop) when the task is low-risk.
Make small daily tasks pleasant and fast.

## Success Contract

- [ ] Add `--fast` flag to CLI
- [ ] Auto fast-path heuristic (can be disabled)
- [ ] Fast path flow: IMPLEMENT → VERIFY → CHECKPOINT
- [ ] REVIEW only triggers on: failures, risk flags, or explicit request
- [ ] Reduces median time for small tasks by 30-60% (measured via KPI)
- [ ] Still fails safe on: scope violations, lockfile changes, dirty tree

## Fast Path Triggers (all must be true)

- Task description < 200 chars OR tagged as "small"
- No lockfile in allowlist
- Diff size < 500 lines (estimated from milestone)
- Tests exist for affected area (or tier0 verify configured)
- No "risk_level: high" in milestone

## Implementation Milestones

### Milestone 1: Fast Path Detection
- Add heuristics to determine if task qualifies
- CLI flag `--fast` to force fast path
- Config option `fast_path.enabled: true/false`

### Milestone 2: Abbreviated Phase Flow
- Skip PLAN phase (use simple milestone from task)
- Skip REVIEW phase (unless verify fails)
- Direct: INIT → IMPLEMENT → VERIFY → CHECKPOINT → FINALIZE

### Milestone 3: Fallback to Full Path
- If fast path fails (verify, scope), escalate to full path
- Log why fast path was abandoned
- Clear UX: "Fast path failed, switching to full review..."

## Risk Level
Medium - changes execution flow, needs careful testing

## Guardrails
- Fast path NEVER bypasses scope guards
- Fast path NEVER bypasses verification
- Easy to disable globally or per-run
