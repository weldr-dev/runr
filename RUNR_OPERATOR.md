# Runr Operator Guide (for Meta-Agents)

**Version:** 1.0
**Target:** Claude Code, Codex CLI, and other coding agents

## What Is Runr?

Runr is a **phase-gated execution layer** for coding tasks. It orchestrates AI workers (you!) through a structured workflow with verification gates, checkpoints, and scope guards.

Think of it as a safety harness. You do the coding — Runr prevents guard violations, enforces verification, and creates resumable checkpoints.

---

## When to Use Runr

Use Runr when the user asks for:

- **Multi-step features** that span multiple files/phases
- **Risky changes** in unfamiliar codebases
- **Tasks requiring verification** (tests, builds, type checks)
- **Resumable work** ("try this, if it fails we'll debug")
- Tasks where they explicitly mention "checkpoint", "safety", "verify", or "use runr"

**Don't use Runr for:**
- Single-file tweaks or trivial changes
- Exploratory work ("show me X", "explain Y")
- Tasks the user wants you to do directly

---

## How Runr Works (Mental Model)

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → (next milestone)
         ↑___________|  (retry if tests fail)
```

**You control:** planning, implementation, fixes
**Runr controls:** verification gates, scope enforcement, checkpoints
**Your job:** execute phases, interpret results, resume on failures

---

## Command Reference

### 0. Initialize Configuration (First Time Setup)

```bash
runr init
```

**What it does:**
- Auto-detects verification commands from package.json (or pyproject.toml for Python)
- Detects project presets from dependencies (typescript, vitest, pytest, etc.)
- Creates `.runr/runr.config.json` with intelligent defaults
- Creates example task files in `.runr/tasks/`

**Flags:**
- `--print`: Preview generated config without writing files
- `--force`: Overwrite existing config
- `--interactive`: Launch setup wizard (stub - shows coming soon message)

**Use when:**
- First time setting up Runr in a project
- Want to regenerate config after major dependency changes

---

### 1. Start a Run

```bash
runr run --task <path-to-task-file> --worktree --json
```

**What it does:**
- Creates isolated git worktree (safe sandbox)
- Outputs run_id immediately (you'll need this)
- Starts phase-gated execution

**Output (JSON):**
```json
{
  "run_id": "20260102143052",
  "run_dir": "/path/.runr/runs/20260102143052",
  "repo_root": "/path/repo",
  "status": "started"
}
```

**You must:**
- Capture the `run_id` from output
- Save it for status checks and resume operations

**Flags:**
- `--worktree`: Creates isolated sandbox (recommended)
- `--fast`: Skips PLAN/REVIEW phases for simple tasks
- `--json`: Machine-readable output (always use this)

---

### 2. Check Status

```bash
runr status <run_id>
```

**What it does:**
- Returns full run state as JSON
- Shows current phase, milestone progress, stop reason

**Output (example):**
```json
{
  "phase": "VERIFY",
  "milestone_index": 1,
  "milestones": [
    {"id": "m1", "status": "complete", ...},
    {"id": "m2", "status": "in_progress", ...}
  ],
  "stop_reason": null,
  "verification_failures": 2
}
```

**Key fields:**
- `phase`: Current phase (PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT, STOPPED)
- `stop_reason`: Why it stopped (null if still running)
- `milestone_index`: Current milestone (0-indexed)
- `verification_failures`: Retry count for current milestone

---

### 3. Resume from Checkpoint

```bash
runr resume <run_id>
```

**What it does:**
- Continues from last checkpoint
- Retries failed verification
- Uses same config/scope as original run

**When to use:**
- Run stopped with `verification_failed_max_retries`
- User says "try again" or "resume"
- Transient failures (network, rate limits)

---

### 4. Watch with Auto-Resume (Autopilot Mode)

```bash
runr watch <run_id> --auto-resume
```

**What it does:**
- Polls run status every 5 seconds
- Automatically resumes on transient failures (verification failures, timeouts, stalls)
- Never auto-resumes on guard violations or scope violations (safety-first)
- Cooldown period (10s) between resume attempts
- Stops after max attempts (default: 3)

**Flags:**
- `--auto-resume`: Enable automatic resume on failures
- `--max-attempts <N>`: Maximum auto-resume attempts (default: 3)
- `--json`: Output JSON event stream

**Resumable stop reasons:**
- `verification_failed_max_retries`
- `stalled_timeout`
- `max_ticks_reached`
- `time_budget_exceeded`
- `implement_blocked`

**Non-resumable (surfaces to user):**
- `guard_violation`
- `plan_scope_violation`
- `ownership_violation`
- `review_loop_detected`
- `parallel_file_collision`

**Use when:**
- Want hands-off execution with auto-retry
- Running long tasks that might hit transient failures
- Building CI/CD automation around Runr

---

### 5. Monitor Progress (Optional)

```bash
# Tail live updates
runr follow <run_id>

