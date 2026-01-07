# 05: Submit Conflict UX Polish

## Goal
Make `runr submit` feel safe and trustworthy when conflicts occur. Small scope, big trust impact.

## Problem
When cherry-pick conflicts happen during submit:
- User may not know the exact recovery steps
- Branch state after conflict may be unclear
- No guidance on CHANGELOG or manual resolution

## Requirements

### 1. Conflict Output Spec
When conflict occurs, output exactly:

```
Cherry-pick conflict detected.

Conflicted files:
  - src/components/Button.tsx
  - src/utils/helpers.ts

Recovery state:
  ✓ Branch restored to: dev
  ✓ Working tree is clean
  ✓ Checkpoint preserved at: abc1234

Manual recovery options:

  Option 1: Cherry-pick manually
    git checkout dev
    git cherry-pick abc1234
    # Resolve conflicts
    git add .
    git cherry-pick --continue

  Option 2: Rebase checkpoint
    git checkout abc1234
    git rebase dev
    # Resolve conflicts
    git checkout dev
    git merge --ff-only <rebased-sha>

If this is a feature addition, consider updating CHANGELOG.md.
```

### 2. Timeline Event Enhancement
The `submit_conflict` timeline event should include:
```json
{
  "type": "submit_conflict",
  "payload": {
    "target_branch": "dev",
    "checkpoint_sha": "abc1234",
    "conflicted_files": ["src/components/Button.tsx", "src/utils/helpers.ts"],
    "recovery_branch": "dev",
    "recovery_state": "clean",
    "suggested_commands": [
      "git checkout dev",
      "git cherry-pick abc1234"
    ]
  }
}
```

### 3. Always Restore Clean State
Ensure invariants are maintained:
- Starting branch is restored
- Working tree is clean (no leftover conflict markers)
- Cherry-pick state is aborted cleanly
- No partial commits

Add assertion checks after conflict handling:
```typescript
// After conflict cleanup
assert(currentBranch === startingBranch, "Branch not restored");
assert(isWorkingTreeClean(), "Tree not clean");
```

### 4. Conditional CHANGELOG Tip
Only show CHANGELOG tip when:
- Checkpoint includes new features (detected via commit message or file changes)
- CHANGELOG.md exists in repo
- Checkpoint doesn't already modify CHANGELOG.md

### 5. Integration Test
Add acceptance test: `test/acceptance/submit-conflict.test.ts`

```typescript
describe('submit conflict handling', () => {
  it('restores clean state after conflict', async () => {
    // Setup: create repo with divergent branches
    // Action: runr submit that causes conflict
    // Assert: branch restored, tree clean, timeline has event
  });

  it('includes recovery commands in output', async () => {
    // Assert: output contains git cherry-pick command
  });

  it('lists conflicted files', async () => {
    // Assert: conflicted files are listed
  });
});
```

### 6. Dry-Run Safety
Verify `--dry-run` with potential conflict:
- Detects conflict would occur
- Reports which files would conflict
- Makes NO changes (branch, tree, timeline)

## Tests
- Conflict output matches spec exactly
- Branch is always restored
- Tree is always clean after conflict
- Timeline event includes all required fields
- CHANGELOG tip appears conditionally
- Dry-run detects but doesn't modify

## Scope
allowlist_add:
  - src/commands/submit.ts
  - test/acceptance/submit-conflict.test.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: create conflict scenario, verify clean abort
# Verify: git status shows clean after conflict
# Verify: recovery commands are copy-paste ready
```
