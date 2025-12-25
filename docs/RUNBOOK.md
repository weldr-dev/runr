# Agent Framework Runbook

Operational guide for starting and monitoring agent runs.

## Starting a Run

### Basic Run

Start a new run with the minimum required options:

```bash
node dist/cli.js run --repo /path/to/target --task /path/to/task.md
```

### Common Options

```bash
# Run with custom time budget (default: 120 minutes)
node dist/cli.js run --repo . --task task.md --time 60

# Run with more supervisor ticks (default: 10)
node dist/cli.js run --repo . --task task.md --max-ticks 20

# Allow lockfile changes (npm, yarn, pnpm)
node dist/cli.js run --repo . --task task.md --allow-deps

# Allow dirty worktree (uncommitted changes)
node dist/cli.js run --repo . --task task.md --allow-dirty

# Run in isolated worktree (recommended for parallel runs)
node dist/cli.js run --repo . --task task.md --worktree

# Use custom config file
node dist/cli.js run --repo . --task task.md --config ./custom.config.json

# Skip worker health checks
node dist/cli.js run --repo . --task task.md --skip-doctor

# Clean target directory before starting
node dist/cli.js run --repo . --task task.md --fresh-target
```

### Dry Run Mode

Initialize a run without executing the supervisor loop:

```bash
node dist/cli.js run --repo . --task task.md --dry-run
```

### Guards-Only Check

Test preflight guards without running the supervisor:

```bash
node dist/cli.js guards-only --repo . --task task.md
```

### Health Check

Verify worker CLIs are available and responding:

```bash
node dist/cli.js doctor --repo . --config ./agent.config.json
```

## Monitoring a Run

### Follow (Live Tail)

Stream timeline events in real-time:

```bash
# Follow the latest running run (or most recent if none running)
node dist/cli.js follow

# Follow a specific run
node dist/cli.js follow 20251225120000

# Explicitly follow latest
node dist/cli.js follow latest
```

Output shows:
- Timeline events as they occur
- Current phase and worker status
- Progress age indicator
- Termination reason when run ends

### Report

Get a structured summary of a run:

```bash
# Report on latest run
node dist/cli.js report latest

# Report on specific run
node dist/cli.js report 20251225120000

# Show more events (default: 50)
node dist/cli.js report latest --tail 100

# Compact KPI-only output
node dist/cli.js report latest --kpi-only
```

Report includes:
- Run metadata (id, repo, phase, milestone)
- KPIs: duration, outcome, milestones completed, worker calls
- Phase breakdown with durations
- Verification attempts and retries
- Reliability metrics (retries, fallbacks, stalls)
- Pointers to state.json, timeline.jsonl, and logs

### Status

Get the raw state JSON for a run:

```bash
node dist/cli.js status 20251225120000
```

Returns the full `state.json` contents including:
- Current phase
- Milestone index
- Error state
- Checkpoint commits

### Compare Runs

Compare KPIs between two runs:

```bash
node dist/cli.js compare 20251225100000 20251225120000
```

## Resuming a Run

Resume a stopped or failed run:

```bash
# Basic resume
node dist/cli.js resume 20251225120000

# Resume with different time budget
node dist/cli.js resume 20251225120000 --time 60

# Resume with more ticks
node dist/cli.js resume 20251225120000 --max-ticks 30

# Force resume despite environment fingerprint mismatch
node dist/cli.js resume 20251225120000 --force
```

Resume behavior:
- Loads config snapshot from the original run
- Validates worktree if the run used `--worktree`
- Compares environment fingerprint (node version, lockfile, workers)
- Continues from the phase after the last successful one

## Run ID Format

Run IDs are timestamps in the format `YYYYMMDDHHmmss` (UTC):
- `20251225120000` = December 25, 2025 at 12:00:00 UTC

## Run Directory Structure

Each run creates a directory under `runs/<run_id>/`:

```
runs/20251225120000/
├── state.json           # Current run state
├── timeline.jsonl       # Event log (append-only)
├── config.snapshot.json # Config at run start
├── env.fingerprint.json # Environment snapshot
├── artifacts/
│   ├── task.md          # Original task
│   ├── plan.json        # Generated plan
│   └── tests_*.log      # Verification logs
└── worktree/            # (if --worktree used)
```