# Block until completion (best for automation)
runr wait <run_id> --for terminal --json
```

**`wait` output:**
```json
{
  "run_id": "20260102143052",
  "phase": "STOPPED",
  "stop_reason": "complete",
  "milestones_completed": 3
}
```

---

### 6. Get Final Report

```bash
# Human-readable report
runr report <run_id> --kpi-only

# Machine-readable JSON (includes next_action)
runr report <run_id> --json
```

**What it does:**
- Shows KPIs (duration, phase timings, verification attempts)
- Shows stop reason and diagnostics
- Shows which milestones completed
- **With --json**: Includes `next_action` and `suggested_command` for decision-making

**JSON output example:**
```json
{
  "version": 1,
  "run_id": "20260102075326",
  "phase": "STOPPED",
  "checkpoint_sha": "5c98ffa8828132be857644af3d5e7105be08bf6b",
  "total_duration_ms": 844383,
  "started_at": "2026-01-02T07:53:35.022Z",
  "ended_at": "2026-01-02T08:07:39.405Z",
  "phases": {
    "PLAN": { "duration_ms": 34574, "count": 1 },
    "IMPLEMENT": { "duration_ms": 745861, "count": 7 },
    "VERIFY": { "duration_ms": 41705, "count": 7 },
    "REVIEW": { "duration_ms": 22024, "count": 3 },
    "CHECKPOINT": { "duration_ms": 192, "count": 3 }
  },
  "verify": {
    "attempts": 11,
    "retries": 0,
    "total_duration_ms": 41562
  },
  "milestones": {
    "completed": 3,
    "total": 4
  },
  "outcome": "stopped",
  "stop_reason": "verification_failed_max_retries",
  "next_action": "resume",
  "suggested_command": "runr resume <run_id>"
}
```

**Key fields for agents:**
- `run_id`: Run identifier
- `phase`: Current phase (STOPPED, PLAN, IMPLEMENT, etc.)
- `checkpoint_sha`: Git commit SHA of last successful checkpoint
- `milestones.total`: Total milestones in plan
- `milestones.completed`: How many checkpoints created
- `outcome`: `complete`, `stopped`, `running`, or `unknown`
- `stop_reason`: Why it stopped (null if running/complete)
- `next_action`: What to do next - `none`, `resume`, `fix_config`, `resolve_scope_violation`, `resolve_branch_mismatch`, `inspect_logs`
- `suggested_command`: Pre-filled command to execute

**Use for:**
- Summarizing results to user
- Debugging why a run failed
- **Automated decision-making**: Use `next_action` to determine what to do without guessing

---

### 7. Health Check

```bash
runr doctor
```

**What it does:**
- Verifies Claude/Codex CLI are available
- Checks headless mode configuration
- Reports environment issues

**Use before first run** to catch setup problems.

---

## Typical Workflow

### Starting a Run

1. User asks for a task (e.g., "Add user authentication")
2. You create a task file `.runr/tasks/add-auth.md` with:
   ```markdown
   # Add User Authentication

   ## Goal
   Implement OAuth2 login with Google

   ## Requirements
   - Session management
   - Protected routes
   - Logout functionality

   ## Success Criteria
   - Users can log in with Google
   - Sessions persist across refreshes
   - Tests pass
   ```

3. Run it:
   ```bash
   runr run --task .runr/tasks/add-auth.md --worktree --json
   ```

4. Capture run_id from output:
   ```
   run_id=20260102143052
   ```

5. Report to user:
   ```
   Started run 20260102143052. Runr is executing the task in an isolated worktree.
   I'll monitor progress and report back when it completes or needs attention.
   ```

---

### Monitoring and Resume

6. Check status periodically:
   ```bash
   runr status 20260102143052
   ```

7. **If it completes** (`stop_reason: "complete"`):
   ```
   Task completed! Runr verified all tests pass. Changes are in branch runr/20260102143052.
   ```

8. **If it fails** (`stop_reason: "verification_failed_max_retries"`):
   ```bash
   # Check what failed
   runr report 20260102143052

   # Show user the failure reason
   # Ask if they want to resume or adjust approach

   # If resuming:
   runr resume 20260102143052
   ```

9. **If scope violation** (`stop_reason: "guard_violation"`):
   ```
   Run stopped - tried to modify files outside allowed scope.
   This usually means the task is broader than configured.

   Options:
   1. Adjust .runr/runr.config.json allowlist
   2. Break task into smaller pieces
   3. Use --allow-deps if it needs package changes
   ```

---

## Stop Reasons (What They Mean)

| Reason | What Happened | What To Do |
|--------|---------------|------------|
| `complete` | Task finished, all gates passed | Ship it! |
| `verification_failed_max_retries` | Tests failed too many times | Check report, fix issues, resume |
| `guard_violation` | Touched files outside scope | Adjust allowlist or break down task |
| `review_loop_detected` | Review kept rejecting same changes | Escalate to user, may need clearer requirements |
| `time_budget_exceeded` | Ran out of time | Resume with more time, or break into smaller tasks |
| `plan_rejection` | Planner rejected the approach | Task may be too vague/ambiguous |

---

## Failure Recovery Examples

Real-world scenarios showing how to recover from common failures using `runr report --json` and automation.

### Scenario 1: Verification Failed → Resume Workflow

**Situation:** Tests fail during VERIFY phase, but the fix is straightforward.

**Steps:**
```bash
# 1. Check what happened
runr report <run_id> --json | jq '{next_action, stop_reason, milestones}'
```

**Output:**
```json
{
  "next_action": "resume",
  "stop_reason": "verification_failed_max_retries",
  "milestones": {
    "completed": 2,
    "total": 4
  }
}
```

**Action:**
```bash
# 2. next_action says "resume", so resume
runr resume <run_id>

