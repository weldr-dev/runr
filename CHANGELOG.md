# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-12-27

Initial stable release with full dual-LLM orchestration and autonomy features.

### Added

- **Dual-LLM orchestration**: Claude for planning/review, Codex for implementation
- **Phase-based execution**: PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
- **Safety guards**: Scope allowlist/denylist, lockfile protection, dirty worktree checks
- **Verification tiers**: Risk-based test selection with automatic retries
- **Worktree isolation**: Git worktrees for safe parallel runs
- **Auto-resume**: Automatic recovery from transient failures (stall timeout, worker timeout)
- **Evidence gate**: Requires proof for `no_changes_needed` claims

### Orchestrator

- **Multi-track orchestration**: Run parallel tracks of serial steps
- **Collision detection**: Prevent merge conflicts with allowlist overlap checking
- **Collision policies**: serialize, force, fail
- **Resume support**: Resume orchestrations from any state
- **Artifact schema versioning**: All outputs include `schema_version: 1`

### Commands

- `agent run` - Execute a task with full phase lifecycle
- `agent resume` - Resume a stopped run
- `agent status` - Show run status
- `agent report` - Generate run report
- `agent follow` - Tail run timeline in real-time
- `agent wait` - Block until run reaches terminal state
- `agent summarize` - Generate summary.json from run KPIs
- `agent compare` - Compare KPIs between two runs
- `agent doctor` - Check worker CLI availability
- `agent gc` - Clean up old worktree directories
- `agent paths` - Display canonical agent directory paths
- `agent metrics` - Show aggregated metrics across runs
- `agent version` - Show version information
- `agent orchestrate run` - Start multi-track orchestration
- `agent orchestrate resume` - Resume orchestration
- `agent orchestrate wait` - Wait for orchestration to complete

### Diagnostics

- **Auto-diagnose stop reasons**: 10 diagnostic rules with actionable guidance
- **Structured handoff artifacts**: `stop.json` and `stop.md` for stopped runs
- **Stop reason families**: guard, budget, verification, worker, stall, auth

### Testing

- **Golden scenario suite**: 6 deterministic integration tests
- **Mock worker modes**: delay, stall, timeout_once_then_ok, no_changes_no_evidence
- **Benchmark harness**: `scripts/bench.ts` with presets

### Documentation

- Full documentation in `docs/` directory
- TARGET_REPO_SETUP.md for using in other projects
- Worktree strategy documentation
- CLI reference

[Unreleased]: https://github.com/user/agent-runner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/user/agent-runner/releases/tag/v0.1.0
