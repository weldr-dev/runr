# Microcourses Parallel Stress Test Retrospective

**Date**: December 30, 2024
**Status**: In Progress
**Related Repo**: `microcourses` (parallel to agent-framework)

## Overview

The microcourses experiment was designed as a parallel stress test for the agent-framework orchestrator. The goal was to run 10 independent course-creation tasks in parallel to validate isolation, scheduling, and merge safety.

## What We Attempted

Created 10 developer mini-courses, each as a separate track:

| Course | Topic | Target Directory |
|--------|-------|------------------|
| git-basics | Git fundamentals | `courses/git-basics/` |
| typescript-generics | TypeScript generics | `courses/typescript-generics/` |
| react-hooks | React hooks patterns | `courses/react-hooks/` |
| api-design | REST API design | `courses/api-design/` |
| testing-fundamentals | Unit testing basics | `courses/testing-fundamentals/` |
| docker-basics | Docker containerization | `courses/docker-basics/` |
| unit-testing | Advanced unit testing | `courses/unit-testing/` |
| http-caching | HTTP caching strategies | `courses/http-caching/` |
| web-security | Web security basics | `courses/web-security/` |
| sql-indexes | SQL indexing | `courses/sql-indexes/` |

Each course was meant to be fully isolated to its own directory, making parallel execution theoretically safe.

## Results

### Successful (6 courses)

- git-basics
- typescript-generics
- react-hooks
- api-design
- testing-fundamentals
- docker-basics

These completed and merged successfully.

### Failed (4 courses)

| Course | Failure Mode | Root Cause |
|--------|--------------|------------|
| unit-testing | guard_violation | `node_modules` symlink treated as dirty + scope violation |
| http-caching | guard_violation | Same as above |
| web-security | review_loop_detected | Reviewer kept requesting same changes |
| sql-indexes | stall (no stop_reason) | Run died mid-IMPLEMENT, no watchdog recovery |

## What Went Wrong

### 1. node_modules Symlink Poisoned Guards

**The Problem**: When using worktrees, we symlink `node_modules` from the original repo to avoid reinstalling dependencies. However:

- `.gitignore` rule `node_modules/` ignores directories but NOT symlinks
- The symlink appeared as an untracked file in `git status --porcelain`
- This triggered BOTH `dirty_worktree` AND `scope_violation`
- Same root cause counted twice in guard reasons

**Impact**: 2 courses (unit-testing, http-caching) failed immediately at preflight.

### 2. Lack of Ownership Enforcement

**The Problem**: Even though each task "intended" to only modify its own directory, there was no enforcement:

- No way to declare which paths a task owns
- No reservation system to prevent overlapping claims
- No runtime check that writes stayed within declared scope

**Impact**: Risk of merge conflicts if tasks accidentally touched shared files.

### 3. Review Loop Detection

**The Problem**: The reviewer kept requesting identical changes that the implementer couldn't satisfy.

**Impact**: 1 course (web-security) stopped with `review_loop_detected`.

**Status**: This is a separate issue from isolation. May require task simplification or reviewer prompt tuning.

### 4. Stall Without Recovery

**The Problem**: One run (sql-indexes) died mid-IMPLEMENT with no `stop_reason` recorded. The watchdog/reconciliation didn't convert it to a terminal state.

**Impact**: Run left in limbo, no way to resume cleanly.

**Status**: Watchdog/heartbeat improvements are a separate workstream.

## What We Fixed

### Fix 1: env_allowlist Concept

**Files**: `src/config/schema.ts`, `src/supervisor/scope-guard.ts`, `src/commands/preflight.ts`

Added `env_allowlist` to config with sensible defaults:
```typescript
env_allowlist: [
  'node_modules', 'node_modules/**',
  '.next/**', 'dist/**', 'build/**',
  '.turbo/**', '.eslintcache', 'coverage/**'
]
```

Added `partitionChangedFiles()` to separate env artifacts from semantic changes:
- `dirty` now means semantic changes only, not env noise
- Scope/lockfile checks only run against `semantic_changed`
- Guard reasons no longer double-count env artifacts

### Fix 2: Worktree Exclude Injection

**Files**: `src/repo/worktree.ts`

Added `.git/info/exclude` injection in worktree creation:
- `resolveWorktreeGitDir()` - handles worktree's `.git` file → gitdir resolution
- `upsertInfoExclude()` - injects patterns without clobbering user content
- Patterns injected: `node_modules`, `node_modules/`
- Sanity checks: assert worktree is clean before AND after env setup
- Defensive re-injection in `recreateWorktree()` for resume/upgrade

**Belt + suspenders approach**: Exclude injection prevents noise, env_allowlist tolerates it if it slips through.

### Fix 3: Phase-1 Ownership Gating

