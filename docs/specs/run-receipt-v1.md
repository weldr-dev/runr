# Run Receipt v1 Specification

**Status:** Approved
**Date:** 2026-01-06

## Philosophy

Runr + meta-agent is a **reliability workflow on top of vanilla Claude Code**. Claude is the hands/brain, Runr is the rails + receipts.

The primary UX is the **operator loop**: plan → run task → review changes → integrate.

Review must be **immediate and intuitive** - no TUI, no separate commands. Just artifacts + a receipt.

## Core Principle: Source of Truth

Truth is:
- **Checkpoint SHA** (git object)
- **Diff** (git diff)
- **Timeline events** (`.runr/runs/<id>/timeline.jsonl`)
- **Verification results** (`.runr/runs/<id>/verify/*.log`)

Transcript is **best-effort garnish**, not contract.

---

## 1. Run Receipt (Console Output)

### At Run Termination (Any Terminal State)

Runr **always** prints:

```
Run 20260106041301 [complete] ✓

Changes:
  CHANGELOG.md         +81   -1
  src/commands/meta.ts +147  -23
  src/cli.ts           +12   -3
  ...12 more files

Checkpoint: b9b57b5 (verified: tier1 build+tests)

Review:  .runr/runs/20260106041301/diff.patch
Submit:  runr submit 20260106041301 --to dev --dry-run
```

### Rules

- **Diffstat**: Show up to 20 files, then "...N more files"
- **Checkpoint**: Only show if checkpoint exists (complete/verified runs)
- **Next action**: Context-aware suggestion (submit, resume, bundle, etc.)
- **Format**: Simple, scannable, copy-pasteable commands

### Stop Reasons Get Specific Receipts

**Scope violation:**
```
Run 20260106041301 [stopped: scope_violation] ✗

CHANGELOG.md not in allowlist.

Fix - add to .runr/tasks/your-task.md:

  ## Scope
  allowlist_add:
    - CHANGELOG.md

Then:  runr resume 20260106041301
```

**Verification failed:**
```
Run 20260106041301 [stopped: verification_failed] ✗

Tier1 failed: npm run build
Exit code: 1

Logs:    .runr/runs/20260106041301/verify/tier1-001-build.log
Resume:  runr resume 20260106041301 (fix errors first)
```

---

## 2. Diff Artifacts (Always Written)

### Files Created at Terminal State

```
.runr/runs/<id>/
  receipt.json        # baseline + checkpoint metadata (always)
  diff.patch          # or diff.patch.gz if huge
  diffstat.txt        # always, even if patch is compressed
  files.txt           # list of changed files, one per line
  transcript.log      # if captured (best-effort)
  transcript.meta.json # if not captured (pointer)
```

### receipt.json (Baseline Definition)

**Always written** at terminal state with deterministic baseline:

```json
{
  "base_sha": "abc123...",        // repo HEAD at run start (or worktree base)
  "checkpoint_sha": "def456...",  // verified checkpoint (if exists)
  "verification_tier": "tier1",   // or null if not verified
  "terminal_state": "complete",   // complete, stopped, failed
  "files_changed": 23,
  "lines_added": 147,
  "lines_deleted": 34
}
```

**Baseline rule:**
- `base_sha` = Git HEAD at run initialization (before any changes)
- Diff = `git diff base_sha..checkpoint_sha` (or base_sha..HEAD if no checkpoint)
- This prevents "what did I compare against?" confusion when branch moves

### Size Limits (Multi-Dimensional)

**Compress patch if ANY:**
- Diff size > 50KB **OR**
- Changed lines > 2000 **OR**
- Changed files > 100

**Cap file listings:**
- Console: show max 20 files, then "...N more files"
- files.txt: list max 500 files, then append "...truncated, N more files"
- Reason: prevents console spam and huge file lists

When compressed:
- Write `.diff.patch.gz`
- Write `.diffstat.txt` (always uncompressed, full summary)
- Console prints: "Review: .runr/runs/<id>/diff.patch.gz (large changeset)"

### Patch Generation Flags

Use robust git diff flags:

```bash
git diff --patch --binary --find-renames base_sha..checkpoint_sha
```

