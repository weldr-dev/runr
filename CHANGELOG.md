# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.3] - 2026-01-08

**Documentation Consistency** - Complete rebrand cleanup.

### Fixed

- Complete documentation rebrand from `agent` → `runr` commands
- Updated all path references from `.agent/` → `.runr/`
- Fixed worktree path references (`.agent-worktrees/` → `.runr-worktrees/`)
- Updated config file references (`agent.config.json` → `runr.config.json`)
- Rebranded "Agent Framework" → "Runr" throughout docs

### Added

- Documentation for v0.7.x features in MIGRATION.md (modes, hooks, demo)
- Missing CLI commands in docs/cli.md (`--demo`, `continue`, `meta`, `watch`)
- Documentation audit document (docs/DOCS_AUDIT.md)

## [0.7.2] - 2026-01-07

**Rails-energy UX refresh** - 2-minute try-it flow.

### Added

- `runr init --demo` flag for self-contained TypeScript demo project
- Demo includes 3 graduated tasks (success, fix-loop, scope-violation)
- Built-in verification with TypeScript and Vitest

## [0.7.1] - 2026-01-06

**Sprint Complete** - Git hooks and mode-aware commit checking.

### Added

- Git hooks mechanism with `runr hooks install`
- Mode-aware commit check behavior (flow vs ledger)
- Orchestration receipt (manager dashboard)
- Stop footer with clear next steps

## [0.7.0] - 2026-01-06

**Hybrid Workflow Foundation** - Productivity + Auditability together.

### Added

- **runr intervene** - Record manual work with provenance
  - SHA anchoring with `--since` for retroactive attribution
  - Commit linking with `--commit` and `--amend-last`
  - Command output capture with redaction
  - Flow/Ledger mode awareness

- **runr audit** - View project history by classification
  - Classifications: CHECKPOINT, INTERVENTION, INFERRED, ATTRIBUTED, GAP
  - Coverage reporting with `--coverage`
  - CI thresholds with `--fail-under` and `--fail-under-with-inferred`
  - Strict mode with `--strict`

- **runr mode** - Switch between Flow and Ledger modes
  - Flow mode: productivity-first, flexible interventions
  - Ledger mode: audit-first, stricter controls

- **Redaction** - Automatic secret removal from receipts
  - Detects tokens, API keys, passwords, credentials
  - Pattern-based with configurable behavior

- **Review Loop Diagnostics** - Actionable guidance when runs stop
  - Explains why review loops were detected
  - Suggests specific fixes based on timeline analysis
  - Identifies unmet verification requirements

- **Inferred Attribution** - Reduce audit gaps automatically
  - Commits within intervention SHA ranges classified as inferred
  - Both explicit and inferred coverage tracked

### Changed

- Intervention receipts now include SHA anchors (base_sha, head_sha)
- Audit shows dual coverage: explicit vs with-inferred
- Config schema extended for receipts and workflow mode

### Documentation

- New: Hybrid Workflow Guide (`docs/hybrid-workflow-guide.md`)
- New: Intervention Patterns (`docs/examples/intervention-patterns.md`)

## [0.6.0] - 2026-01-06

**Meta-Agent UX Sprint** — Smoother onboarding and smarter defaults.

### Added

- **Runr Meta-Agent**: Built-in `runr meta` helper for agent workflow guidance
- **Claude Auto-Setup**: `--with-claude` flag wires CLAUDE.md scaffolding during init
- **Claude Templates**: `.claude/` template library for repeatable agent prompts
- **Enhanced Doctor**: Deeper diagnostics and clearer remediation in `runr doctor`

## [0.5.0] - 2026-01-05

**Solo Workflow** — Effortless dev→main checkpoints with automated safety.

### Added

- **Workflow System**: Three profiles (solo/pr/trunk) with bundle→submit integration
  - `runr bundle <run_id>` — Generate deterministic markdown evidence packet
  - `runr submit <run_id> --to <branch>` — Cherry-pick verified checkpoint to target branch
  - Submit validation: clean tree, terminal state, verification evidence required
  - Conflict handling: clean abort with diagnostic timeline event
  - `--dry-run` mode for safe preview before integration

