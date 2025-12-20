---
name: agent-framework-runtime-roadmap
description: Roadmap for deterministic, governed, and high-throughput agent runs
---

# Plan

Align the roadmap around a “compiler + runtime” mindset: prioritize determinism, governance, protocol stability, and throughput while proving generalization with a repeatable ambiguous bootstrap run. This plan merges the earlier throughput/verification improvements with stronger governance and worker protocol hardening.

## Requirements
- Determinism/observability: clear timing stats, reasons for decisions, and reproducible artifacts.
- Governance boundaries: explicit separation of framework vs target repo changes.
- Protocol stability: resilient worker output parsing with raw output capture on failure.
- Throughput: reduce unnecessary phases and verification without weakening safety.
- Generalization evidence: ambiguous bootstrap completes end-to-end on main without manual patches.

## Scope
- In: supervisor loop, verification policy, report summaries, worker adapters/parsers, prompts/schemas, run-store artifacts, docs, fixture tasks.
- Out: parallel execution, web UI, multi-agent orchestration.

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
- Add a `framework_fix_needed` stop reason and memo content format.
- Persist raw worker output on parse failure under `runs/<id>/artifacts/`.
- Extend plan schema for optional `workstreams` or `milestones[].stream`.

## Priorities
- P0: Governance boundary enforcement and worker protocol stability.
- P1: Ambiguous bootstrap end-to-end success on main with clean artifacts.
- P2: Throughput improvements (verification, reviewer auto-approve, prompt trimming).
- P3: Workstreams + Explore phase for scale.

## Timeline options (pros/cons)
- Option A: Confidence-first (3–7 days)
  - Pros: fastest path to reliable, repeatable runs; reduces protocol churn.
  - Cons: defers throughput gains; demo velocity slower short-term.
- Option B: Throughput-first (3–7 days)
  - Pros: faster demos and milestone turnaround.
  - Cons: risks masking protocol fragility; harder to debug regressions.
- Option C: Balanced (3–10 days)
  - Pros: ships visible speedups while locking in stability.
  - Cons: more coordination and sequencing overhead.

## Action items
[ ] Enforce governance: denylist framework paths in fixture configs; add `framework_fix_needed` stop reason and memo when scope violations suggest framework edits.
[ ] Stabilize worker protocol: make Codex JSONL parsing event-type tolerant; capture raw worker output on parse failures; improve doctor checks for format/marker compliance.
[ ] Run ambiguous bootstrap end-to-end on main (x3) and confirm deterministic tests pass with no manual framework edits.
[ ] Add run timing + summary stats (worker time, verification time, ticks, retries, parse failures, diff size) and surface in `report`.
[ ] Introduce `tier0_fast` and conditional tier1/tier2 escalation; document selection reasons in report output.
[ ] Add reviewer auto-approve for low-risk, small diffs with green verification; otherwise call reviewer.
[ ] Reduce prompt bloat: pass only milestone goal, files_expected, and minimal diff/context; include failure output only on retries.
[ ] Add Explore phase (read-only) before Execute; update docs and prompts to reflect no-write enforcement.
[ ] Extend plan schema for workstreams; execute sequentially but keep verification scoped to stream changes.
[ ] Define golden/hostile suites and the “golden failure -> hostile regression” policy.

## Testing and validation
- Unit tests for worker parsing, tier selection, reviewer auto-approve, and report summaries.
- Manual: ambiguous bootstrap 3x on main with clean run artifacts and summaries.
- Manual: governance violation produces `framework_fix_needed` stop memo and no framework edits.

## Risks and edge cases
- Auto-approve thresholds could allow subtle issues; tune conservatively.
- Governance enforcement may halt runs that previously “worked” via framework edits.
- Tier selection + time budget interactions could skip expected tiers.

## Open questions
- What size/LOC thresholds define “small diff” for auto-approve?
- Should Explore be default for greenfield tasks or opt-in per task config?
- Which tier0_fast commands are viable across typical target repos?
