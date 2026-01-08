# Dogfooding Guide

Using Runr to develop itself.

## Prerequisites

```bash
# Build the stable version first
npm run build
git tag v0.7.0  # (if not already tagged)

# Create a stable worktree to use as the runner
git worktree add ../runr-stable v0.7.0
cd ../runr-stable && npm install && npm run build && npm link
```

## Five Commands

### 1. Run a task on this repo

```bash
cd /path/to/agent-framework
runr run --task .runr/tasks/your-task.md --worktree --auto-resume
```

Use `--worktree` to isolate changes. Use `--auto-resume` to recover from transient failures.

### 2. Follow progress in real-time

```bash
runr follow
```

Tails the timeline and exits when the run completes or stops.

### 3. Check run status

```bash
runr status --all        # All runs
runr report latest       # Detailed report for latest run
runr metrics --json      # Aggregate metrics
```

### 4. Resume a stopped run

```bash
runr resume <run_id> --max-ticks 75  # Increase ticks if needed
runr resume <run_id> --time 180      # Increase time budget if needed
```

### 5. Multi-task orchestration

```bash
runr orchestrate run --config .runr/tracks.yaml --worktree --auto-resume
runr orchestrate wait latest
```

## How to Recover

### Run stopped with `max_ticks_reached`

The task oscillated between phases too many times. Resume with more ticks:

```bash
runr resume <run_id> --max-ticks 100
```

### Run stopped with `time_budget_exceeded`

The task needed more time. Resume with a larger budget:

```bash
runr resume <run_id> --time 180
```

### Run stopped with `stalled_timeout`

No progress was detected. Check the timeline for the last activity:

```bash
runr report <run_id> --tail 20
```

If the worker hung, resume with `--auto-resume` to retry automatically.

### Run stopped with `guard_violation`

Files outside the allowlist were modified. Either:
1. Add the files to the allowlist in `runr.config.json`
2. Or remove the changes and resume

### Run stopped with `verification_failed_max_retries`

Tests failed 3 times. Check the verification logs:

```bash
cat .runr/runs/<run_id>/artifacts/tests_tier0.log
```

Fix the issue manually and resume, or update the task to be more specific.

### Run stopped with `worker_call_timeout`

The worker (Claude/Codex) didn't respond in time. This is usually transient. Resume with `--auto-resume`:

```bash
runr resume <run_id> --auto-resume
```

## Golden Rule

> **Never use the development version to run tasks on itself.**

Always use the stable worktree (`../runr-stable`) as the runner when making changes to Runr. This prevents the "sawing off the branch you're sitting on" problem.

```bash
# Good: stable runner, development target
cd /path/to/agent-framework
../runr-stable/dist/cli.js run --task .runr/tasks/fix-something.md --worktree

# Bad: development version running on itself
runr run --task .runr/tasks/fix-something.md  # Don't do this!
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `runr doctor` | Check worker availability |
| `runr paths --json` | Show artifact directories |
| `runr gc --dry-run` | Preview cleanup of old worktrees |
| `runr version --json` | Show version and schema info |
| `runr metrics --days 7` | Last week's metrics |
