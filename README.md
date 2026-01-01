# Runr

Phase-gated orchestration for agent tasks.

> **Status**: v0.3.0 — Renamed from `agent-runner`. Early, opinionated, evolving.

## The Problem

AI agents can write code. They can also:
- Claim success without verification
- Modify files they shouldn't touch
- Get stuck in infinite loops
- Fail in ways that are impossible to debug

**Runr doesn't make agents smarter. It makes them accountable.**

## What This Does

Runr orchestrates AI workers (Claude, Codex) through a phase-based workflow with hard gates:

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → done
         ↑___________|  (retry if needed)
```

Every phase has criteria. You don't advance without meeting them.

## Why Phase Gates?

Most agent tools optimize for speed. Runr optimizes for **trust**.

When a run fails (and it will), you get:
- **Structured diagnostics** — exactly why it stopped
- **Checkpoints** — resume from where it failed
- **Scope guards** — files it couldn't touch, it didn't touch
- **Evidence** — "done" means "proven done"

## Quick Start

```bash
# Install
git clone https://github.com/vonwao/runr.git
cd runr && npm install && npm run build && npm link

# Verify
runr version
runr doctor

# Run a task
cd /your/project
runr run --task .runr/tasks/my-task.md --worktree
```

> Not on npm yet. Coming soon as `@weldr/runr`.

## Configuration

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**"],
    "presets": ["vitest", "typescript"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  }
}
```

### Scope Presets

Don't write patterns by hand:

```json
{
  "scope": {
    "presets": ["nextjs", "vitest", "drizzle", "tailwind"]
  }
}
```

Available: `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

## CLI Reference

| Command | What it does |
|---------|--------------|
| `runr run --task <file>` | Start a task |
| `runr resume <id>` | Continue from checkpoint |
| `runr status [id]` | Show run state |
| `runr follow [id]` | Tail run progress |
| `runr report <id>` | Generate run report |
| `runr gc` | Clean up old runs |
| `runr doctor` | Check environment |

### The Fun Commands

Same functionality, different vibe:

```bash
runr summon --task task.md   # run
runr resurrect <id>          # resume
runr scry <id>               # status
runr banish                  # gc
```

## Task Files

Tasks are markdown files:

```markdown
# Add user authentication

## Goal
OAuth2 login with Google.

## Requirements
- Session management
- Protected routes
- Logout functionality

## Success Criteria
- Users can log in with Google
- Session persists across refreshes
```

## Stop Reasons

When Runr stops, it tells you why:

| Reason | What happened |
|--------|---------------|
| `complete` | Task finished. Ship it. |
| `verification_failed_max_retries` | Tests failed too many times |
| `guard_violation` | Touched files outside scope |
| `review_loop_detected` | Reviewer kept requesting same changes |
| `time_budget_exceeded` | Ran out of time |

Every stop produces `stop.json` + `stop.md` with diagnostics.

## Philosophy

**This is not magic.** Runs fail. The goal is *understandable, resumable* failure.

**This is not a chatbot.** Task in, code out. No conversation.

**This is not a code generator.** It orchestrates generators. Different job.

**Agents lie. Logs don't.** If it can't prove it, it didn't do it.

## Migrating from agent-runner

If you're upgrading from `agent-runner`:

| Old | New |
|-----|-----|
| `agent` CLI | `runr` CLI |
| `.agent/` directory | `.runr/` directory |
| `agent.config.json` | `runr.config.json` |
| `.agent-worktrees/` | `.runr-worktrees/` |

Both old and new locations work during the transition period. You'll see deprecation warnings for old locations.

## Development

```bash
npm run build    # compile
npm test         # run tests
npm run dev -- run --task task.md  # run from source
```

## Release History

| Version | Date | Highlights |
|---------|------|------------|
| v0.3.0 | 2026-01-01 | **Renamed to Runr**, new CLI, new directory structure |
| v0.2.2 | 2025-12-31 | Worktree location fix, guard diagnostics |
| v0.2.1 | 2025-12-29 | Scope presets, review digest |
| v0.2.0 | 2025-12-28 | Review loop detection |
| v0.1.0 | 2025-12-27 | Initial stable release |

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

Apache 2.0 — See [LICENSE](LICENSE)

---

<sub>Existence is pain, but shipping is relief.</sub>