- **Workflow Packs**: One-command scaffolding for complete workflow setup
  - `runr init --pack solo` — Dev branch workflow (dev → main, no PR)
  - `runr init --pack trunk` — Trunk-based development (main only)
  - `runr init --pack pr` — Pull request workflow (feature → main via PR)
  - `runr packs` — List available packs
  - Auto-generated `AGENTS.md` and `CLAUDE.md` with workflow-specific guidance
  - Pack templates with variable substitution (project name, verification commands, branches)

- **Auto .gitignore Setup**: Packs automatically add runtime artifact entries
  - `.runr/runs/` (runtime state)
  - `.runr-worktrees/` (isolated worktrees)
  - `.runr/orchestrations/` (orchestration artifacts)
  - Keeps `.runr/runr.config.json` and `.runr/tasks/*.md` tracked

- **Meta-Agent Safety Contract**: Behavioral guardrails for agents driving Runr
  - Rule 1: Never delete on dirty tree
  - Rule 2: Never delete outside `.runr/` without explicit file list
  - Rule 3: Must end with bundle + dry-run
  - Embedded in pack templates (`CLAUDE.md`)

- **90-Second Demo**: `dogfood/hello-world/` minimal example
  - Complete walkthrough in README
  - Shows full workflow: init → run → bundle → submit
  - Pre-initialized with solo pack

### Documentation

- **Solo Workflow Example**: Canonical copy-paste reference ([docs/examples/solo-workflow.md](docs/examples/solo-workflow.md))
  - Complete 6-step workflow loop
  - Meta-agent integration patterns (Mode A/B)
  - .gitignore policy explained
  - Troubleshooting section
  - Quick reference card

- **Comprehensive Documentation Overhaul**:
  - [Workflow Guide](docs/workflow-guide.md) — Bundle/submit/integration workflows
  - [Packs User Guide](docs/packs-user-guide.md) — Choosing and using packs
  - [Safety Guide](docs/safety-guide.md) — All guard mechanisms documented
  - Updated [CLI Reference](docs/cli.md) with bundle/submit/packs commands
  - Updated [Configuration](docs/configuration.md) with workflow config section

### Changed

- `runr init` with pack now creates workflow-ready project instead of minimal config
- Pack templates replace legacy example task files
- README.md now features 90-second demo and solo workflow reference

### Fixed

- Documentation gaps: bundle/submit/packs were shipped but undocumented
- Legacy `.agent/` references throughout documentation
- Missing .gitignore guidance caused confusion about what to commit

## [0.4.0] - 2026-01-03

**Case Files** — Every run leaves a machine-readable journal.

### Added

- **Case Files**: Auto-generated `journal.md` + `journal.json` for every run
  - Schema v1.0 with immutable facts (timestamps, milestones, verification attempts)
  - Living data (append-only notes)
  - Secret redaction in error excerpts
  - Warnings array captures all extraction issues
- **CLI Commands**:
  - `runr journal [run_id]` — Generate and display journal (defaults to latest)
  - `runr note <message> [--run-id]` — Add timestamped note (defaults to latest)
  - `runr open [run_id]` — Open journal in $EDITOR (defaults to latest)
- **Auto-generation**: Journals written on run completion (stop or finish)
- **Non-interactive safety**: `runr open` fails cleanly in CI or when $EDITOR unset

### Fixed

- **Package bloat**: Excluded test files from npm package (81 → 69 files)
- **Deprecation warnings**: Replaced deprecated `getRunsRoot()` with `getRunrPaths().runs_dir`

## [0.3.0] - 2026-01-01

**Renamed to Runr.** New identity, same reliability-first mission.

### Changed

- **Package renamed**: `agent-runner` → `@weldr/runr`
- **CLI renamed**: `agent` → `runr`
- **Directory renamed**: `.agent/` → `.runr/` (old location still works with deprecation warning)
- **Config renamed**: `agent.config.json` → `runr.config.json` (old name still works)
- **Worktrees renamed**: `.agent-worktrees/` → `.runr-worktrees/`
- **Env var renamed**: `AGENT_WORKTREES_DIR` → `RUNR_WORKTREES_DIR` (old var still works)