**Files**: `src/tasks/task-metadata.ts`, `src/commands/orchestrate.ts`, `src/orchestrator/state-machine.ts`

Added admission control for parallel runs without worktrees:
- `owns:` field in task YAML frontmatter
- Pattern normalization (POSIX, directories get `/**` suffix)
- Orchestrator blocks no-worktree parallel if ANY task lacks `owns:`
- Claims reserved before launch, released on completion
- `patternsOverlap()` detects conflicting claims at scheduling time

**Actionable error message**:
```
Parallel runs without worktrees require ownership declarations.

Fix: Add YAML frontmatter to each task file:

  ---
  owns:
    - src/courses/my-course/
  ---

Or use --worktree for full isolation (recommended).

Missing owns (4 tasks):
  tasks/unit-testing.md
  ...
```

### Fix 4: Phase-2 Ownership Enforcement

**Files**: `src/supervisor/runner.ts`, `src/commands/run.ts`

Added runtime enforcement after IMPLEMENT:
- `checkOwnership()` validates `semantic_changed ⊆ owns_normalized`
- Only enforced when `ownedPaths.length > 0` (backward compatible)
- Uses env partitioning to avoid false positives
- New stop reason: `ownership_violation` (distinct from `guard_violation`)
- Records artifact: `owned_paths`, `semantic_changed`, `violating_files`

**Key guarantee**: Tasks without `owns:` frontmatter work exactly as before.

## What's Still Remaining

### Immediate (to complete microcourses)

1. **Retry the 4 failed courses** with worktree mode now that env fixes are in place:
   - unit-testing (should now pass preflight)
   - http-caching (should now pass preflight)
   - web-security (may still hit review_loop - separate issue)
   - sql-indexes (may still hit stall - separate issue)

2. **Add `owns:` frontmatter** to all 10 course task files if we want to test no-worktree parallel

### Future Improvements

| Item | Priority | Status |
|------|----------|--------|
| Stall detection + heartbeat | High | Not started |
| Watchdog reconciliation (convert stalled → terminal) | High | Not started |
| PLAN-phase ownership check (`files_expected ⊆ owns`) | Medium | Not started |
| `--deps=symlink\|install\|none` policy | Low | Not started |
| Better review_loop diagnosis | Medium | Not started |

## Will Current Fixes Enable Reliable Course Completion?

### Yes, for the guard_violation failures

The unit-testing and http-caching failures were 100% caused by `node_modules` symlink noise. With:
- `.git/info/exclude` injection (prevents noise from appearing)
- `env_allowlist` partitioning (tolerates noise if it appears)

These should now pass preflight and proceed normally.

### Partially, for review_loop_detected

This is a separate issue related to task complexity or reviewer/implementer alignment. The fixes don't address this directly. Options:
- Simplify the web-security task
- Tune reviewer prompt to be less repetitive
- Increase `max_review_rounds` (masks the problem, doesn't fix it)

### No, for stall detection

The sql-indexes stall is a watchdog/liveness gap unrelated to isolation. Needs:
- Heartbeat mechanism during worker calls
- Reconciliation to convert stalled runs to terminal state after grace period
- This is a separate workstream

## Lessons Learned

1. **Parallelism amplifies failure modes** - Issues that rarely happen in single runs become common in parallel. The stall happened once in 10 runs; at scale it would be frequent.

2. **Isolation must be enforced, not assumed** - "Each task only touches its own directory" is a human convention. Without enforcement, it's a hope, not a guarantee.

3. **Environment artifacts need special handling** - The difference between a directory and a symlink matters to git. Worktree-local ignores (`.git/info/exclude`) are the right tool.

4. **Belt + suspenders is the right model** - Prevent the problem (exclude injection) AND tolerate it if prevention fails (env_allowlist). Defense in depth.

5. **New stop reasons for new failure classes** - `ownership_violation` is distinct from `guard_violation` because they represent different contract levels (task-declared vs config-level).

## Appendix: Test Commands

```bash
# Retry failed courses with worktrees (recommended)
cd /path/to/microcourses
agent orchestrate plan.yaml --worktree

# Or retry individual courses
agent run tasks/unit-testing.md --worktree
agent run tasks/http-caching.md --worktree
agent run tasks/web-security.md --worktree
agent run tasks/sql-indexes.md --worktree

# Check if parallel without worktree would work (requires owns: frontmatter)
agent orchestrate plan.yaml --no-worktree
```

## Appendix: Task Frontmatter Example

For no-worktree parallel runs, each task needs:

```yaml
---
owns:
  - courses/unit-testing/
---

# Create Unit Testing Course

Build a comprehensive unit testing course...
```

The `owns:` paths are normalized to `courses/unit-testing/**` and enforced at runtime.
