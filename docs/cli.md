Status: Implemented
Source: src/cli.ts, src/commands/doctor.ts, src/commands/run.ts, src/commands/report.ts, src/commands/resume.ts, src/commands/status.ts, src/commands/guards-only.ts

# CLI

## agent-run doctor
Checks worker CLI availability and headless mode.

Usage:
```
node dist/cli.js doctor --repo <path> --config <path>
```

Behavior:
- Uses `--version` to verify each worker binary.
- Runs a headless ping using fixed arguments (not the configured `args`).
- Prints PASS/FAIL and sets exit code 1 if any worker fails.

## agent-run run
Starts a new run and enters the supervisor loop.

Usage:
```
node dist/cli.js run --repo <path> --task <path> [options]
```

Key options:
- `--time <minutes>`: total time budget (default: 120).
- `--config <path>`: config override (default: `<repo>/agent.config.json`).
- `--allow-deps`: allow lockfile changes.
- `--allow-dirty`: allow dirty worktree.
- `--no-branch`: skip run branch checkout.
- `--no-write`: skip run artifacts and skip supervisor loop.
- `--dry-run`: write run artifacts but do not execute supervisor.
- `--max-ticks <count>`: supervisor phase ticks to run (default: 10).
- `--skip-doctor`: skip worker health checks (useful for CI or custom setups).
- `--web`: recorded in run metadata; not used by the current loop.

Notes:
- Worker health checks (doctor) run by default before the supervisor loop starts.
- Guard violations stop the run before branch checkout.
- The summary line includes `run_id=...` and `run_dir=...` for follow-up commands.
- An environment fingerprint is saved to `runs/<id>/env.fingerprint.json` capturing node version, lockfile hash, and worker versions.

## agent-run guards-only
Runs preflight guard checks without executing the supervisor loop.

Usage:
```
node dist/cli.js guards-only --repo <path> --task <path> [options]
```

Options:
- `--config <path>`
- `--allow-deps`
- `--allow-dirty`
- `--no-write` (skip run artifacts)

## agent-run report
Prints a structured report for a run.

Usage:
```
node dist/cli.js report <run_id> --tail <count>
```

Notes:
- Reads `state.json` and `timeline.jsonl` from the run store.
- `--tail` defaults to 50 events.

## agent-run resume
Resumes a run and re-enters the supervisor loop.

Usage:
```
node dist/cli.js resume <run_id> [options]
```

Options:
- `--time <minutes>`
- `--max-ticks <count>`
- `--allow-deps`
- `--config <path>`
- `--force`: resume despite environment fingerprint mismatch.

Notes:
- Prefers `config.snapshot.json` from the run store when present.
- Compares the current environment against the saved fingerprint (`env.fingerprint.json`).
- If the fingerprint differs (node version, lockfile hash, worker versions), resume is blocked unless `--force` is used.

## agent-run status
Prints the current run state as JSON.

Usage:
```
node dist/cli.js status <run_id>
```
