# CLI Reference

Complete reference for all `runr` commands and flags.

## Installation

Install from npm:

```bash
npm install -g @weldr/runr
```

The package name is `@weldr/runr`, the binary is `runr`.

Install from source (optional):

```bash
git clone https://github.com/vonwao/runr.git
cd runr
npm install
npm run build
npm link
```

> **Note**: The legacy `agent` command still works but shows deprecation warnings.

---

## Commands

### runr init

Initialize Runr configuration in a project.

```bash
runr init [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--pack <name>` | Initialize with workflow pack | - |
| `--demo` | Create self-contained demo project | `false` |
| `--demo-dir <path>` | Directory for demo project | `runr-demo` |
| `--with-claude` | Include Claude Code integration files | `false` |
| `--dry-run` | Preview changes without writing | `false` |

**Demo Mode:**

Create a self-contained TypeScript demo project to try Runr in 2 minutes:

```bash
runr init --demo
cd runr-demo
npm install

# Task 1: success
runr run --task .runr/tasks/00-success.md
runr report latest

# Task 2: failure + recovery
runr run --task .runr/tasks/01-intentional-fail.md
runr continue
runr report latest

# Task 3: scope guard (expected to stop)
runr run --task .runr/tasks/02-scope-violation.md
```

**Workflow Packs:**

Packs provide complete workflow presets (config, docs, branch strategy):
- `solo` - Development branch workflow (dev → main)
- `trunk` - Trunk-based development (main only)

**Examples:**
```bash
# Interactive setup (auto-detects verification commands)
runr init

# Initialize with workflow pack
runr init --pack solo

# Preview pack changes
runr init --pack trunk --dry-run
```

See `runr packs` to list available packs.

---

### runr packs

List available workflow packs.

```bash
runr packs [options]
```

| Flag | Description |
|------|-------------|
| `--verbose` | Show pack loading details |

Workflow packs provide:
- Default configuration (branches, verification settings)
- Documentation templates (AGENTS.md, CLAUDE.md)
- Idempotent initialization actions

**Example:**
```bash
runr packs              # List available packs
runr packs --verbose    # Show pack directory
```

---

### runr run

Execute a task with full phase lifecycle.

```bash
runr run --task <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--task <path>` | Task file (required) | - |
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.runr/runr.config.json` |
| `--time <minutes>` | Time budget | `120` |
| `--max-ticks <count>` | Max phase transitions | `50` |
| `--worktree` | Create isolated git worktree | `false` |
| `--fast` | Skip PLAN and REVIEW phases | `false` |
| `--auto-resume` | Auto-resume on transient failures | `false` |
| `--force-parallel` | Bypass file collision checks | `false` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--allow-dirty` | Allow dirty worktree | `false` |
| `--dry-run` | Initialize without executing | `false` |
| `--fresh-target` | Wipe target root before start | `false` |
| `--skip-doctor` | Skip worker health checks | `false` |
| `--no-branch` | Don't checkout run branch | `false` |
| `--no-write` | Don't write artifacts | `false` |
| `--web` | Allow web access for unblock | `false` |
| `--json` | Output JSON with run_id | `false` |

**Example:**
```bash
runr run --task .runr/tasks/add-feature.md --worktree --time 30
```

---

### runr resume

Resume a stopped run.

