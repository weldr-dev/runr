# Worktree Strategy

Git worktrees provide isolated execution environments for agent runs, preventing cross-contamination between runs and protecting the main repository.

## Overview

When `--worktree` is enabled, the agent:

1. Creates a git worktree at `.agent/worktrees/<run_id>/`
2. Attaches it to a dedicated branch (`agent/<run_id>/<task_name>`)
3. Symlinks `node_modules` from the original repo (if present)
4. Executes all operations in the worktree

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
- Deletes `.agent/worktrees/<run_id>/` directories (and legacy `.agent/runs/<run_id>/worktree` if present)
- Never touches artifacts, state, or timeline
- Shows disk usage summary before/after

## Best Practices

1. **Always use worktrees for CI/automation**
   - Prevents state leakage between runs
   - Makes runs reproducible

2. **Run `npm install` before starting agent runs**
   - Ensures dependencies are available for symlink
   - Faster than installing in each worktree

3. **Clean up periodically with `gc`**
   - Worktrees can consume significant disk space
   - Set up a cron job or run after batch operations

4. **Use `--force` carefully on resume**
   - Branch mismatch usually indicates something unexpected happened
   - Review the worktree state before forcing
