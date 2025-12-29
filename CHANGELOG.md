# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-12-29

Adoption improvements: scope presets, better diagnostics, and OSS packaging.

### Added

- **Scope presets**: Named pattern collections for popular frameworks
  - 11 presets: `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`
  - Use via `scope.presets: ["vitest", "nextjs"]` in config
  - Patterns merged into allowlist at config load time
  - Unknown presets warn but don't fail

- **Review digest artifact**: `review_digest.md` written when `review_loop_detected` stops a run
  - Contains milestone context, review round count, full list of requested changes
  - Makes debugging review loops much easier

- **Preset suggestions**: `plan_scope_violation` errors now suggest relevant presets
  - e.g., "Try adding presets: [vitest] to scope.presets"

### Documentation

- **README.md**: Quick start, configuration, CLI reference, stop reasons
- **LICENSE**: Apache 2.0 license
- **CONTRIBUTING.md**: Development workflow, code style, PR process, architecture overview
- **docs/PILOT_PROGRAM.md**: Early adopter onboarding guide

### Improved

- Stop memo now includes descriptions and tips for `review_loop_detected` and `plan_scope_violation`

## [0.2.0] - 2025-12-28

Resilience improvements based on dogfooding feedback.

### Added

- **Review loop detection**: Prevents infinite IMPLEMENT→REVIEW cycles
  - `max_review_rounds` config option (default: 2)
  - Fingerprint-based detection for identical consecutive `request_changes`
  - New stop reason: `review_loop_detected`
  - Timeline event with diagnostic payload

### Fixed

- **ESM compatibility**: `agent orchestrate wait` no longer crashes under ESM / Node 22
  - Replaced `require()` with proper ESM import

- **State sync**: Removed dead `'DONE'` phase check in orchestrator reconciliation

### Testing

- **Golden scenario 07**: `07-review-loop-detected` validates review loop detection
- **Mock worker**: New `review_always_request_changes` mode for testing

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

[Unreleased]: https://github.com/user/agent-runner/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/user/agent-runner/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/user/agent-runner/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/user/agent-runner/releases/tag/v0.1.0
