# Agent Framework Runbook

Operational guide for starting, monitoring, and troubleshooting agent runs.

For command details, see [CLI Reference](cli.md). For configuration, see [Configuration Reference](configuration.md).

## Starting a Run

### Basic Run

```bash
agent run --task .agent/tasks/my-task.md
```

### Common Options

```bash
# Run with worktree isolation (recommended)
agent run --task .agent/tasks/my-task.md --worktree

# Set time budget (default: 120 minutes)
agent run --task .agent/tasks/my-task.md --time 60

# Set max ticks (default: 50)
agent run --task .agent/tasks/my-task.md --max-ticks 20

# Allow lockfile changes
agent run --task .agent/tasks/my-task.md --allow-deps

# Allow dirty worktree
agent run --task .agent/tasks/my-task.md --allow-dirty

# Custom config file
agent run --task .agent/tasks/my-task.md --config ./custom.config.json
```

### Dry Run Mode

Initialize without executing:

```bash
agent run --task .agent/tasks/my-task.md --dry-run
```

### Pre-flight Check Only

```bash
runr tools guard --task .runr/tasks/my-task.md
```

## Monitoring a Run

### Live Tail

```bash
agent follow latest
agent follow <run_id>
```

### Report

```bash
agent report latest
agent report <run_id> --tail 100
agent report latest --kpi-only
```

### Status

```bash
agent status <run_id>
agent status --all
```

## Resuming a Run

```bash
# Basic resume
agent resume <run_id>

# With extended time
agent resume <run_id> --time 60

# Force (ignore environment fingerprint mismatch)
agent resume <run_id> --force
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
.agent/runs/<run_id>/
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
.agent-worktrees/<run_id>/
```

## Common Workflows

### Start and Monitor

```bash
# Terminal 1: Start
agent run --task .agent/tasks/my-task.md --worktree

# Terminal 2: Follow
agent follow latest
```

### Debug a Failed Run

```bash
# Get report
agent report <run_id>

# Check raw state
agent status <run_id>

# View timeline
cat .agent/runs/<run_id>/timeline.jsonl | jq .

# View verification logs
cat .agent/runs/<run_id>/artifacts/tests_*.log
```

### Resume After Failure

```bash
agent report <run_id>           # Check what failed
agent resume <run_id> --force   # Resume
agent follow <run_id>           # Monitor
```

## Troubleshooting

### Guard Violations

#### "Dirty worktree detected"

```bash
# Option 1: Commit or stash
git stash

# Option 2: Allow it
agent run --task task.md --allow-dirty
```

#### "Lockfile changes detected"

```bash
# Option 1: Commit lockfile
git add package-lock.json && git commit -m "chore: update lockfile"

# Option 2: Allow it
agent run --task task.md --allow-deps
```

#### "Config file not found"

Create `.agent/agent.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": { "allowlist": ["src/**"] },
  "verification": { "tier0": ["npm run lint"] }
}
```

#### "Worker CLI not available"

```bash
agent doctor
```

### Verification Failures

#### "Verification failed after 3 attempts"

```bash
# Check logs
cat .agent/runs/<run_id>/artifacts/tests_*.log

# Check report
agent report <run_id>
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
cat .agent/runs/<run_id>/timeline.jsonl | jq 'select(.type == "worker_call")'
```

### Worktree Issues

#### "Worktree not found"

The worktree was deleted. Start a new run.

#### "Worktree has uncommitted changes"

```bash
# Check status
cd .agent-worktrees/<run_id>
git status

# Option 1: Commit changes
git add -A && git commit -m "recover changes"

# Option 2: Discard changes
git checkout -- . && git clean -fd
```

#### "Cannot create worktree - already exists"

```bash
git worktree remove --force .agent-worktrees/<old_run_id>
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
agent report <run_id> --tail 500

# Raw state
cat .agent/runs/<run_id>/state.json | jq .

# Timeline analysis
cat .agent/runs/<run_id>/timeline.jsonl | jq -s 'group_by(.type) | map({type: .[0].type, count: length})'

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
