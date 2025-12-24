Status: Implemented
Source: src/store/run-store.ts, src/commands/report.ts, src/supervisor/runner.ts

# Run Store

A run store lives under `runs/<run_id>/` and holds the state, timeline, and artifacts for a run.

## Directory layout
```
runs/<run_id>/
  artifacts/
    task.md
    tests_tier0.log
  handoffs/
    milestone_01_handoff.md
    milestone_01_review.md
    stop.md
  config.snapshot.json
  env.fingerprint.json
  plan.md
  seq.txt
  state.json
  summary.md
  timeline.jsonl
```

## Key files
- `state.json`: current phase, milestone index, timestamps, and stop reason.
- `timeline.jsonl`: append-only event log with `seq` and `timestamp`.
- `env.fingerprint.json`: environment snapshot (node version, lockfile hash, worker versions) for resume safety.
- `plan.md`: JSON-serialized plan output.
- `summary.md`: final summary or guard-violation summary.
- `handoffs/*.md`: implementer and reviewer memos, plus `stop.md`.
- `artifacts/*.log`: verification output per tier.

## Event stream
Each event line is JSON with:
- `seq`: monotonically increasing counter stored in `seq.txt`.
- `timestamp`: ISO8601 UTC.
- `type`: event type (e.g., `plan_generated`, `verification`, `stop`).
- `source`: `cli`, `supervisor`, `codex`, `claude`, or `verifier`.

## Report command
`agent-run report` scans the timeline and prints:
- The latest run state
- The tail of recent events
- Pointers to state, timeline, and last verification log

## See Also
- [Run Lifecycle](run-lifecycle.md) - How phases generate events
- [CLI Reference](cli.md) - Report and status commands
- [Verification](verification.md) - How verification logs are generated
