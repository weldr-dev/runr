# Runr Demo Guide

This guide shows how to set up and run the Runr demo. Follow these exact steps to see Runr's key features.

## Prerequisites

- Node.js 18+
- npm
- Runr installed (`npm install -g @weldr/runr`)

## Setup (2 minutes)

Create a demo project:

```bash
mkdir runr-demo && cd runr-demo
runr init --demo
npm install
```

This creates a minimal project with:
- `src/math.ts` - Simple math functions
- `tests/math.test.ts` - Tests with an **intentional failing test**
- `.runr/tasks/` - Three demo tasks
- Pre-configured verification and scope guards

## Demo 1: Happy Path (Success)

**Goal:** Show a successful agent run creating a checkpoint.

```bash
runr run --task .runr/tasks/00-success.md
```

**Expected output:**
```
RUNNING: <run_id>
Phase: IMPLEMENT → REVIEW → VERIFY
Verification: PASSED
CHECKPOINT: <checkpoint_hash>
```

**What happened:**
- Agent implemented `multiply` function
- Tests passed
- Checkpoint created with verified changes

Check the results:
```bash
runr report latest
```

---

## Demo 2: Auto-Fix (The "Wow" Moment)

**Goal:** Show Runr detecting a failure and offering safe fix commands.

This task asks the agent to "fix the tests" - but the test expects wrong output (`999` instead of `5`).

```bash
runr run --task .runr/tasks/01-fix-failing-test.md
```

**Expected output:**
```
RUNNING: <run_id>
Phase: IMPLEMENT → REVIEW → VERIFY
Verification: FAILED
STOPPED (verification_failed)
```

Now check the front door:
```bash
runr
```

**Expected output:**
```
○ STOPPED (auto-fix available)

STOPPED (verification_failed) - auto-fix available
Task: .runr/tasks/01-fix-failing-test.md
Mode: flow | Tree: clean

Next:
  1) runr continue
     # Run suggested fixes, then resume
  2) runr report <run_id>
     # See what happened
  3) runr intervene <run_id> --reason verification_failed --note "..."
     # Record manual work
```

The key insight: **Runr found safe commands to run.** Use continue:

```bash
runr continue
```

**Expected output:**
```
Auto-fixing run <run_id>...
Running 1 command(s):

Running: npm test
  OK (XXXms)

Auto-fix complete. Resuming...
```

Runr ran `npm test` to verify the fix, then resumed the agent.

Check the results:
```bash
runr report latest
```

---

## Demo 3: Scope Guard (Safety)

**Goal:** Show Runr blocking unsafe file modifications.

This task asks the agent to modify README.md, which is protected by the denylist.

```bash
runr run --task .runr/tasks/02-scope-violation.md
```

**Expected output:**
```
RUNNING: <run_id>
Phase: IMPLEMENT
STOPPED (guard_violation)
```

Check the front door:
```bash
runr
```

**Expected output:**
```
○ STOPPED (manual needed)

STOPPED (guard_violation) - manual intervention needed
Task: .runr/tasks/02-scope-violation.md
Mode: flow | Tree: clean

Next:
  1) runr report <run_id>
     # Understand what went wrong
  2) runr intervene <run_id> --reason guard_violation --note "..."
     # Record manual fix and continue
  3) runr resume <run_id>
     # Retry without fixing (may fail again)
```

**Key insight:** No `--force` option appears. Scope violations cannot be bypassed - this is the safety layer working correctly.

Check the guard details:
```bash
runr report latest
```

---

## The Three Actions

Every Runr stop gives you exactly 3 next actions:

| Action | Command | When to use |
|--------|---------|-------------|
| **Continue** | `runr continue` | Auto-fix is available |
| **Report** | `runr report <id>` | Always available - see what happened |
| **Intervene** | `runr intervene <id>` | Manual fix needed, record it for provenance |

The first action is always the recommended path forward.

---

## Key Invariants Demonstrated

1. **Every stop has a headline** - Clear status like "STOPPED (verification_failed)"
2. **Every headline maps to a fix** - Actions are contextual to the stop reason
3. **Exactly 3 actions** - Never more, never less
4. **Safe commands only** - Only allowlisted commands run automatically
5. **Scope is sacred** - No force flag bypasses file guards

---

## Cleanup

```bash
cd ..
rm -rf runr-demo
```

## Next Steps

- Read the [full documentation](./docs/)
- Create your own tasks in `.runr/tasks/`
- Configure verification tiers in `.runr/runr.config.json`