## Common Workflows

### Start and Monitor

```bash
# Terminal 1: Start the run
node dist/cli.js run --repo . --task task.md --worktree

# Terminal 2: Follow progress
node dist/cli.js follow
```

### Debug a Failed Run

```bash
# Check the report
node dist/cli.js report 20251225120000

# Get raw state
node dist/cli.js status 20251225120000

# Check timeline events
cat runs/20251225120000/timeline.jsonl | jq .

# View verification logs
cat runs/20251225120000/artifacts/tests_*.log
```

### Resume After Failure

```bash
# Check what failed
node dist/cli.js report 20251225120000

# Resume with force if environment changed
node dist/cli.js resume 20251225120000 --force

# Follow the resumed run
node dist/cli.js follow 20251225120000
```

## Resuming a Failed Run

### When to Use Resume

Use the `resume` command when:
- A run was interrupted (Ctrl+C, system shutdown, crash)
- A run failed due to transient issues (network timeout, worker crash)
- You've fixed an external issue (missing dependency, permissions)
- The time budget expired before completion

Do **not** use resume when:
- The task definition itself is incorrect (start a new run instead)
- Major environment changes occurred (new Node version, different machine)
- You want to change the plan or milestones (start fresh)

### Resume Command Details

```bash
# Basic resume - continues from last successful phase
node dist/cli.js resume <run_id>

# Resume with extended time budget
node dist/cli.js resume <run_id> --time 180

# Resume with more supervisor ticks
node dist/cli.js resume <run_id> --max-ticks 50

# Force resume when environment fingerprint differs
node dist/cli.js resume <run_id> --force
```

### What Happens on Resume

1. **State validation**: Loads `state.json` and validates the run can be resumed
2. **Worktree check**: If `--worktree` was used, verifies the worktree still exists
3. **Environment fingerprint**: Compares current environment against `env.fingerprint.json`
   - Node.js version
   - Lockfile hash
   - Worker CLI availability
4. **Phase continuation**: Starts from the phase following the last completed one
5. **Config restoration**: Uses `config.snapshot.json` from the original run

### Environment Fingerprint Mismatch

If the environment has changed since the original run:

```
Error: Environment fingerprint mismatch
  Node version: expected v20.10.0, got v21.1.0
  Use --force to resume anyway
```

Use `--force` only when you're confident the changes won't affect the run:
- Minor Node.js patch updates
- Updated but compatible worker CLIs
- Same lockfile with different timestamp

### Resume State Flow

```
Original run stopped at VERIFY phase for milestone 2
    ↓
Resume command issued
    ↓
Loads state: phase=VERIFY, milestoneIndex=1
    ↓
Validates environment fingerprint
    ↓
Continues VERIFY phase for milestone 2
    ↓
On success → CHECKPOINT → next milestone
On failure → IMPLEMENT (retry) or STOPPED
```

## Troubleshooting Guide

### Guard Violations

Guards are preflight checks that prevent runs from starting in invalid conditions.

#### Symptom: "Dirty worktree detected"

**Cause**: The target repository has uncommitted changes.

**Resolution**:
```bash
# Option 1: Commit or stash changes
git stash
node dist/cli.js run --repo . --task task.md

# Option 2: Allow dirty worktree (use with caution)
node dist/cli.js run --repo . --task task.md --allow-dirty
```

#### Symptom: "Lockfile changes detected"

**Cause**: Package lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml) has uncommitted changes.

**Resolution**:
```bash
# Option 1: Commit lockfile changes
git add package-lock.json
git commit -m "chore: update lockfile"
node dist/cli.js run --repo . --task task.md

# Option 2: Allow lockfile changes
node dist/cli.js run --repo . --task task.md --allow-deps
```

#### Symptom: "Config file not found"

**Cause**: The `agent.config.json` file doesn't exist in the target repository.

**Resolution**:
```bash
# Create a minimal config file
cat > agent.config.json << 'EOF'
{
  "guards": [],
  "verification": {
    "commands": ["npm test"]
  }
}
EOF
```

