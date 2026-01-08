# How It Works

*A technical explanation of Runr for developers.*

> Want a simpler explanation? See [Overview](overview.md).

---

## Core Idea

Runr is an **orchestrator** that coordinates LLM workers (Claude, Codex) through a supervised, phase-based workflow. It doesn't generate code itself—it manages the process of generating, verifying, and committing code changes.

The key insight: **reliability comes from structure, not from smarter models**.

By breaking work into milestones, enforcing scope constraints, and requiring verification at each step, runs become predictable and recoverable even when individual LLM calls fail.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Supervisor                        │
│  (state machine, phase handlers, stop conditions)   │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐
   │ Planner │  │Implementer│  │ Reviewer │
   │ (Claude)│  │ (Claude) │  │ (Claude) │
   └─────────┘  └──────────┘  └──────────┘
```

The supervisor runs a loop:
1. Read current state
2. Execute the handler for the current phase
3. Persist updated state
4. Check stop conditions
5. Repeat

---

## Phase Lifecycle

```
INIT → PLAN → MILESTONE_START → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
                    ↑                                           │
                    └────────────── (next milestone) ───────────┘
```

| Phase | What Happens |
|-------|--------------|
| **INIT** | Create run directory, capture environment fingerprint |
| **PLAN** | LLM generates milestones from task description |
| **MILESTONE_START** | Begin work on next milestone |
| **IMPLEMENT** | LLM makes code changes for current milestone |
| **VERIFY** | Run configured commands (lint, typecheck, tests) |
| **REVIEW** | LLM evaluates diff against milestone goals |
| **CHECKPOINT** | Git commit, advance to next milestone |
| **FINALIZE** | Write summary, mark run complete |

If verification fails, the implementer gets another attempt with the error output. After 3 failures, the run stops with a diagnostic.

---

## Key Mechanisms

### 1. Scope Guards

Every run has a **scope lock**—frozen allowlist/denylist patterns captured at run start.

```json
{
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["src/config/secrets.ts"],
    "presets": ["typescript", "vitest"]
  }
}
```

If the planner proposes files outside the allowlist, the run stops with `plan_scope_violation`. If the implementer modifies forbidden files, the run stops with `guard_violation`.

This prevents scope creep—the agent can't "helpfully" refactor your auth system when you asked it to fix a typo.

### 2. Verification Tiers

Not all changes need the same level of testing:

| Tier | When | Typical Commands |
|------|------|------------------|
| **tier0** | Every milestone | Lint, typecheck |
| **tier1** | Risk triggers match | Unit tests, build |
| **tier2** | End of run | Full test suite |

Risk triggers let you escalate verification for sensitive files:

```json
{
  "risk_triggers": [
    { "name": "auth", "patterns": ["src/auth/**"], "tier": "tier1" }
  ]
}
```

### 3. Checkpointing

After each milestone passes review, the agent creates a git commit:

```
chore(agent): checkpoint milestone 1 - Add input validation
```

If a later milestone fails, you have atomic commits to inspect or revert. If the run crashes, `agent resume` continues from the last checkpoint.

### 4. Review Loop Detection

Sometimes the reviewer keeps requesting the same changes and the implementer can't satisfy them. This creates an infinite IMPLEMENT → REVIEW → IMPLEMENT loop.

The agent tracks review fingerprints. If the same `request_changes` feedback appears twice in a row, it stops with `review_loop_detected` and writes a diagnostic.

### 5. Worktree Isolation

With `--worktree`, each run operates in its own git worktree:

```
.runr-worktrees/<run_id>/
```

This means:
- Your working directory stays clean
- Multiple runs can execute in parallel (on different tasks)
- Failed runs don't leave uncommitted changes in your repo

---

## State and Persistence

All run state lives in `.runr/runs/<run_id>/`:

```
.runr/runs/<run_id>/
├── state.json           # Current phase, milestone index, errors
├── timeline.jsonl       # Append-only event log
├── plan.md              # Generated milestones
├── config.snapshot.json # Config at run start
├── env.fingerprint.json # Node version, lockfile hash, worker versions
├── handoffs/
│   ├── implement.md     # Implementer notes
│   ├── review.md        # Reviewer feedback
│   └── stop.md          # Why the run stopped
└── artifacts/
    └── tests_tier0.log  # Verification output
```

The `timeline.jsonl` is the source of truth for debugging. Every phase transition, worker call, and verification attempt is logged with timestamps.

---

## Stop Conditions

Runs stop for explicit reasons:

| Reason | Meaning |
|--------|---------|
| `complete` | All milestones finished |
| `plan_scope_violation` | Planner proposed out-of-scope files |
| `guard_violation` | Implementer touched forbidden files |
| `verification_failed_max_retries` | Tests failed 3 times |
| `review_loop_detected` | Reviewer stuck in a loop |
| `time_budget_exceeded` | Ran out of time |
| `max_ticks_reached` | Too many phase transitions |

Each stop writes a `stop.md` with diagnostics and suggested next steps.

---

## When to Use This

**Good fit:**
- Multi-file changes that need verification
- Tasks you'd want to review before merging
- Projects with existing tests/linting
- Long-running tasks where resumability matters

**Not a good fit:**
- Quick one-liner fixes (just use the LLM directly)
- Exploratory "figure out what to build" work
- Projects without any verification commands

---

## Trade-offs

| Benefit | Cost |
|---------|------|
| Structured, auditable runs | More setup than raw LLM calls |
| Resumable from failures | Slower than "just run it" |
| Scope protection | Must configure allowlists |
| Verification gates | Requires working test/lint commands |

The framework optimizes for **reliability over speed**. If you want fast, unverified code generation, use the LLM directly.

---

## Next Steps

- [Quickstart](quickstart.md) - Get running in 5 minutes
- [Configuration](configuration.md) - Full config schema
- [Architecture](architecture.md) - Deep dive into internals
- [Run Lifecycle](run-lifecycle.md) - Phase flow details