# 3. If you want hands-off retry, use watch with auto-resume
runr watch <run_id> --auto-resume --max-attempts 3
```

**When to use:**
- `next_action` is `resume`
- Failures are likely transient (flaky tests, timing issues)
- You want Runr to retry automatically

---

### Scenario 2: Guard Violation → Diagnose and Fix

**Situation:** Run stopped because it tried to modify files outside the allowed scope.

**Steps:**
```bash
# 1. Check the violation details
runr report <run_id> --json | jq '{next_action, stop_reason, suggested_command}'
```

**Output:**
```json
{
  "next_action": "resolve_scope_violation",
  "stop_reason": "guard_violation",
  "suggested_command": "# Review .runr/runr.config.json scope settings"
}
```

**Action:**
```bash
# 2. Check which files were blocked (from state.json or follow output)
runr report <run_id> | grep -A 5 "guard_violation"

# 3. Two options:
#    a) If files SHOULD be allowed: Update .runr/runr.config.json allowlist
#    b) If task is too broad: Break into smaller tasks

# Example: Allow package.json changes
# Edit .runr/runr.config.json:
{
  "scope": {
    "allowlist": ["src/**", "tests/**", "package.json"]
  }
}

# 4. Re-run from scratch (guard violations are NOT resumable)
runr run --task <path> --worktree --json
```

**When to use:**
- `next_action` is `resolve_scope_violation`
- Task legitimately needs to touch files outside current allowlist
- Need to broaden scope or use `--allow-deps` flag

---

### Scenario 3: Stuck Run → Use watch --auto-resume

**Situation:** Long-running task might hit transient failures (network issues, rate limits, stalls).

**Steps:**
```bash
# 1. Start run
runr run --task .runr/tasks/big-refactor.md --worktree --json
# Capture run_id: 20260102120000

# 2. Start watch with auto-resume (instead of manual monitoring)
runr watch 20260102120000 --auto-resume --max-attempts 5
```

**What happens:**
- Runr polls status every 5 seconds
- On `verification_failed_max_retries`: auto-resumes after 10s cooldown
- On `stalled_timeout`: auto-resumes
- On `guard_violation`: stops and surfaces to you (no auto-resume)
- After 5 resume attempts: gives up and reports failure

**Watch output (JSON mode):**
```bash
runr watch <run_id> --auto-resume --json
```

**Event stream:**
```json
{"event": "watching", "phase": "IMPLEMENT", "elapsed_s": 45}
{"event": "failed", "stop_reason": "verification_failed_max_retries"}
{"event": "resumed", "attempt": 1}
{"event": "watching", "phase": "VERIFY", "elapsed_s": 12}
{"event": "succeeded", "milestones_completed": 3}
```

**When to use:**
- Running CI/CD automation
- Hands-off execution for long tasks
- Want automatic retry on transient failures without manual intervention

---

## Interpreting Failures

### Verification Failures
```json
{
  "phase": "STOPPED",
  "stop_reason": "verification_failed_max_retries",
  "verification_failures": 3
}
```

**Action:**
1. Run `runr report <run_id>` to see test output
2. Identify the failing test/check
3. Explain to user what failed
4. Ask: "Should I resume and try fixing this, or adjust the approach?"

### Guard Violations
```json
{
  "phase": "STOPPED",
  "stop_reason": "guard_violation",
  "guard_violation_files": ["node_modules/foo/bar.js", ".env"]
}
```

**Action:**
1. Explain what files were blocked
2. If legitimate (e.g., needs to update package.json):
   - Suggest updating `.runr/runr.config.json` allowlist
   - Or use `--allow-deps` flag
3. If suspicious (e.g., tried to modify .env):
   - Explain this is a safety stop
   - Task may need refinement

---

## Task File Format

Task files are markdown. Keep them concise but clear:

```markdown
# [One-line description]

