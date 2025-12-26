# Benchmark Results

Generated: 2025-12-26T00:28:35.706Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| engine-bootstrap-ctx-off | 20251226001354 | stopped | implement_blocked | 7m8s | 0/4 | unknown/unknown | 3/0 | 14 | ✓ |
| engine-bootstrap-ctx-on | 20251226002113 | running | - | - | 0/5 | unknown/unknown | 5/0 | 22 | ✓ |

## Diagnosis Summary

### Stop Diagnoses by Category

| Diagnosis | Count | Scenarios |
|-----------|-------|-----------|
| unknown | 1 | engine-bootstrap-ctx-off |

### Per-Run Diagnosis

| Scenario | Run ID | Diagnosis | Confidence | Next Action |
|----------|--------|-----------|------------|-------------|
| engine-bootstrap-ctx-off | 20251226001354 | unknown | 50% | `cat runs/20251226001354/timeline.jsonl |...` |

## Detailed Results

### engine-bootstrap-ctx-off

- **Run ID**: 20251226001354
- **Outcome**: stopped
- **Stop Reason**: implement_blocked
- **Diagnosis**: unknown (50%)
- **Duration**: 7m8s
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 3 attempts, 0 retries, 11s
- **Ticks Used**: 14 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-bootstrap-ctx-on

- **Run ID**: 20251226002113
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/5
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 5 attempts, 0 retries, 20s
- **Ticks Used**: 22 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,diagnosis,diagnosis_confidence,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
engine-bootstrap-ctx-off,20251226001354,stopped,implement_blocked,unknown,0.5,428,0,4,unknown,unknown,3,0,11,14,false,0,0,0
engine-bootstrap-ctx-on,20251226002113,running,,,,,0,5,unknown,unknown,5,0,20,22,false,0,0,0
```