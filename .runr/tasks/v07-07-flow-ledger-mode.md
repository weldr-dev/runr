# 07: Flow/Ledger Mode Toggle

## Goal
Explicit mode switching between productivity-first (Flow) and audit-first (Ledger) workflows.

## Requirements

### 1. Add Mode to Config Schema
Extend `runr.config.json`:
```json
{
  "workflow": {
    "mode": "flow",  // or "ledger"
    "integration_branch": "dev",
    "release_branch": "main"
  }
}
```

Default: `flow`

### 2. Mode Behaviors

**Flow Mode (Default):**
- `runr intervene` allowed freely
- `runr intervene --amend-last` allowed
- `runr intervene --commit` allowed
- Manual merges to integration branch allowed (no gate)
- Receipts required but not blocking

**Ledger Mode:**
- `runr intervene` allowed but requires `--reason`
- `runr intervene --amend-last` blocked (error with suggestion)
- All merges must go through `runr submit`
- STOPPED runs must be resumed via `runr resume` or intervention recorded
- Higher audit coverage expectations

### 3. Console Banner
All Runr commands print current mode:
```
Runr v0.6.0 | Mode: flow | Branch: dev
```

Or in Ledger mode:
```
Runr v0.6.0 | Mode: ledger | Branch: dev
```

### 4. Mode-Aware Command Guards
Commands check mode and enforce restrictions:

**In Ledger Mode:**
- `runr intervene --amend-last`:
  ```
  Error: --amend-last is not allowed in Ledger mode.
  In Ledger mode, use explicit commits:
    runr intervene <run_id> --commit "message" --reason <reason>
  Or switch to Flow mode in runr.config.json.
  ```

### 5. runr mode Command
Add utility command:
```bash
runr mode            # Print current mode
runr mode flow       # Set mode to flow
runr mode ledger     # Set mode to ledger
```

### 6. Orchestration Mode Override
Orchestration config can override project mode:
```yaml
mode: ledger  # Override for this orchestration
tasks:
  - task-01.md
  - task-02.md
```

### 7. Tests
- Mode read from config correctly
- Ledger mode blocks --amend-last
- Banner shows correct mode
- `runr mode` command works

## Scope
allowlist_add:
  - src/config/schema.ts
  - src/commands/intervene.ts
  - src/commands/mode.ts
  - src/cli.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/config src/commands

# Mode command works
runr mode

# Banner shows mode
runr status --all 2>&1 | head -1

# Ledger mode blocks amend-last (after setting mode)
# runr mode ledger
# runr intervene latest --reason test --note "test" --amend-last
# Should error
```