```bash
runr resume <runId> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.runr/runr.config.json` |
| `--time <minutes>` | Time budget | `120` |
| `--max-ticks <count>` | Max phase transitions | `50` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--force` | Resume despite env mismatch | `false` |
| `--auto-resume` | Continue auto-resuming | `false` |

---

### runr continue

Do the next obvious thing for a stopped run. Smart alias that determines the appropriate action.

```bash
runr continue [runId|latest]
```

**Behavior:**
- If run stopped with recoverable error: attempts auto-fix and resumes
- If verification failed: shows error and suggests fix
- If complete: reports success

This is the recommended command after a run stops - it handles the most common recovery scenarios.

**Example:**
```bash
runr run --task .runr/tasks/feature.md --worktree
# ... run stops with verification_failed
runr continue   # Auto-diagnose and attempt recovery
```

---

### runr meta

Launch meta-agent mode with full workflow context.

```bash
runr meta [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |

**What it does:**
- Launches Claude Code with Runr workflow context loaded
- Agent has access to `/runr-bundle`, `/runr-submit`, `/runr-resume` commands
- Follows workflow rules from `AGENTS.md`
- Uses safety playbooks from `.claude/skills/runr-workflow`

**Requirements:**
- Clean working tree (blocks if uncommitted changes)
- Claude Code CLI installed and authenticated

**Example:**
```bash
runr init --pack solo --with-claude
runr meta
# Claude Code launches with full Runr integration
```

---

### runr watch

Monitor a run with optional auto-resume on transient failures.

```bash
runr watch <runId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--auto-resume` | Auto-resume on transient failures | `false` |
| `--max-attempts <n>` | Max resume attempts | `3` |

**Example:**
```bash
# Monitor and auto-recover from timeouts
runr watch latest --auto-resume --max-attempts 3
```

---

### runr status

Show run status.

```bash
runr status [runId] [options]
runr status --all
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--all` | Show all runs |

---

### runr report

Generate run report.

```bash
runr report <runId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--tail <count>` | Tail last N events | `50` |
| `--kpi-only` | Compact KPI summary only | `false` |

---

### runr follow

Tail run timeline in real-time.

```bash
runr follow [runId|latest] [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

Exits when run reaches terminal state.

---

### runr wait

Block until run reaches terminal state.

```bash
runr wait [runId|latest] [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | Wait for: terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |

---

### runr doctor

Check worker CLI availability.

```bash
runr doctor [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--config <path>` | Config file path |

---

### runr summarize

Generate summary.json from run KPIs.

```bash
runr summarize <runId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### runr compare

Compare KPIs between two runs.

```bash
runr compare <runA> <runB> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### runr metrics

Show aggregated metrics across runs.

```bash
runr metrics [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--days <n>` | Days to aggregate | `30` |
| `--window <n>` | Max runs to consider | `50` |
| `--json` | Output JSON format | `false` |

---

### runr gc

Clean up old worktree directories.

```bash
runr gc [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--dry-run` | Preview without deleting | `false` |
| `--older-than <days>` | Only delete older than N days | `7` |

---

### runr paths

Display canonical runr directory paths.

```bash
runr paths [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--json` / `--no-json` | Output format |

---

### runr bundle

Generate deterministic evidence bundle from a run.

```bash
runr bundle <runId> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--output <path>` | Write bundle to file | stdout |

Bundles contain:
- Run metadata (status, duration, stop reason)
- Milestone checklist
- Verification results (tier, commands, status)
- Checkpoint SHA and git diffstat
- Timeline event summary

**Examples:**
```bash
# Print bundle to stdout
runr bundle run_20260105_120000

# Save to file
runr bundle run_20260105_120000 --output /tmp/bundle.md
```

**Output format:** Deterministic markdown (same run_id → identical output, sorted data, no absolute paths)

---

### runr submit

Submit verified checkpoint to target branch via cherry-pick.

```bash
runr submit <runId> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--to <branch>` | Target branch | config: `workflow.integration_branch` |
| `--dry-run` | Show plan without making changes | `false` |
| `--push` | Push target branch after submit | `false` |
| `--config <path>` | Config file path | `.runr/runr.config.json` |

**Validation chain** (fail-fast with actionable errors):
1. Run must have checkpoint SHA
2. Run must be in terminal state (complete or stopped)
3. Working tree must be clean
4. Target branch must exist
5. Verification evidence required (if `workflow.require_verification: true`)

**Examples:**
```bash
# Preview submit
runr submit run_20260105_120000 --to main --dry-run

# Submit to integration branch
runr submit run_20260105_120000 --to dev

# Submit and push
runr submit run_20260105_120000 --to main --push
```

**Conflict handling:**
- On conflict: writes `submit_conflict` event, aborts cherry-pick, restores starting branch
- Check timeline.jsonl for conflicted files list
- Resolution: manual cherry-pick or rebase checkpoint

**Branch restoration:**
- Always restores starting branch on success, conflict, or error (best-effort)

---

### runr version

Show version information.

```bash
runr version [options]
```

| Flag | Description |
|------|-------------|
| `--json` | Output JSON format |

---

### runr tools guard

Run only preflight guards without executing.

```bash
runr tools guard --task <path> [options]
```

| Flag | Description |
|------|-------------|
| `--task <path>` | Task file (required) |
| `--repo <path>` | Target repo path |
| `--config <path>` | Config file path |
| `--allow-deps` | Allow lockfile changes |
| `--allow-dirty` | Allow dirty worktree |
| `--no-write` | Don't write artifacts |

---

## Orchestration Commands

Multi-track execution with collision-aware scheduling.

### runr orchestrate run

Start a new orchestration.

```bash
runr orchestrate run --config <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Orchestration config (required) | - |
| `--repo <path>` | Target repo path | `.` |
| `--time <minutes>` | Time budget per run | `120` |
| `--max-ticks <count>` | Max ticks per run | `50` |
| `--collision-policy <p>` | serialize, force, fail | `serialize` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--worktree` | Create worktree per run | `false` |
| `--fast` | Skip PLAN/REVIEW phases | `false` |
| `--auto-resume` | Auto-resume on failures | `false` |
| `--dry-run` | Show plan without running | `false` |

### runr orchestrate resume

Resume a stopped orchestration.

```bash
runr orchestrate resume <orchestratorId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--time <minutes>` | Override time budget |
| `--max-ticks <count>` | Override max ticks |
| `--fast` / `--no-fast` | Override fast mode |
| `--collision-policy <p>` | Override collision policy |

### runr orchestrate wait

Block until orchestration completes.

```bash
runr orchestrate wait <orchestratorId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |

### runr orchestrate receipt

Generate orchestration receipt (manager dashboard).

```bash
runr orchestrate receipt <orchestratorId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--output <path>` | Write receipt to file | stdout |
| `--json` | Output JSON instead of markdown | `false` |

---

## Hybrid Workflow Commands

Commands for recording manual work and tracking provenance.

### runr config mode

View or switch workflow mode.

```bash
runr config mode [flow|ledger]
```

**Examples:**
```bash
# View current mode
runr config mode

# Switch to ledger mode (audit-first)
runr config mode ledger

# Switch to flow mode (productivity-first)
runr config mode flow
```

---

### runr intervene

Record manual work done outside Runr's normal flow.

```bash
runr intervene <runId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--reason <reason>` | Intervention reason (required) | - |
| `--note <text>` | Description of what was done | - |
| `--cmd <command>` | Command to run and capture (repeatable) | - |
| `--since <sha>` | Attribute commits since SHA | - |
| `--commit <msg>` | Create commit with Runr trailers | - |
| `--amend-last` | Amend last checkpoint (Flow mode only) | `false` |

**Reasons:**
- `review_loop` - Fixing issues from review cycle
- `stalled_timeout` - Recovering from stalled run
- `verification_failed` - Fixing verification failures
- `scope_violation` - Handling out-of-scope changes
- `manual_fix` - General manual work
- `other` - Catch-all

**Examples:**
```bash
# Basic intervention
runr intervene latest --reason manual_fix --note "Fixed import issue"

# With commands to run and capture
runr intervene latest --reason review_loop --note "Fixed TS errors" \
  --cmd "npm run typecheck" --cmd "npm test"

# Retroactive attribution
runr intervene latest --reason scope_violation --note "Manual changes" \
  --since abc123

# Create commit with Runr trailers
runr intervene latest --reason manual_fix --note "Hotfix" \
  --commit "Fix production bug"
```

---

### runr audit

View project history classified by provenance.

```bash
runr audit [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--range <range>` | Git commit range | `HEAD~50..HEAD` |
| `--limit <n>` | Max commits to show | `50` |
| `--run <runId>` | Filter to specific run | - |
| `--coverage` | Show coverage summary | `false` |
| `--fail-under <pct>` | Exit 1 if coverage below threshold | - |
| `--json` | Output JSON format | `false` |

**Classifications:**
- `CHECKPOINT` - Runr checkpoint with receipt
- `INTERVENTION` - Recorded via `runr intervene`
- `INFERRED` - Within intervention SHA range
- `ATTRIBUTED` - Has Runr trailers but no receipt
- `GAP` - No attribution (audit gap)

**Examples:**
```bash
# View last 50 commits
runr audit

# Custom range
runr audit --range main~100..main

# JSON output for dashboards
runr audit --coverage --json

# CI mode: fail if coverage below threshold
runr audit --fail-under 60
```

---

## Git Hooks Commands

Manage Runr git hooks for provenance enforcement.

### runr hooks install

Install git hooks for the repository.

```bash
runr hooks install [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

Installs a commit-msg hook that:
- In **Flow mode**: warns on provenance gaps but allows commit
- In **Ledger mode**: blocks commits without Runr attribution

---

### runr hooks uninstall

Remove Runr git hooks.

```bash
runr hooks uninstall [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### runr hooks status

Check if hooks are installed and their mode.

```bash
runr hooks status [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

## Command Groups (Quick Reference)

| Group | Commands | Purpose |
|-------|----------|---------|
| **Setup** | init, doctor, mode | Configure project and environment |
| **Execution** | run, resume, status, follow, wait | Run and monitor tasks |
| **Recording** | intervene, note | Record manual work |
| **Integration** | bundle, submit | Package and submit verified work |
| **Audit** | audit, journal, report | Review provenance and history |
| **Maintenance** | gc, hooks | Cleanup and git hooks |
| **Orchestration** | orchestrate run/resume/wait/receipt | Multi-task execution |
