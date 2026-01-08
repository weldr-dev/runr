Status: Implemented
Source: src/store/run-store.ts, src/commands/report.ts, src/supervisor/runner.ts

# Run Store

A run store lives under `.runr/runs/<run_id>/` and holds the state, timeline, and artifacts for a run.

## Directory layout
```
.runr/runs/<run_id>/
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

## Example: state.json

```json
{
  "run_id": "20231215143022",
  "phase": "CHECKPOINT",
  "started_at": "2023-12-15T14:30:22.000Z",
  "milestone_index": 1,
  "milestone_retries": 0,
  "milestones": [
    {
      "goal": "Add input validation to login form",
      "files_expected": ["src/components/LoginForm.tsx"],
      "done_checks": ["Form shows error for invalid email"],
      "risk_level": "low"
    }
  ],
  "scope_lock": {
    "allowlist": ["src/**"],
    "denylist": ["src/config/**"]
  },
  "checkpoint_commit_sha": "abc1234",
  "worker_stats": {
    "claude": 2,
    "codex": 1,
    "by_phase": {
      "plan": { "claude": 1, "codex": 0 },
      "implement": { "claude": 0, "codex": 1 },
      "review": { "claude": 1, "codex": 0 }
    }
  }
}
```

## Example: timeline.jsonl

Each line is a JSON event:

```jsonl
{"seq":1,"timestamp":"2023-12-15T14:30:22.000Z","type":"phase_start","source":"supervisor","payload":{"phase":"PLAN"}}
{"seq":2,"timestamp":"2023-12-15T14:30:45.000Z","type":"plan_generated","source":"claude","payload":{"milestones":[...]}}
{"seq":3,"timestamp":"2023-12-15T14:30:46.000Z","type":"phase_start","source":"supervisor","payload":{"phase":"IMPLEMENT"}}
{"seq":4,"timestamp":"2023-12-15T14:31:20.000Z","type":"implement_complete","source":"codex","payload":{"changed_files":["src/components/LoginForm.tsx"]}}
{"seq":5,"timestamp":"2023-12-15T14:31:21.000Z","type":"phase_start","source":"supervisor","payload":{"phase":"VERIFY"}}
{"seq":6,"timestamp":"2023-12-15T14:31:35.000Z","type":"verification","source":"verifier","payload":{"tier":"tier0","ok":true,"duration_ms":14000}}
```

## Example: env.fingerprint.json

```json
{
  "node_version": "v20.10.0",
  "lockfile_hash": "sha256:abc123...",
  "worker_versions": {
    "codex": "0.1.0",
    "claude": "1.0.0"
  },
  "created_at": "2023-12-15T14:30:22.000Z"
}
```

## Event stream
Each event line is JSON with:
- `seq`: monotonically increasing counter stored in `seq.txt`.
- `timestamp`: ISO8601 UTC.
- `type`: event type (e.g., `plan_generated`, `verification`, `stop`).
- `source`: `cli`, `supervisor`, `codex`, `claude`, or `verifier`.

## Report command
`agent report` scans the timeline and prints:
- The latest run state
- The tail of recent events
- Pointers to state, timeline, and last verification log

## See Also
- [Run Lifecycle](run-lifecycle.md) - How phases generate events
- [CLI Reference](cli.md) - Report and status commands
- [Verification](verification.md) - How verification logs are generated