## Goal
[1-2 sentences: what are we building?]

## Requirements
- [Specific requirement]
- [Specific requirement]

## Success Criteria
- [How we know it's done]
- [Usually includes "tests pass"]

## Notes (optional)
- [Architecture preferences]
- [Files to modify]
```

**Good:**
```markdown
# Add dark mode toggle

## Goal
Users can switch between light/dark themes

## Requirements
- Toggle in settings page
- Persists in localStorage
- Updates CSS variables

## Success Criteria
- Clicking toggle switches theme
- Theme persists on refresh
- Existing tests still pass
```

**Bad (too vague):**
```markdown
# Make the app better

Add dark mode and other improvements as needed.
```

---

## Configuration (.runr/runr.config.json)

Users may already have this. If not, use `runr init` to auto-generate it, or create it manually:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "presets": ["nextjs", "vitest", "typescript"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  }
}
```

**Scope presets** auto-configure common patterns:
- `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

---

## Error Handling

### Run Not Found
```bash
runr status <run_id>
# Error: Run not found
```
**Action:** Check run_id for typos. Use `runr status --all` to list runs.

### Dirty Worktree
```
Error: Worktree is dirty
```
**Action:** Commit or stash changes first, or use `--allow-dirty` (not recommended).

### Worker Not Available
```
Error: claude-code not found
```
**Action:** Run `runr doctor` to diagnose. User may need to install Claude Code CLI.

---

## Advanced: Multiple Runs (Orchestration)

For parallel task execution:

```bash
runr orchestrate run --config tracks.yaml --worktree
```

**tracks.yaml:**
```yaml
tracks:
  - id: auth
    tasks:
      - path: tasks/auth-backend.md
      - path: tasks/auth-frontend.md
  - id: ui
    tasks:
      - path: tasks/dark-mode.md
```

Runr handles collision detection (won't edit same files simultaneously).

---

## Reporting Back to User

### On Start
```
Started run <run_id>. Runr is executing in an isolated worktree.
Monitoring progress...
```

### On Success
```
Run <run_id> completed successfully!
- All verifications passed (typecheck, build, tests)
- Created checkpoint commits
- Changes are in branch runr/<run_id>

Ready to merge or would you like me to review the changes first?
```

### On Failure (with actionable info)
```
Run <run_id> stopped: verification_failed_max_retries

The test "auth.test.ts > login redirects to dashboard" failed:
  Expected: /dashboard
  Actual: /login

This might be because the redirect logic in auth.ts uses the old route.
Should I resume and fix this, or would you like to adjust the requirements?
```

### On Guard Violation
```
Run <run_id> stopped: guard_violation

Runr blocked changes to:
- package-lock.json (dependency changes require --allow-deps)

This happened because the task tried to install 'bcrypt'.
Should I:
1. Resume with --allow-deps (if this is intentional)
2. Adjust the task to use existing libraries
```

---

## Best Practices

1. **Always use --worktree**: Isolates changes, prevents conflicts
2. **Always use --json**: Makes output parseable
3. **Capture run_id early**: You'll need it for all subsequent commands
4. **Check stop_reason before resuming**: Understand why it failed
5. **Use --fast for simple tasks**: Skips planning/review overhead
6. **Report stop reasons clearly**: Don't just say "it failed" — explain what and why
7. **Link to commits**: After completion, show user the checkpoint commits created

---

## One-Line Setup for Users

```bash
# Install Runr
npm install -g @weldr/runr

# Initialize in your project (auto-detects config)
cd /your/project
runr init

# Verify environment
runr doctor
```

This creates `.runr/runr.config.json` with auto-detected verification commands and example task files in `.runr/tasks/`.

---

## Summary Checklist

When operating Runr:

- [ ] Create clear task file with Goal, Requirements, Success Criteria
- [ ] Run with `--worktree --json` flags
- [ ] Capture and save run_id
- [ ] Monitor status periodically
- [ ] On stop, check stop_reason before acting
- [ ] Use `report` to get failure details
- [ ] Explain failures clearly to user (don't just say "tests failed")
- [ ] Offer resume or alternative approaches
- [ ] Report final commits/branches on success

**Remember:** You're the operator. Runr is the execution harness. Your job is to interpret results, handle failures gracefully, and keep the user informed.