#### Symptom: "Worker CLI not available"

**Cause**: The configured worker CLI (e.g., `claude`) is not in PATH or not responding.

**Resolution**:
```bash
# Check worker availability
node dist/cli.js doctor --repo . --config ./agent.config.json

# Skip doctor check if you know the worker is available
node dist/cli.js run --repo . --task task.md --skip-doctor
```

### Verification Failures

#### Symptom: "Verification failed after 3 attempts"

**Cause**: The worker's implementation doesn't pass the verification commands.

**Investigation**:
```bash
# Check verification logs
cat runs/<run_id>/artifacts/tests_*.log

# Check the report for failure details
node dist/cli.js report <run_id>

# View timeline for context
cat runs/<run_id>/timeline.jsonl | jq 'select(.type == "verify")'
```

**Resolution**:
- Review the verification command output in the logs
- Check if the milestone's "done checks" are realistic
- Ensure verification commands are correct in `agent.config.json`
- Consider breaking the milestone into smaller steps

#### Symptom: "Verification command timed out"

**Cause**: A verification command took longer than the configured timeout.

**Resolution**:
```bash
# Check which command timed out in the logs
cat runs/<run_id>/artifacts/tests_*.log | grep -i timeout

# Update agent.config.json to increase timeout
# "verification": { "timeout": 300000 }  # 5 minutes
```

#### Symptom: "No verification commands configured"

**Cause**: The `agent.config.json` doesn't specify verification commands.

**Resolution**:
```json
{
  "verification": {
    "commands": [
      "npm run build",
      "npm test"
    ],
    "timeout": 120000
  }
}
```

### Worker Timeouts

#### Symptom: "Worker did not respond within timeout"

**Cause**: The worker CLI (Claude, etc.) took too long to respond or became unresponsive.

**Investigation**:
```bash
# Check worker process status
ps aux | grep claude

# Check timeline for worker call duration
cat runs/<run_id>/timeline.jsonl | jq 'select(.type == "worker_call") | {duration: .duration}'
```

**Resolution**:
- Check network connectivity (workers may need API access)
- Verify worker CLI is correctly installed and authenticated
- Check for rate limiting or quota issues with the worker API
- Resume the run after transient issues resolve:
  ```bash
  node dist/cli.js resume <run_id>
  ```

#### Symptom: "Worker process crashed"

**Cause**: The worker CLI process terminated unexpectedly.

**Investigation**:
```bash
# Check for crash logs
cat runs/<run_id>/timeline.jsonl | jq 'select(.type == "error")'

# Check system logs
dmesg | tail -50
```

**Resolution**:
- Update the worker CLI to the latest version
- Check available system resources (memory, disk space)
- Resume after ensuring stability:
  ```bash
  node dist/cli.js resume <run_id>
  ```

### Worktree Issues

#### Symptom: "Worktree not found"

**Cause**: The isolated worktree directory was deleted or moved.

**Resolution**:
```bash
# Check if worktree exists
ls runs/<run_id>/worktree/

# If missing, the run cannot be resumed
# Start a new run instead
node dist/cli.js run --repo . --task task.md --worktree
```

#### Symptom: "Worktree has uncommitted changes"

**Cause**: The worktree has changes that weren't checkpointed.

**Investigation**:
```bash
# Check worktree status
cd runs/<run_id>/worktree
git status
git diff
```

**Resolution**:
```bash
# Option 1: Commit the changes manually
cd runs/<run_id>/worktree
git add -A
git commit -m "manual: recover uncommitted changes"
cd -
node dist/cli.js resume <run_id>

# Option 2: Discard changes and resume
cd runs/<run_id>/worktree
git checkout -- .
git clean -fd
cd -
node dist/cli.js resume <run_id>
```

#### Symptom: "Cannot create worktree - already exists"

**Cause**: A previous run's worktree wasn't cleaned up properly.

**Resolution**:
```bash
# Remove the orphaned worktree
git worktree remove --force runs/<old_run_id>/worktree

# Prune stale worktree entries
git worktree prune

# Start new run
node dist/cli.js run --repo . --task task.md --worktree
```

#### Symptom: "Worktree branch conflicts"

