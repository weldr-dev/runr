# CLI Reference

Complete reference for all `agent` commands and flags.

## Installation

```bash
npm install -g agent-runner
```

The package installs as `agent-runner`, the binary is `agent`.

---

## Commands

### agent run

Execute a task with full phase lifecycle.

```bash
agent run --task <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--task <path>` | Task file (required) | - |
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.agent/agent.config.json` |
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
agent run --task .agent/tasks/add-feature.md --worktree --time 30
```

---

### agent resume

Resume a stopped run.

```bash
agent resume <runId> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.agent/agent.config.json` |
| `--time <minutes>` | Time budget | `120` |
| `--max-ticks <count>` | Max phase transitions | `50` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--force` | Resume despite env mismatch | `false` |
| `--auto-resume` | Continue auto-resuming | `false` |

---

### agent status

Show run status.

```bash
agent status [runId] [options]
agent status --all
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--all` | Show all runs |

---

### agent report

Generate run report.

```bash
agent report <runId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--tail <count>` | Tail last N events | `50` |
| `--kpi-only` | Compact KPI summary only | `false` |

---

### agent follow

Tail run timeline in real-time.

```bash
agent follow [runId|latest] [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

Exits when run reaches terminal state.

---

### agent wait

Block until run reaches terminal state.

```bash
agent wait [runId|latest] [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | Wait for: terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |

---

### agent doctor

Check worker CLI availability.

```bash
agent doctor [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--config <path>` | Config file path |

---

### agent summarize

Generate summary.json from run KPIs.

```bash
agent summarize <runId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### agent compare

Compare KPIs between two runs.

```bash
agent compare <runA> <runB> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### agent metrics

Show aggregated metrics across runs.

```bash
agent metrics [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--days <n>` | Days to aggregate | `30` |
| `--window <n>` | Max runs to consider | `50` |
| `--json` | Output JSON format | `false` |

---

### agent gc

Clean up old worktree directories.

```bash
agent gc [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--dry-run` | Preview without deleting | `false` |
| `--older-than <days>` | Only delete older than N days | `7` |

---

### agent paths

Display canonical agent directory paths.

```bash
agent paths [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--json` / `--no-json` | Output format |

---

### agent version

Show version information.

```bash
agent version [options]
```

| Flag | Description |
|------|-------------|
| `--json` | Output JSON format |

---

### agent guards-only

Run only preflight guards without executing.

```bash
agent guards-only --task <path> [options]
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

### agent orchestrate run

Start a new orchestration.

```bash
agent orchestrate run --config <path> [options]
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

### agent orchestrate resume

Resume a stopped orchestration.

```bash
agent orchestrate resume <orchestratorId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--time <minutes>` | Override time budget |
| `--max-ticks <count>` | Override max ticks |
| `--fast` / `--no-fast` | Override fast mode |
| `--collision-policy <p>` | Override collision policy |

### agent orchestrate wait

Block until orchestration completes.

```bash
agent orchestrate wait <orchestratorId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |
