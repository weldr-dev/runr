---
name: agent-framework-runtime-roadmap
description: Roadmap for deterministic, governed, and high-throughput agent runs
---

# Plan

Align the roadmap around a “compiler + runtime” mindset: prioritize determinism, governance, protocol stability, and throughput while proving generalization with a repeatable ambiguous bootstrap run. This plan tightens definition, sequencing, and guardrails so it can be executed without thrash.

## Requirements
- Determinism/observability with defined KPIs and reproducible artifacts.
- Governance boundaries enforced in the supervisor (runner repo never modified; allowed roots enforced when repo is shared).
- Protocol stability via canonical transcripts, raw output capture, and contract checks in doctor.
- Throughput improvements measured against baselined KPIs.
- Generalization evidence: ambiguous bootstrap completes end-to-end on main without manual patches.

## Success metrics (KPIs)
- Median time per milestone and p90 time per milestone.
- Worker calls per milestone and p90 worker calls per milestone.
- Verification time per milestone by tier (tier0/tier1/tier2).
- Parse failure rate per 100 worker calls.
- Retry rate (verification + parse + review rejection loops).
- Human intervention rate (manual edits or manual re-runs).
- Determinism check: identical seed + task yields identical test outcomes and identical planned file paths (exact code diffs may vary, but must satisfy the same tests and structure).
- Governance violations per run (target: 0).

## KPI targets (v1)
### Time
- Median time per milestone: <= 3 minutes.
- p90 time per milestone: <= 6 minutes.
- End-to-end ambiguous bootstrap: <= 25 minutes.

### Worker usage
- Median worker calls per milestone: <= 2.
- p90 worker calls per milestone: <= 4.

### Verification
- tier0 median: <= 30 seconds.
- tier0 p90: <= 60 seconds.
- tier1: allowed but must be < 2 minutes or skipped.
- tier2: run-end only.

### Reliability
- Parse failure rate: < 1 per 100 calls.
- Retry rate (any kind): < 20% of milestones.
- Human intervention rate: 0 for golden paths.

### Governance and determinism
- Governance violations: 0.
- Planned file path variance: 0.
- Test outcome variance: 0.

## KPI guardrail
- Every KPI must directly inform a guardrail or scheduling decision; if it does not, do not collect it yet.

## Definition of done (Roadmap milestone)
- Ambiguous bootstrap: 3 consecutive successful runs on main with no framework edits.
- Parse failure rate < 1% across 200 worker calls.
- Median milestone time and p90 set after baseline, then held under target for fixtures.
- Zero framework edits during target runs (enforced).
- Doctor detects worker contract drift and blocks run with actionable output.

## Golden path definition
- A task that requires no framework changes, uses standard project structure, has deterministic tests, and touches <= N files.
- Golden tasks are the performance baseline and confidence anchor.
- Hostile tasks exist to harden guarantees, not to optimize throughput.

## Non-goals
- Optimal code quality in all outputs.
- Minimal token usage.
- Zero retries.
- Fully autonomous PRs.

## Scope
- In: supervisor loop, verification policy, report summaries, worker adapters/parsers, prompts/schemas, run-store artifacts, docs, fixture tasks.
- Out: parallel execution, web UI, multi-agent orchestration.