### Added

- **Fun CLI aliases**: `summon` (run), `resurrect` (resume), `scry` (status), `banish` (gc)
- **Deprecation warnings**: Clear messages when using old paths/names
- **Backwards compatibility**: Old locations and names work during transition period

### Migration

Both old and new paths are supported. To migrate:

1. Rename `.agent/` to `.runr/`
2. Rename `agent.config.json` to `runr.config.json`
3. Use `runr` instead of `agent` CLI

### Fixed

- **Guard violation diagnostics**: `stop.md` now includes specific files that caused the violation
  - Scope violations list the exact files modified outside allowlist
  - Lockfile violations list which lockfiles were changed
  - Error message includes up to 5 file names for quick diagnosis

## [0.2.2] - 2025-12-31

Reliability release: fixes the worktree/denylist catch-22 that caused `implement_blocked` failures.

### Fixed

- **Worktrees moved out of `.agent/`**: Worktrees now created at `.agent-worktrees/<runId>/` instead of `.agent/worktrees/<runId>/`
  - Prevents catch-22 where denylist patterns like `.agent/**` blocked worker operations
  - Workers no longer see `.agent` in their absolute CWD path
  - Override location with `AGENT_WORKTREES_DIR` env var
  - GC command updated to scan both new and legacy locations

- **Auto-inject git excludes for agent artifacts**: `.agent/` and `.agent-worktrees/` now auto-added to `.git/info/exclude` at run start
  - Fresh repos no longer need manual `.gitignore` entries for agent artifacts
  - Prevents "dirty worktree" guard failures on first run

- **Guard failure diagnostics**: Full guard failure details now printed to console (not just `guard=fail`)
  - Shows exact reasons, scope violations, lockfile violations, dirty files
  - Makes debugging guard failures actionable

- **Built-in env_allowlist for agent artifacts**: `.agent/**` and `.agent-worktrees/**` now always treated as env noise
  - Agent artifacts never trigger scope violations or dirty worktree errors
  - Belt-and-suspenders with git exclude injection

- **Worktree exclude injection**: Fixed `node_modules` symlinks appearing as untracked files in worktrees
  - Git only reads `.git/info/exclude` from the main repo, not worktree gitdirs
  - Now writes exclude patterns to main repo's `.git/info/exclude`
  - Prevents "worktree became dirty after env setup" errors

- **Tier escalation at final milestone**: `is_milestone_end` and `is_run_end` now correctly trigger at the last milestone
  - Previously hardcoded to `false`, preventing tier1/tier2 from running
  - Final milestone now runs all verification tiers (tier0 + tier1 + tier2)
  - Fixes review loops caused by reviewer expecting `npm test` but verifier only running `npm run build`

### Added

- **Legacy worktree warning**: Warns on startup if old worktree locations are detected
  - Helps users clean up after upgrade
  - Points to `agent gc` for cleanup

- **Implementer prompt scope clarification**: Added note that scope patterns are repo-relative, not absolute paths
  - Prevents worker confusion when CWD contains `.agent` substrings

- **Task ownership enforcement (Phase-2)**: Tasks with `owns:` frontmatter now enforce ownership at IMPLEMENT time
  - Defensive normalization via shared `src/ownership/normalize.ts` module
  - Renames count as touching both old and new paths (conservative rule)
  - `ownership_violation` stop reason with actionable error message

### Testing

- **Acceptance tests for worktree fixes**: 9 tests covering auto-exclude, worktree location, and guard diagnostics
  - Run with `npx vitest run test/acceptance/worktree-fixes.test.ts`

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

[Unreleased]: https://github.com/vonwao/runr/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/vonwao/runr/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/vonwao/runr/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vonwao/runr/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/vonwao/runr/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/vonwao/runr/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/vonwao/runr/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/vonwao/runr/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vonwao/runr/releases/tag/v0.1.0
