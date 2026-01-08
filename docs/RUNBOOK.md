# Runr Runbook

Operational guide for starting, monitoring, and troubleshooting Runr runs.

For command details, see [CLI Reference](cli.md). For configuration, see [Configuration Reference](configuration.md).

## Starting a Run

### Basic Run

```bash
runr run --task .runr/tasks/my-task.md
```

### Common Options

```bash
# Run with worktree isolation (recommended)
runr run --task .runr/tasks/my-task.md --worktree

# Set time budget (default: 120 minutes)
runr run --task .runr/tasks/my-task.md --time 60

# Set max ticks (default: 50)
runr run --task .runr/tasks/my-task.md --max-ticks 20

# Allow lockfile changes
runr run --task .runr/tasks/my-task.md --allow-deps

# Allow dirty worktree
runr run --task .runr/tasks/my-task.md --allow-dirty

# Custom config file
runr run --task .runr/tasks/my-task.md --config ./custom.config.json
```

### Dry Run Mode

Initialize without executing:

```bash
runr run --task .runr/tasks/my-task.md --dry-run
```

### Pre-flight Check Only

```bash
runr tools guard --task .runr/tasks/my-task.md
```

## Monitoring a Run

### Live Tail

```bash
runr follow latest
runr follow <run_id>
```

### Report

```bash
runr report latest
runr report <run_id> --tail 100
runr report latest --kpi-only
```

### Status

```bash
runr status <run_id>
runr status --all
```

## Resuming a Run

```bash
# Basic resume
runr resume <run_id>

# With extended time
runr resume <run_id> --time 60

# Force (ignore environment fingerprint mismatch)
runr resume <run_id> --force
```

### When to Resume

**Do resume when:**
- Run was interrupted (Ctrl+C, crash)
- Transient failure (network timeout)
- External issue fixed (missing dependency)
- Time budget expired

**Don't resume when:**
- Task definition is wrong (start fresh)
- Major environment change (new Node version)
- Want to change the plan

## Run Directory Structure

```
.runr/runs/<run_id>/
├── state.json           # Current run state
├── timeline.jsonl       # Event log (append-only)
├── config.snapshot.json # Config at run start
├── env.fingerprint.json # Environment snapshot
├── plan.md              # Generated milestone plan
├── handoffs/            # Worker memos
│   ├── implement.md
│   ├── review.md
│   └── stop.md
├── artifacts/
│   └── tests_*.log      # Verification logs
```

**Worktrees (when enabled):**
```
.runr-worktrees/<run_id>/
```

## Common Workflows

### Start and Monitor

```bash
# Terminal 1: Start
runr run --task .runr/tasks/my-task.md --worktree

# Terminal 2: Follow
runr follow latest
```

### Debug a Failed Run

```bash
# Get report
runr report <run_id>

# Check raw state
runr status <run_id>

# View timeline
cat .runr/runs/<run_id>/timeline.jsonl | jq .

# View verification logs
cat .runr/runs/<run_id>/artifacts/tests_*.log
```

### Resume After Failure

```bash
runr report <run_id>           # Check what failed
runr resume <run_id> --force   # Resume
runr follow <run_id>           # Monitor
```

## Troubleshooting

### Guard Violations

#### "Dirty worktree detected"

```bash
# Option 1: Commit or stash
git stash

# Option 2: Allow it
runr run --task task.md --allow-dirty
```

#### "Lockfile changes detected"

```bash
# Option 1: Commit lockfile
git add package-lock.json && git commit -m "chore: update lockfile"

# Option 2: Allow it
runr run --task task.md --allow-deps
```

#### "Config file not found"

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": { "allowlist": ["src/**"] },
  "verification": { "tier0": ["npm run lint"] }
}
```

#### "Worker CLI not available"

```bash
runr doctor
```

### Verification Failures

#### "Verification failed after 3 attempts"

```bash
# Check logs
cat .runr/runs/<run_id>/artifacts/tests_*.log

# Check report
runr report <run_id>
```

Consider:
- Are milestone done checks realistic?
- Are verification commands correct?
- Break milestone into smaller steps?

#### "Verification command timed out"

Increase timeout in config:

```json
{
  "verification": {
    "max_verify_time_per_milestone": 600
  }
}
```

### Worker Timeouts

#### "Worker did not respond"

```bash
# Check worker process
ps aux | grep claude

# Check timeline for call duration
cat .runr/runs/<run_id>/timeline.jsonl | jq 'select(.type == "worker_call")'
```

### Worktree Issues

#### "Worktree not found"

The worktree was deleted. Start a new run.

#### "Worktree has uncommitted changes"

```bash
# Check status
cd .runr-worktrees/<run_id>
git status

# Option 1: Commit changes
git add -A && git commit -m "recover changes"

# Option 2: Discard changes
git checkout -- . && git clean -fd
```

#### "Cannot create worktree - already exists"

```bash
git worktree remove --force .runr-worktrees/<old_run_id>
git worktree prune
```

### Environment Fingerprint Mismatch

```
Error: Environment fingerprint mismatch
  Node version: expected v20.10.0, got v21.1.0
  Use --force to resume anyway
```

Use `--force` only when confident changes won't affect the run.

### General Debugging

```bash
# Full report
runr report <run_id> --tail 500

# Raw state
cat .runr/runs/<run_id>/state.json | jq .

# Timeline analysis
cat .runr/runs/<run_id>/timeline.jsonl | jq -s 'group_by(.type) | map({type: .[0].type, count: length})'

# Environment check
node --version
which claude && claude --version
git status
git worktree list
df -h .
```

### Timeline Event Types

| Event Type | Description |
|------------|-------------|
| `run_start` | Run initialization |
| `phase_start` | Phase transition |
| `worker_call` | Worker CLI invocation |
| `verify_attempt` | Verification command execution |
| `checkpoint` | Git commit created |
| `error` | Error occurred |
| `run_end` | Run completion or termination |

## See Also

- [CLI Reference](cli.md) - All commands and flags
- [Configuration Reference](configuration.md) - Full config schema
- [Run Lifecycle](run-lifecycle.md) - Phase flow and states
- [Glossary](glossary.md) - Key terms