## Governance boundaries
### Framework edit definition
A framework edit is any modification to:
- src/** (excluding tasks, templates, and docs)
- templates/**
- docs/**
- package.json or lockfiles in the runner repo

Any run that requires a framework edit must stop with `framework_fix_needed`.

## Files and entry points
- `src/supervisor/runner.ts`
- `src/supervisor/verification-policy.ts`
- `src/workers/codex.ts`
- `src/workers/claude.ts`
- `src/workers/json.ts`
- `src/workers/prompts.ts`
- `src/workers/schemas.ts`
- `src/commands/report.ts`
- `src/store/run-store.ts`
- `templates/prompts/*.md`
- `docs/verification.md`
- `docs/run-lifecycle.md`
- `docs/mental-model.md`
- `tasks/*`

## Data model / API changes
- Add run timing/summary stats in `state.json` and `summary.md`.
- Add `framework_fix_needed` stop reason and memo format with explicit triggers.
- Persist raw worker output for every call (size-capped), not only on failure.
- Normalize worker transcripts: raw lines, parsed events, extracted text, markers JSON block.
- Record worker contract version and CLI versions in env fingerprint.
- Add `review_skipped_reason` to timeline events when auto-approving.
- Extend plan schema for optional `workstreams` or `milestones[].stream` (defer until P3).

## Priorities
- P0: Worker contract hardening, governance enforcement, and KPI instrumentation.
- P1: Ambiguous bootstrap success on main with clean artifacts and baseline metrics.
- P2: Throughput improvements (tier0_fast, prompt trimming, reviewer auto-approve) after KPIs exist.
- P3: Explore phase and workstreams (only after P1 stability).
- P4: Golden/hostile suite expansion and regression catalog growth.

## Timeline options (pros/cons)
- Option A: Confidence-first (3–7 days)
  - Pros: fastest path to repeatable runs; reduces protocol churn.
  - Cons: defers throughput gains; demo velocity slower short-term.
- Option B: Throughput-first (3–7 days)
  - Pros: faster demos and milestone turnaround.
  - Cons: risks masking protocol fragility; harder to debug regressions.
- Option C: Balanced (3–10 days)
  - Pros: ships speedups while locking in stability.
  - Cons: more coordination and sequencing overhead.

## Sequencing (recommended order)
1. Worker contract hardening + raw capture + doctor upgrades.
2. Governance enforcement in supervisor (allowed roots; framework edits blocked).
3. KPI collection + report surfacing.
4. Ambiguous bootstrap x3 on main with baseline metrics.
5. Throughput optimizations (tier0_fast, prompt trimming, auto-approve).
6. Explore phase read-only enforcement.
7. Workstreams and verification scoping.
8. Golden/hostile suite + regression rubric maintenance.

## Guardrails
- `tier0_fast` only when diff < N files and < M LOC, no risk triggers, and last N runs green; configure per repo.
- Auto-approve only when verification is green, diff is small, no risk triggers fire, no unexpected new files, and no config/test count regressions; otherwise call reviewer.
- Review skip always logs `review_skipped_reason` in the timeline.
- Explore phase enforces no writes (temp worktree or write sandbox) and blocks git mutations.

### Initial thresholds (provisional defaults)
- Small diff: <= 5 files AND <= 300 LOC (added + removed).
- tier0_fast eligibility requires the last 3 runs green on the same repo.
- Thresholds are configuration defaults and may be overridden per repo.

## Throughput strategy
- Known dominant cost centers: LLM latency (planner + implementer), verification runtime, review loop retries.
- Throughput gains must reduce round-trips, not just milliseconds.

## Decisions
- Explore default: ON for greenfield tasks, OFF for incremental changes.

## 3-day execution plan
### Day 1 - Protocol + governance foundation (P0)
- Worker contract hardening:
  - Normalize transcripts (raw lines, parsed events, extracted text, markers JSON).
  - Make Codex JSONL parsing event-type tolerant and keep canonical output for every call.
  - Size-cap raw output artifacts and record the cap in metadata.
- Doctor upgrades:
  - Validate output format and marker-only compliance.
  - Record worker contract version and CLI versions in env fingerprint.
- Governance enforcement:
  - Block runner repo edits.
  - Enforce allowed roots when repo is shared.
  - Implement `framework_fix_needed` stop reason + memo with explicit triggers.
  - Add tests for governance violations.
- KPI instrumentation (foundation only):
  - Capture phase timings, worker call counts, parse failures, retry counts, and diff size in `state.json`.
- Exit: fixture runs show no parse failures, governance violations stop cleanly, and baseline KPI fields are recorded.

### Day 2 - KPI reporting + proof runs
- KPI reporting:
  - Surface KPIs in `report` (worker time, verify time by tier, retries, diff size, review skip reasons).
  - Add a short summary section to `summary.md`.
- Baseline golden run:
  - Run a golden task and confirm KPI fields are populated.
  - Adjust KPI targets only if baseline data is materially off.
- Ambiguous bootstrap validation:
  - Run ambiguous bootstrap 3x on main.
  - Confirm zero framework edits and no manual intervention.
- Exit: KPIs visible per run without manual aggregation and ambiguous bootstrap succeeds 3x with clean artifacts.

### Day 3 - Safe throughput wins + validation
- Throughput optimizations:
  - Implement `tier0_fast` gating (per-repo defaults + thresholds + last N green runs).
  - Prompt trimming (goal + files_expected + minimal diff) and reduce review payload size.
  - Reviewer auto-approve with strict guardrails + `review_skipped_reason`.
- Validation pass:
  - Re-run a golden task and one ambiguous run to verify KPIs improve or hold steady.
  - Confirm parse failure and retry rates do not regress.
- Docs alignment:
  - Align worker execution mode documentation with actual behavior (shell vs direct invocation).
- Exit: measurable speedup with no regression in reliability KPIs.

## Action items
[ ] Harden worker protocol: event-type tolerant JSONL parsing, canonical transcript, raw output capture, and doctor contract checks with actionable errors.
[ ] Enforce governance in supervisor: never modify runner repo; if repo is shared, enforce allowed roots; define `framework_fix_needed` triggers (out-of-scope file, missing capability, protocol mismatch).
[ ] Add KPI collection and report summary fields (worker time, verify time by tier, ticks, retries, parse failures, diff size, review skip reasons).
[ ] Run ambiguous bootstrap end-to-end on main (x3) and record baseline KPI targets.
[ ] Implement `tier0_fast` selection with per-repo config and safe gating conditions; document selection reasons.
[ ] Add reviewer auto-approve with strict guardrails and `review_skipped_reason` logging.
[ ] Reduce prompt bloat: pass only milestone goal, files_expected, and minimal diff context; include failure output only on retries.
[ ] Implement Explore phase with enforced read-only behavior, outputs for info needs/assumptions/files_expected.
[ ] Add workstreams only if it demonstrably reduces prompt size and keeps verification scoped; otherwise defer.
[ ] Define golden/hostile suite and regression rubric; each golden failure maps to a permanent regression test.
[ ] Align docs to actual worker execution mode (shell vs direct invocation).

## Regression rubric
- Protocol regression: add worker transcript fixture + parser test.
- Planning regression: add ambiguous task with expected file path assertions.
- Verification false negative: add tier gating test + command selection assertions.
- Governance violation: add scope violation task + guard enforcement assertion.

## Testing and validation
- Unit tests for worker parsing, tier selection, reviewer auto-approve, and report summaries.
- Manual: ambiguous bootstrap 3x on main with clean run artifacts and summaries.
- Manual: governance violation produces `framework_fix_needed` stop memo and no framework edits.
- KPI review: baseline and target checkpoints tracked in summary/report.

## Risks and edge cases
- Auto-approve thresholds could allow subtle issues; tune conservatively.
- Tier0_fast varies by repo; ensure per-repo config and safe defaults.
- Explore enforcement may add overhead; keep it opt-in if it slows simple tasks.
- Raw output capture size cap must avoid runaway logs.

## Open questions
- What size/LOC thresholds define “small diff” for auto-approve and tier0_fast gating?
- Which tier0_fast commands are viable across typical target repos?

## Roadmap exit criteria
When P1 is complete and KPIs are stable for golden paths, further work should be driven by product needs rather than framework completeness.
