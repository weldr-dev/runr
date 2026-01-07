# 02: Git Hooks as Optional Enforcement

## Goal
Provide opt-in git hooks that catch missing provenance at commit time - the only reliable "about to commit" solution.

## Problem
Even with good tooling, commits without Runr attribution can slip through. The only way to catch this reliably is at the git layer.

## Requirements

### 1. Hook Management Commands

**Install hooks:**
```bash
runr hooks install
# Creates .git/hooks/prepare-commit-msg with Runr checks
# Prints: "Runr git hooks installed. Use 'runr hooks status' to verify."
```

**Check status:**
```bash
runr hooks status
# Shows: installed/not installed, mode (flow/ledger), last triggered
```

**Uninstall:**
```bash
runr hooks uninstall
# Removes Runr hooks, restores any backup
```

### 2. prepare-commit-msg Hook Behavior

The hook detects:
1. Latest run is STOPPED (not finished)
2. Commit message lacks Runr trailers (`Runr-Run-Id:`, `Runr-Intervention:`)

**Flow Mode Behavior:**
- Print warning to stderr
- Print exact `runr intervene --commit` command to use
- Allow commit to proceed (soft enforcement)

**Ledger Mode Behavior:**
- Print error to stderr
- Block commit unless:
  - `RUNR_ALLOW_GAP=1` environment variable set
  - `--no-verify` flag used
- Print escape hatch instructions

### 3. Hook Template
Create `src/hooks/prepare-commit-msg.sh`:
```bash
#!/bin/bash
# Runr provenance check - installed by 'runr hooks install'

# Get commit message file
COMMIT_MSG_FILE="$1"

# Check if runr is available
if ! command -v runr &> /dev/null; then
  exit 0  # Runr not installed, skip
fi

# Run the actual check (implemented in Node for consistency)
runr hooks check-commit "$COMMIT_MSG_FILE"
exit $?
```

### 4. Implement `runr hooks check-commit`
Create `src/commands/hooks.ts`:
- Load current mode from config
- Find latest run, check if STOPPED
- Parse commit message for trailers
- Apply Flow/Ledger policy
- Return appropriate exit code

### 5. Handle Edge Cases
- No .runr directory: skip (not a Runr project)
- No runs exist: skip
- Latest run is FINISHED: skip
- Commit is a merge: skip (merge commits handled differently)
- Commit message already has trailers: skip

### 6. User-Friendly Messages

**Flow Mode Warning:**
```
⚠️  Runr provenance gap detected

Latest run 20260107120000 is STOPPED.
This commit has no Runr attribution.

To add attribution, abort and run:
  runr intervene 20260107120000 --reason manual_fix \
    --note "your description" --commit "your message"

Proceeding anyway (Flow mode allows this).
```

**Ledger Mode Block:**
```
❌ Runr provenance required (Ledger mode)

Latest run 20260107120000 is STOPPED.
This commit has no Runr attribution.

To add attribution:
  runr intervene 20260107120000 --reason manual_fix \
    --note "your description" --commit "your message"

To override (not recommended):
  RUNR_ALLOW_GAP=1 git commit ...
  # or: git commit --no-verify
```

## Tests
- `runr hooks install` creates hook file
- `runr hooks status` shows correct state
- `runr hooks uninstall` removes hook
- Hook warns in Flow mode
- Hook blocks in Ledger mode
- `RUNR_ALLOW_GAP=1` bypasses block
- Non-Runr projects skip gracefully

## Scope
allowlist_add:
  - src/commands/hooks.ts
  - src/hooks/**

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: install hooks, make commit without trailers, verify behavior
```
