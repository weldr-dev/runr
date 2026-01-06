# 02: Intervene SHA Anchors

## Goal
Every intervention ties to an exact git range, eliminating ambiguity about what changed.

## Requirements

### 1. Enhance Intervention Receipt Schema
Update `src/receipt/intervention.ts` to capture:
```typescript
interface InterventionReceipt {
  // ... existing fields ...

  // Git state anchors
  base_sha: string;       // HEAD before intervention (already exists)
  head_sha: string;       // HEAD after intervention (NEW)
  branch: string;         // Current branch (already exists)
  dirty_before: boolean;  // Was tree dirty before? (NEW)
  dirty_after: boolean;   // Is tree dirty after? (NEW)

  // Commit range attribution (for audit)
  commits_in_range: string[];  // SHAs between base..head (NEW, if any)
}
```

### 2. Capture Git State Before and After
Modify `writeIntervention()`:
1. Capture `base_sha` at start (current HEAD)
2. Execute commands
3. Capture `head_sha` at end (new HEAD, may differ if commands committed)
4. Record `dirty_before` and `dirty_after` from `git status --porcelain`
5. If base_sha != head_sha, list commits in range

### 3. Add --since Flag
Extend `runr intervene`:
- `--since <sha>` - Override base_sha (useful when you already made commits and want to record them retroactively)

### 4. Validate SHA Anchors
- If `--since` provided, verify it exists in git history
- If `--since` is ahead of HEAD, error with helpful message

### 5. Tests
- Receipt includes head_sha after command execution
- dirty_before/dirty_after correctly detected
- commits_in_range populated when HEAD advances
- --since flag works correctly

## Scope
allowlist_add:
  - src/receipt/intervention.ts
  - src/commands/intervene.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/receipt/__tests__/intervention

# Manual: create commit, then intervene with --since
# git commit -m "test"
# runr intervene latest --reason manual_fix --note "retroactive" --since HEAD~1
# Receipt should show commits_in_range with the new commit SHA
```