**Cause**: The worktree branch name collides with an existing branch.

**Resolution**:
```bash
# List existing branches
git branch -a | grep agent/

# Remove stale agent branches if safe
git branch -D agent/<old_run_id>/milestone-1

# Prune worktrees and try again
git worktree prune
node dist/cli.js run --repo . --task task.md --worktree
```

### General Debugging

#### Collecting Debug Information

```bash
# Full report with extended event history
node dist/cli.js report <run_id> --tail 500

# Raw state inspection
cat runs/<run_id>/state.json | jq .

# Timeline analysis
cat runs/<run_id>/timeline.jsonl | jq -s 'group_by(.type) | map({type: .[0].type, count: length})'

# Check all artifacts
ls -la runs/<run_id>/artifacts/
```

#### Common Timeline Event Types

| Event Type | Description |
|------------|-------------|
| `run_start` | Run initialization |
| `phase_start` | Phase transition (PLAN, IMPLEMENT, VERIFY, CHECKPOINT) |
| `worker_call` | Worker CLI invocation |
| `verify_attempt` | Verification command execution |
| `checkpoint` | Git commit created |
| `error` | Error occurred |
| `run_end` | Run completion or termination |

#### Environment Diagnostics

```bash
# Check Node.js version
node --version

# Check worker availability
which claude
claude --version

# Check git status
git status
git worktree list

# Check disk space
df -h .
```

## Configuration Reference

The `agent.config.json` file controls how the agent framework operates. This section documents the key configuration fields.

### Minimal Configuration

A minimal working configuration:

```json
{
  "verification": {
    "tier0": ["npm run build"],
    "tier1": ["npm test"]
  },
  "workers": {
    "claude": {
      "bin": "claude",
      "args": ["-p", "--output-format", "json"],
      "output": "json"
    }
  },
  "phases": {
    "plan": "claude",
    "implement": "claude"
  }
}
```

### Agent Metadata

Optional metadata about the agent configuration:

```json
{
  "agent": {
    "name": "dual-llm-orchestrator",
    "version": "1"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `agent.name` | string | Identifier for this agent configuration |
| `agent.version` | string | Version of the configuration schema |

### Repository Settings

Configure repository-specific behavior:

```json
{
  "repo": {
    "default_branch": "main"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `repo.default_branch` | string | `"main"` | The main branch to use as base for worktrees and PRs |

### Scope Configuration

Control which files the agent can modify:

```json
{
  "scope": {
    "allowlist": ["src/**", "tests/**", "docs/**"],
    "denylist": ["infra/**", "migrations/**"],
    "lockfiles": ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scope.allowlist` | string[] | Glob patterns for files the agent CAN modify |
| `scope.denylist` | string[] | Glob patterns for files the agent CANNOT modify (takes precedence) |
| `scope.lockfiles` | string[] | Package manager lockfiles that require `--allow-deps` to modify |

**Scope evaluation rules:**
1. A file must match at least one `allowlist` pattern to be modifiable
2. If a file matches any `denylist` pattern, it cannot be modified regardless of allowlist
3. Lockfiles are blocked unless the `--allow-deps` flag is passed

**Example: Documentation-only scope:**

```json
{
  "scope": {
    "allowlist": ["docs/**", "*.md"],
    "denylist": ["src/**", "dist/**"]
  }
}
```

### Verification Configuration

Define how milestones are verified:

```json
{
  "verification": {
    "tier0": ["pnpm build"],
    "tier1": ["pnpm test"],
    "tier2": ["pnpm test:integration"],
    "risk_triggers": [
      {
        "name": "deps",
        "patterns": ["package.json", "*-lock.json", "pnpm-lock.yaml"],
        "tier": "tier1"
      },
      {
        "name": "auth",
        "patterns": ["src/auth/**"],
        "tier": "tier2"
      },
      {
        "name": "docs-only",
        "patterns": ["docs/**"],
        "tier": "tier0"
      }
    ],
    "max_verify_time_per_milestone": 600
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verification.tier0` | string[] | `[]` | Fast verification commands (build, lint, typecheck) |
| `verification.tier1` | string[] | `[]` | Standard verification commands (unit tests) |
| `verification.tier2` | string[] | `[]` | Thorough verification commands (integration tests) |
| `verification.risk_triggers` | object[] | `[]` | Rules for selecting verification tier based on changed files |
| `verification.max_verify_time_per_milestone` | number | `300` | Maximum seconds for verification commands per milestone |

**Verification tier selection:**

The agent selects the highest applicable tier based on which files changed:

1. Check changed files against each `risk_triggers` entry
2. If any trigger matches, use that trigger's tier
3. Multiple matches → use highest tier (tier2 > tier1 > tier0)
4. No matches → default to tier1

**Risk trigger structure:**

| Field | Type | Description |
|-------|------|-------------|
| `risk_triggers[].name` | string | Human-readable name for this trigger |
| `risk_triggers[].patterns` | string[] | Glob patterns to match against changed files |
| `risk_triggers[].tier` | string | Verification tier to use: `"tier0"`, `"tier1"`, or `"tier2"` |

### Workers Configuration

Define available worker CLIs:

```json
{
  "workers": {
    "claude": {
      "bin": "claude",
      "args": ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
      "output": "json"
    },
    "codex": {
      "bin": "codex",
      "args": ["exec", "--full-auto", "--json"],
      "output": "jsonl"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `workers.<name>` | object | Worker configuration keyed by worker name |
| `workers.<name>.bin` | string | Binary name or path to the worker CLI |
| `workers.<name>.args` | string[] | Default arguments passed to the worker |
| `workers.<name>.output` | string | Output format: `"json"` or `"jsonl"` |

**Worker output formats:**

| Format | Description |
|--------|-------------|
| `json` | Worker outputs a single JSON object |
| `jsonl` | Worker outputs newline-delimited JSON (JSON Lines) |

**Example: Adding a custom worker:**

```json
{
  "workers": {
    "my-worker": {
      "bin": "/usr/local/bin/my-ai-cli",
      "args": ["--mode", "autonomous", "--format", "json"],
      "output": "json"
    }
  }
}
```

### Phases Configuration

Assign workers to each phase of the supervisor loop:

```json
{
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `phases.plan` | string | Worker name to use for planning phase |
| `phases.implement` | string | Worker name to use for implementation phase |
| `phases.review` | string | Worker name to use for review phase (optional) |

**Phase execution order:**

```
PLAN → IMPLEMENT → VERIFY → CHECKPOINT → (next milestone)
```

- **PLAN**: Generates milestones from the task description (uses `phases.plan` worker)
- **IMPLEMENT**: Executes code changes for current milestone (uses `phases.implement` worker)
- **VERIFY**: Runs verification commands (uses `verification.tierN` commands)
- **CHECKPOINT**: Creates git commit for successful milestone

**Example: Using different workers for different phases:**

```json
{
  "phases": {
    "plan": "claude",
    "implement": "codex",
    "review": "claude"
  }
}
```

### Complete Configuration Example

A comprehensive configuration showing all options:

```json
{
  "agent": {
    "name": "my-project-agent",
    "version": "1"
  },
  "repo": {
    "default_branch": "main"
  },
  "scope": {
    "allowlist": ["src/**", "tests/**", "docs/**"],
    "denylist": ["src/generated/**", "dist/**"],
    "lockfiles": ["package-lock.json", "pnpm-lock.yaml"]
  },
  "verification": {
    "tier0": ["npm run build", "npm run lint"],
    "tier1": ["npm test"],
    "tier2": ["npm run test:integration", "npm run test:e2e"],
    "risk_triggers": [
      {
        "name": "dependencies",
        "patterns": ["package.json", "package-lock.json"],
        "tier": "tier1"
      },
      {
        "name": "security",
        "patterns": ["src/auth/**", "src/security/**"],
        "tier": "tier2"
      },
      {
        "name": "documentation",
        "patterns": ["docs/**", "*.md"],
        "tier": "tier0"
      }
    ],
    "max_verify_time_per_milestone": 600
  },
  "workers": {
    "claude": {
      "bin": "claude",
      "args": ["-p", "--output-format", "json"],
      "output": "json"
    }
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```
