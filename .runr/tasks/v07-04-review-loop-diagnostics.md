# 04: Review Loop Diagnostics

## Goal
When `review_loop_detected`, Runr prints exactly what's unmet and how to fix it.

## Requirements

### 1. Create Stop Diagnostics Module
Create `src/diagnostics/stop-explainer.ts`:

```typescript
interface StopDiagnostics {
  stop_reason: string;
  explanation: string;

  // For review_loop_detected
  loop_count?: number;
  last_review_requests?: string[];  // What reviewer asked for
  last_evidence_provided?: string[];  // What implementer provided
  unmet_checks?: string[];  // Specific checks that weren't satisfied

  // For stalled_timeout
  last_activity_at?: string;
  time_since_activity_ms?: number;

  // Actionable next steps
  suggested_actions: {
    command?: string;  // CLI command to run
    edit?: string;     // File to edit
    description: string;
  }[];
}
```

### 2. Extract Review Loop Context from Timeline
Parse timeline.jsonl to extract:
- Last N `worker_response` events from reviewer
- Last N `worker_response` events from implementer
- Done checks from task (if structured)
- Evidence pointers mentioned

### 3. Generate Unmet Checks List
Compare:
- What reviewer asked for (from review responses)
- What implementer provided (from evidence/artifacts)
- Produce list of unmet checks:
  - "typecheck_output_missing"
  - "test_output_missing"
  - "file_not_created: src/foo.ts"
  - etc.

### 4. Write Diagnostics File
On STOPPED state:
- Write `.runr/runs/<id>/stop_diagnostics.json`
- Include all structured diagnostics

### 5. Update Console Output
When run stops:
```
Run 20260106120000 STOPPED: review_loop_detected

Diagnostics:
  Loop count: 3
  Last reviewer request: "Include npm run typecheck output in evidence"

  Unmet checks:
    - typecheck_output_missing
    - test_coverage_not_reported

  Suggested actions:
    1. Run: npm run typecheck 2>&1 | tee .runr/runs/20260106120000/typecheck.log
    2. Resume: runr resume 20260106120000

    Or use intervention:
       runr intervene 20260106120000 --reason review_loop \
         --note "Ran typecheck manually" \
         --cmd "npm run typecheck"
```

### 6. Tests
- Given synthetic timeline with review loop, diagnostics extracted correctly
- stop_diagnostics.json written with correct structure
- Suggested actions include relevant commands

## Scope
allowlist_add:
  - src/diagnostics/**
  - src/supervisor/runner.ts
  - src/commands/report.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/diagnostics

# Diagnostics file written on stop
# (requires a stopped run to verify manually)
ls .runr/runs/*/stop_diagnostics.json
```
