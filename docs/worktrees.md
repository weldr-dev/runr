# Worktree Strategy

Git worktrees provide isolated execution environments for Runr runs, preventing cross-contamination between runs and protecting the main repository.

## Overview

When `--worktree` is enabled, the agent:

1. Creates a git worktree at `.runr-worktrees/<run_id>/` (outside `.runr/`)
2. Attaches it to a dedicated branch (`runr/<run_id>/<task_name>`)
3. Symlinks `node_modules` from the original repo (if present)
4. Executes all operations in the worktree

**Note**: Worktrees are stored in `.runr-worktrees/` (a sibling of `.runr/`, not inside it). This prevents conflicts with denylist patterns like `.runr/**` that could cause workers to refuse operations or create git dirtiness issues. Override with `RUNR_WORKTREES_DIR` env var.

## Benefits

- **Isolation**: Each run has its own working directory
- **Safety**: Main repo stays clean; failed runs don't leave debris
- **Resumability**: Worktrees can be recreated deterministically from saved state
- **Parallelism**: Multiple runs can execute against different worktrees

## Node Modules Strategy

### Problem

Full `npm install` in each worktree is slow and disk-intensive. Monorepos can have gigabytes of dependencies.

### Solution: Symlink from Source

On worktree creation, we symlink `node_modules` from the original repo:

```typescript
const originalNodeModules = path.join(originalRepoPath, 'node_modules');
const worktreeNodeModules = path.join(worktreePath, 'node_modules');
if (fs.existsSync(originalNodeModules) && !fs.existsSync(worktreeNodeModules)) {
  fs.symlinkSync(originalNodeModules, worktreeNodeModules, 'dir');
}
```

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Symlink** (current) | Fast, low disk usage | Shared state, can't add new deps |
| **Full install** | True isolation | Slow, disk-heavy |
| **Copy** | Some isolation | Slow, very disk-heavy |

### When Symlink Fails

If the source `node_modules` is missing:
- The symlink is skipped (no error)
- Verification commands may fail with "module not found"
- Fix: Run `npm install` in the original repo first

### Git Exclude Injection

When creating a worktree, we inject patterns into the **main repo's** `.git/info/exclude` to prevent symlinked artifacts from appearing as untracked files:

```
# agent-framework env ignores
node_modules
node_modules/
/node_modules
```

**Why the main repo?** Git worktrees share the main repository's exclude file. Writing to the worktree's linked gitdir (e.g., `.git/worktrees/worktree1/info/exclude`) has no effect—git only reads from the main `.git/info/exclude`.

This ensures `git status` stays clean after symlinking `node_modules`, preventing false "worktree became dirty" errors.

### Monorepo Considerations

For monorepos with nested `node_modules` (e.g., pnpm workspaces):
- Only the root `node_modules` is symlinked
- Workspace packages should use hoisted dependencies
- If a subdirectory needs its own `node_modules`, run `npm install` in the worktree

## Resume Behavior

When resuming a run with `--worktree`:

1. **Worktree exists and valid**: Continue using it
2. **Worktree missing**: Recreate at same base SHA
3. **Branch mismatch**: Error unless `--force` is used

### Timeline Events

| Event | When |
|-------|------|
| `worktree_recreated` | Worktree was missing and recreated |
| `worktree_branch_mismatch` | Branch didn't match, forced override |
| `node_modules_symlinked` | Node modules were symlinked from source |

## Cleanup

Use the `gc` command to reclaim disk space:

```bash
# Preview what would be deleted
node dist/cli.js gc --dry-run

# Delete worktrees older than 7 days (default)
node dist/cli.js gc

# Delete all worktrees
node dist/cli.js gc --older-than 0
```

The gc command:
- Deletes `.runr-worktrees/<run_id>/` directories (current location)
- Also cleans legacy locations: `.runr/worktrees/<run_id>/` (legacy v2) and `.runr/runs/<run_id>/worktree/` (legacy v1)
- Never touches artifacts, state, or timeline
- Shows disk usage summary before/after

## Best Practices

1. **Always use worktrees for CI/automation**
   - Prevents state leakage between runs
   - Makes runs reproducible

2. **Run `npm install` before starting Runr runs**
   - Ensures dependencies are available for symlink
   - Faster than installing in each worktree

3. **Clean up periodically with `gc`**
   - Worktrees can consume significant disk space
   - Set up a cron job or run after batch operations

4. **Use `--force` carefully on resume**
   - Branch mismatch usually indicates something unexpected happened
   - Review the worktree state before forcing

## Acceptance Tests

These tests verify that worktree and guard fixes are working. Run with:

```bash
npx vitest run test/acceptance/worktree-fixes.test.ts
```

### A) Fresh repo "just works" (no .gitignore edits)

**Goal:** Prove auto `.git/info/exclude` injection is enough.

- Creates a brand-new repo with no `.gitignore` entries for `.runr*`
- Runs a trivial task
- Verifies:
  - `.git/info/exclude` got updated with `.agent` patterns
  - No guard noise from `.runr/**` artifacts

**Pass condition:** `guard=pass` and no "dirty worktree" caused by runner artifacts.

### B) Worktree path can't trip `.runr/**` denylist

**Goal:** Prove `implement_blocked` class is eliminated.

- Verifies worktree directory is at `.runr-worktrees/` not `.runr/worktrees/`
- Verifies `RUNR_WORKTREES_DIR` env var override code path exists
- Confirms worktree absolute path contains no `/.runr/` segment

**Pass condition:** Worktree path contains **no** `/.runr/` segment.

### C) "guard=fail" prints reasons + files

**Goal:** Make guard failures actionable.

- Creates intentional scope violation
- Verifies console output includes:
  - "Guard Failure Details:" section
  - Specific reasons (dirty/scope/lockfile)
  - Concrete files flagged

**Pass condition:** Can diagnose without opening `timeline.jsonl`.
