# 03: Orchestration Receipt - Manager Dashboard

## Goal
When running a sprint orchestration, produce one artifact that tells the whole story - the "manager dashboard" for agent work.

## Problem
Orchestrations spawn multiple runs, but there's no unified view of:
- What tasks were attempted/completed/stopped
- Which runs belong to which tasks
- What interventions were needed
- Overall audit coverage impact
- Top issues and suggested fixes

## Requirements

### 1. Orchestration Receipt Artifacts
Create on orchestration completion:
- `.runr/orchestrations/<orch_id>/receipt.json` - machine-readable
- `.runr/orchestrations/<orch_id>/receipt.md` - human-readable summary

### 2. Receipt JSON Schema
```json
{
  "schema_version": "1",
  "orchestration_id": "20260107120000",
  "started_at": "2026-01-07T12:00:00Z",
  "completed_at": "2026-01-07T14:30:00Z",
  "duration_ms": 9000000,

  "summary": {
    "tasks_total": 8,
    "tasks_completed": 6,
    "tasks_stopped": 2,
    "tasks_skipped": 0,
    "interventions_count": 1,
    "total_checkpoints": 12
  },

  "tasks": [
    {
      "task_path": ".runr/tasks/feature-x.md",
      "run_id": "20260107120100",
      "status": "finished",
      "stop_reason": null,
      "milestones_completed": 3,
      "checkpoint_sha": "abc123...",
      "duration_ms": 300000
    },
    {
      "task_path": ".runr/tasks/feature-y.md",
      "run_id": "20260107121500",
      "status": "stopped",
      "stop_reason": "review_loop_detected",
      "milestones_completed": 1,
      "checkpoint_sha": null,
      "duration_ms": 450000,
      "intervention": {
        "receipt_path": ".runr/runs/20260107121500/interventions/...",
        "reason": "review_loop"
      }
    }
  ],

  "audit_coverage": {
    "before": {
      "explicit": 45,
      "with_inferred": 62
    },
    "after": {
      "explicit": 58,
      "with_inferred": 75
    },
    "delta": {
      "explicit": 13,
      "with_inferred": 13
    }
  },

  "top_stop_reasons": [
    {
      "reason": "review_loop_detected",
      "count": 2,
      "suggested_fix": "Check reviewer expectations match verifier output"
    }
  ]
}
```

### 3. Receipt Markdown Format
```markdown
# Orchestration Receipt: 20260107120000

## Summary
| Metric | Value |
|--------|-------|
| Duration | 2h 30m |
| Tasks | 6/8 completed |
| Checkpoints | 12 |
| Interventions | 1 |

## Audit Coverage
- Before: 45% explicit, 62% with inferred
- After: 58% explicit, 75% with inferred
- Delta: +13%

## Tasks

### ✓ feature-x.md
- Run: 20260107120100
- Status: finished
- Checkpoint: abc123

### ⚠ feature-y.md
- Run: 20260107121500
- Status: stopped (review_loop_detected)
- Intervention: manual fix applied

## Top Issues
1. **review_loop_detected** (2 occurrences)
   - Suggested: Check reviewer expectations match verifier output

## Next Steps
- Review stopped tasks: feature-y.md
- Run `runr audit --range HEAD~20..HEAD` to verify coverage
```

### 4. CLI Command
```bash
runr orchestrate receipt <orch_id>
runr orchestrate receipt latest
# Generates and displays receipt

runr orchestrate receipt latest --json
# Output JSON only
```

### 5. Auto-Generate on Completion
When orchestration reaches terminal state:
- Automatically generate both JSON and MD receipts
- Print path to receipt in terminal output

### 6. Link Interventions
When generating receipt:
- Scan intervention directories for all run_ids in orchestration
- Include intervention receipts in the task entries
- Calculate audit coverage using `runr audit` logic

## Tests
- Receipt JSON validates against schema
- Receipt MD renders correctly
- Interventions are linked
- Audit coverage delta is calculated
- Auto-generation on completion works
- `latest` alias resolves correctly

## Scope
allowlist_add:
  - src/orchestrator/receipt.ts
  - src/commands/orchestrate.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: run orchestration, verify receipt artifacts created
```
