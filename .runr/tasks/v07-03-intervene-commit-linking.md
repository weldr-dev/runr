# 03: Intervene Commit Linking

## Goal
Auto-attribute commits to interventions, reducing "gaps" in audit.

## Requirements

### 1. Add --commit Flag
Extend `runr intervene`:
- `--commit "message"` - Create a commit with the given message and Runr trailers

Behavior:
1. Stage all changes (`git add -A`)
2. Create commit with message + trailers:
   ```
   <message>

   Runr-Run-Id: <run_id>
   Runr-Intervention: true
   Runr-Reason: <reason>
   ```
3. Update intervention receipt with commit SHA

### 2. Add --amend-last Flag (Flow Mode Only)
Extend `runr intervene`:
- `--amend-last` - Amend the last commit to add Runr trailers

Behavior:
1. Check current workflow mode (error if Ledger mode)
2. Verify last commit exists and is not pushed
3. Append trailers to existing commit message
4. Update intervention receipt

### 3. Add --stage-only Flag
Extend `runr intervene`:
- `--stage-only` - Stage changes but don't commit (useful with --commit)

### 4. Print Trailers Helper
When intervention is recorded:
- If changes exist but --commit not used, print:
  ```
  Unstaged changes detected. To commit with attribution:
    git commit -m "your message" --trailer "Runr-Run-Id: <id>" --trailer "Runr-Intervention: true"
  Or run:
    runr intervene <run_id> --commit "your message" --reason ...
  ```

### 5. Safety Guards
- --amend-last requires:
  - Flow mode active (or --force)
  - Unpushed commit
  - Clean working tree (after amend)
- --commit conflicts with --amend-last (error)

### 6. Tests
- --commit creates commit with trailers
- --amend-last adds trailers to existing commit
- --amend-last blocked in Ledger mode
- Helper message printed when changes exist

## Scope
allowlist_add:
  - src/commands/intervene.ts
  - src/receipt/intervention.ts
  - src/cli.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/receipt/__tests__/intervention src/commands

# Manual: create change and use --commit
# echo "test" > test.txt
# runr intervene latest --reason manual_fix --note "test" --commit "test commit"
# git log -1 --format=%B  # Should show trailers
```
