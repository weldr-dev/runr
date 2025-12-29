# Agent Framework Documentation

## Canonical Conventions

| Aspect | Convention |
|--------|------------|
| **CLI** | `agent` (installed via `git clone` + `npm link`, see [Quickstart](quickstart.md)) |
| **Config** | `.agent/agent.config.json` |
| **Tasks** | `.agent/tasks/*.md` |
| **Runs** | `.agent/runs/<run_id>/` |
| **Orchestrations** | `.agent/orchestrations/<orch_id>/` |

> Some legacy docs may reference `agent.config.json` at repo root or `runs/` at repo root. The canonical public interface is `.agent/...`.

---

## Start Here

- **[Overview](overview.md)** - Simple explanation (non-technical)
- **[How It Works](how-it-works.md)** - Technical explanation
- **[Quickstart](quickstart.md)** - Get running in 5 minutes
- **[CLI Reference](cli.md)** - All commands and flags

## Core Concepts

- [Run Lifecycle](run-lifecycle.md) - Phase flow: PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
- [Guards and Scope](guards-and-scope.md) - Allowlist, denylist, presets
- [Verification](verification.md) - Tier0/1/2 test selection
- [Configuration](configuration.md) - Full config schema

## Architecture

- [Architecture Overview](architecture.md) - System design
- [Workers](workers.md) - Claude/Codex integration
- [Worktrees](worktrees.md) - Git worktree isolation
- [Run Store](run-store.md) - State and artifacts

## Reference

- [Glossary](glossary.md) - Terms and definitions
- [Troubleshooting](troubleshooting.md) - Common issues
- [RUNBOOK](RUNBOOK.md) - Operator workflows

## Guides

- [Target Repo Setup](TARGET_REPO_SETUP.md) - Using in your project
- [Pilot Program](PILOT_PROGRAM.md) - Early adopter guide

## Status

| Feature | Status |
|---------|--------|
| Milestone execution | Implemented |
| Scope guards | Implemented |
| Review loop detection | Implemented |
| Worktree isolation | Implemented |
| Auto-resume | Implemented |
| Collision detection | Implemented |
| Scope presets | Implemented (v0.2.1) |

---

## Reading Paths

**New user**: Quickstart → Run Lifecycle → Configuration

**Understanding safety**: Guards and Scope → Verification → Worktrees

**Debugging a run**: CLI Reference → Troubleshooting → RUNBOOK
