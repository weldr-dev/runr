Status: Implemented
Source: src/types/schemas.ts, src/supervisor/runner.ts

# Glossary

This glossary explains key terms used throughout the documentation. Terms are organized from foundational concepts to more specific implementation details.

---

## Core Concepts

### Run
A single supervised execution session. When you execute `runr run --task mytask.md`, that creates one "run" with:
- A unique **run ID** (timestamp like `20231215143022`)
- A **run store** on disk (`.runr/runs/<run_id>/`)
- Optionally, a **branch** in the target repo (`runr/<run_id>/<slug>`)

Think of a run as a complete audit trail of one task execution attempt.

### Milestone
A planned unit of work that can be implemented and verified independently. The planner breaks your task into 3-7 milestones, each with:
- **Goal**: What this milestone delivers (one sentence)
- **Done checks**: How to verify it's complete (2-5 acceptance criteria)
- **Files expected**: Which files will be created/modified
- **Risk level**: How risky this change is (affects verification)

Example: "Add input validation to login form" with done checks like "Shows error for invalid email format."

### Phase
One step in the supervisor's execution loop. The system progresses through phases:

```
INIT → PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
```

Each phase does one job:
- **PLAN**: Generate milestones from the task
- **IMPLEMENT**: Make code changes for current milestone
- **VERIFY**: Run tests and checks
- **REVIEW**: Evaluate if changes meet the goal
- **CHECKPOINT**: Commit changes to git
- **FINALIZE**: Write summary and complete the run

### Worker
An external LLM CLI that does actual work. Currently supported:
- **Claude**: Used for planning and review (strategic thinking)
- **Codex**: Used for implementation (code changes)

Workers are configured in `runr.config.json` and invoked by the supervisor.

---

## Safety and Verification

### Guard
A safety check that prevents unsafe operations. Guards run at two points:
1. **Preflight**: Before any work starts (checks dirty worktree)
2. **Post-implement**: After code changes (checks scope and lockfiles)

If a guard fails, the run stops immediately with a clear explanation.

### Scope Lock
The frozen set of file patterns that define what the agent can and cannot touch. Captured at run start from your config:
- **Allowlist**: Patterns the agent CAN modify (e.g., `src/**`, `tests/**`)
- **Denylist**: Patterns the agent must NEVER touch (e.g., `infra/**`, `.env`)

The scope lock prevents "scope creep" where the agent starts modifying files outside its mandate.

### Tier (Verification Tier)
A level of testing rigor. Higher tiers = more thorough but slower:

| Tier | When it runs | Typical commands | Speed |
|------|--------------|------------------|-------|
| tier0 | Every milestone | Lint, typecheck | Seconds |
| tier1 | Risk triggered | Unit tests | Minutes |
| tier2 | End of run | Full test suite | Slow |

This lets you get fast feedback most of the time while still catching issues.

### Risk Level
A milestone property that affects how much verification runs:
- **low**: Only tier0 verification (simple, safe changes)
- **medium**: Only tier0 verification (default)
- **high**: tier0 + tier1 verification (complex or critical changes)

### Risk Trigger
A rule that escalates verification when certain files change. Configured as glob patterns:
```json
{ "name": "deps", "patterns": ["package.json"], "tier": "tier1" }
```
This means: "If package.json changes, run tier1 tests even if risk_level is low."

---

## Execution Flow

### Tick
A single phase transition. When you run with `--max-ticks 10`, the supervisor will execute up to 10 phase transitions before stopping.

Example flow (4 ticks):
1. INIT → PLAN (tick 1)
2. PLAN → IMPLEMENT (tick 2)
3. IMPLEMENT → VERIFY (tick 3)
4. VERIFY → REVIEW (tick 4)

### Block Protocol
A structured format workers use when they can't complete a task:

```
## What broke
<The specific error or issue>

## Hypothesis A / B
<Two theories about the cause>

## Experiment
<What was tried to diagnose>

## Decision
<Which hypothesis was correct>

## Next action
<What should happen next>
```

This ensures blocks are actionable, not just "it didn't work."

### Fix Instructions
When verification fails, the implementer gets another chance. Fix instructions tell it:
- Which command failed
- What the error output was
- Which files it changed
- How many retries remain (max 3)

This enables targeted fixes instead of blind retrying.

---

## Persistence and Observability

### Run Store
The directory where all run data lives: `.runr/runs/<run_id>/`. Contains:
- `state.json` - Current phase, progress, errors
- `timeline.jsonl` - Event log with timestamps
- `plan.md` - The milestone plan
- `handoffs/*.md` - Worker memos
- `artifacts/*.log` - Test output

Everything needed to understand what happened.

### Timeline
The append-only event log (`timeline.jsonl`). Every significant event is recorded:
- Phase transitions
- Worker invocations
- Verification results
- Errors and stops

Each line is JSON with `seq` (sequence number), `timestamp`, `type`, `source`, and `payload`.

### Checkpoint
A git commit created after a milestone is verified and approved. The commit message follows a standard format:
```
chore(agent): checkpoint milestone 1
```

Checkpoints let you see incremental progress and roll back if needed.

### Handoff Memo
A markdown note from a worker explaining what it did. Types:
- **Implementer handoff**: What was changed and why
- **Reviewer feedback**: What needs fixing (if any)
- **Stop memo**: Why the run stopped and what to do next

### Stop Memo
A special handoff written when a run stops (successfully or not). Located at `handoffs/stop.md`. Contains:
- What's done
- What's broken
- Best next step
- Risk notes
- Where to look

This is your "when you come back" briefing.

---

## Environment and Resume

### Environment Fingerprint
A snapshot of your execution environment saved at run start:
- Node.js version
- Lockfile hash
- Worker CLI versions

When you resume, the system compares the current environment to this fingerprint. Mismatches (like different Node versions) can cause subtle bugs, so resume is blocked unless you use `--force`.

### Worker Stats
Counters tracking worker usage:
```json
{
  "claude": 3,
  "codex": 2,
  "by_phase": {
    "plan": { "claude": 1, "codex": 0 },
    "implement": { "claude": 0, "codex": 2 },
    "review": { "claude": 2, "codex": 0 }
  }
}
```

Useful for understanding cost and debugging worker issues.

---

## Advanced

### Boot Chain
The critical files that make the agent work. If these break, the tool can't run:
- `src/cli.ts` - Entry point
- `src/supervisor/runner.ts` - Phase logic
- `src/store/run-store.ts` - Persistence
- etc.

When using the agent to modify itself ("self-hosting"), these files should be in the denylist. See [Self-Hosting Safety](self-hosting-safety.md).

---

## See Also

- [Vision](vision.md) - Why this system exists
- [Mental Model](mental-model.md) - How to think about runs
- [Configuration](configuration.md) - Setting up scope and verification