- `--patch`: Generate patch format
- `--binary`: Include binary files (or document v1 doesn't support binary)
- `--find-renames`: Better output for renamed files

**Binary files in v1:** Include in diff or document as unsupported (decide in implementation).

### Transcript Handling (Best-Effort Contract)

**If Runr captures output:**
- Write `.runr/runs/<id>/transcript.log`
- Console prints: "Transcript: .runr/runs/<id>/transcript.log"

**If meta-agent owns output (cannot capture):**
- **MUST** still create `.runr/runs/<id>/transcript.meta.json`:
  ```json
  {
    "captured_by": "claude_code",
    "session_id": "...",
    "started_at": "2026-01-06T04:13:01Z",
    "ended_at": "2026-01-06T04:18:32Z",
    "path_hint": null,
    "note": "Transcript captured by operator"
  }
  ```
- Console prints: "Transcript: (captured by operator)"

**Contract:** The UI never has a missing link - either transcript.log exists or meta.json explains why not.

---

## 3. Task Contract (Scope + Verification)

### Task File Format

```markdown
# Task Title

## Goal
What we're building

## Requirements
- Bulleted list

## Success Criteria
How we know it's done

## Scope (optional)
allowlist_add:
  - CHANGELOG.md
  - docs/**

## Verification (optional)
tier: tier1  # or tier0, tier2; defaults to config if omitted
```

### Rules

1. **Base allowlist** comes from `.runr/runr.config.json`
2. **`allowlist_add`** in task is **additive only** (cannot remove base allowlist entries)
3. **Verification tier** can be lowered from config default, but **minimum is tier0**
   - tier0 = fast checks (clean tree, scope, lint)
   - tier1 = build
   - tier2 = tests
4. **Never** allow skipping verification entirely

### Scope Violation Behavior

If agent touches file outside allowlist:
1. Run stops immediately
2. Timeline event: `scope_violation` with file list
3. Console shows copy-pasteable fix (YAML snippet for task file)
4. Tree is restored to clean state

---

## 4. Submit Conflict Policy

### Conflicts Are Normal - Always Clean Abort

**Never auto-resolve conflicts.** Period.

On cherry-pick conflict:

1. `git cherry-pick --abort` immediately
2. Branch restored to starting point
3. Tree is guaranteed clean
4. Timeline writes `submit_conflict` event with conflicted files
5. Console prints:

```
⚠️  Submit conflict

Files:  CHANGELOG.md, src/foo.ts

Branch restored. Tree is clean.

Resolve manually:
  git checkout dev
  git cherry-pick b9b57b5
  # fix conflicts
  git add . && git commit --no-edit

Tip: Conflicts are common on CHANGELOG.md; consider moving
     changelog updates into a dedicated task.
```

### No Force-Conflicts Flag

Do **not** add `--force-conflicts` or any flag that leaves user in conflict state.

This breaks the "branch restored, tree clean" invariant, which is a core safety promise.

**Power-user escape hatch (future):**
- `runr submit --print-cherry-pick <id>` → outputs the exact git command but doesn't execute
- User runs it manually if they want to handle conflicts

---

## 5. Implementation Checklist

### Phase 1: Diff Artifacts (Foundation)
- [ ] At run termination, write `diff.patch`, `diffstat.txt`, `files.txt`
- [ ] Implement size-based compression (50KB / 5000 lines / 100 files)
- [ ] Add transcript handling (log file or meta pointer)
- [ ] Update console output to print Run Receipt format

### Phase 2: Task Contract
- [ ] Add `allowlist_add` parsing to task schema
- [ ] Merge task-local allowlist with base allowlist
- [ ] Add `verification: tier` parsing to task schema
- [ ] Enforce minimum tier0 (block tier=none)
- [ ] Scope violation → stop + print copy-pasteable fix

### Phase 3: Submit Polish
- [ ] Ensure clean abort on conflict (already mostly done)
- [ ] Add conflict tip message about dedicated changelog tasks
- [ ] Test invariants: branch restored, tree clean, event logged

### Phase 4: Testing
- [ ] Test Run Receipt output for all terminal states
- [ ] Test diff compression triggers (size, lines, files)
- [ ] Test task-local allowlist override
- [ ] Test scope violation stop + resume flow
- [ ] **Test submit conflict abort invariants (critical):**
  - [ ] Conflict occurs on cherry-pick
  - [ ] Branch returns to original
  - [ ] Tree is clean (no leftover files)
  - [ ] Timeline event written with conflicted file list
  - [ ] Console shows recovery recipe

---

## Non-Goals (v1)

- ❌ TUI for reviewing runs
- ❌ `runr open` command (just use paths in receipt)
- ❌ Auto-resolving any conflicts (even "safe" ones)
- ❌ Mandatory transcript capture
- ❌ Verification tier = none

---

## Success Criteria

Run Receipt v1 is successful when:

1. **Every run ends with a scannable receipt** showing changes + next action
2. **Diff artifacts are always present** and correctly sized
3. **Task-local scope works** without config surgery
4. **Submit conflicts are safe** (always clean abort)
5. **Verification is never skipped** (tier0 minimum enforced)

The meta-agent can drive Runr with **zero surprise** - it always knows what happened and what to do next.
