# 01: Stop Workflow UX - Receipts as Operator Dashboard

## Goal
Make the happy path obvious when runs STOP, so the meta-agent naturally does the right thing.

## Problem
When a run stops, the user/agent sees diagnostic info but no clear "what now" action. This leads to:
- Audit gaps (manual fixes without intervention receipts)
- Review loops (wrong recovery path chosen)
- Confusion about Flow vs Ledger expectations

## Requirements

### 1. Add "What Now" Footer to Stop Output
When a run stops (any reason), append a clear recommended path based on mode:

**Flow Mode:**
```
┌─────────────────────────────────────────────────────────────┐
│ WHAT NOW (Flow mode)                                         │
├─────────────────────────────────────────────────────────────┤
│ Fix fast:                                                    │
│   runr intervene <run_id> --reason <stop_reason> \          │
│     --note "what you fixed" --commit "Fix: description"     │
│                                                              │
│ Or resume after fixing:                                      │
│   runr resume <run_id>                                       │
└─────────────────────────────────────────────────────────────┘
```

**Ledger Mode:**
```
┌─────────────────────────────────────────────────────────────┐
│ WHAT NOW (Ledger mode)                                       │
├─────────────────────────────────────────────────────────────┤
│ Preferred: Edit task file, then:                            │
│   runr resume <run_id>                                       │
│                                                              │
│ If manual fix required:                                      │
│   runr intervene <run_id> --reason <stop_reason> \          │
│     --note "what you fixed" --commit "Fix: description"     │
└─────────────────────────────────────────────────────────────┘
```

### 2. Integrate into Existing Stop Handlers
Locations to add footer:
- `src/supervisor/runner.ts` - when run transitions to terminal state
- `src/commands/status.ts` - when showing stopped run status
- `src/cli.ts` - after run command completes with stop

### 3. Make Footer Reason-Aware
The footer should adapt based on stop reason:
- `review_loop_detected`: suggest specific checks that failed
- `verification_failed`: show failing command
- `scope_violation`: show files and suggest scope adjustment
- `stalled_timeout`: suggest resume or manual completion

### 4. Add "Copy-Paste Ready" Command
Include the actual run_id in the suggested commands (not `<run_id>`).

### 5. Respect --json Flag
In JSON output mode, include the suggested commands as structured data:
```json
{
  "suggested_recovery": {
    "mode": "flow",
    "primary": "runr intervene 20260107120000 --reason review_loop ...",
    "alternative": "runr resume 20260107120000"
  }
}
```

## Tests
- Footer appears on stopped runs
- Mode detection works correctly
- Reason-specific suggestions are accurate
- --json includes structured suggestions
- Copy-paste commands include actual run_id

## Scope
allowlist_add:
  - src/supervisor/runner.ts
  - src/commands/status.ts
  - src/cli.ts
  - src/output/stop-footer.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test
# Manual: run a task that stops, verify footer appears
```
