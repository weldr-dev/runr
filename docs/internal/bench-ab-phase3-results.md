# Benchmark Results

Generated: 2025-12-26T01:10:07.814Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| ab-A-r1-off | 20251226002958 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-A-r1-on | 20251226003311 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-B-r1-off | 20251226003702 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-B-r1-on | 20251226004007 | running | - | - | 0/3 | unknown/unknown | 3/0 | 14 | ✓ |
| ab-A-r2-off | 20251226004317 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-A-r2-on | 20251226004706 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-B-r2-off | 20251226005016 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-B-r2-on | 20251226005348 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-A-r3-off | 20251226005628 | running | - | - | 0/3 | unknown/unknown | 3/0 | 14 | ✓ |
| ab-A-r3-on | 20251226010121 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| ab-B-r3-off | 20251226010438 | stopped | implement_blocked | 2m42s | 0/2 | unknown/unknown | 1/0 | 6 | ✓ |
| ab-B-r3-on | 20251226010731 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |

## Diagnosis Summary

### Stop Diagnoses by Category

| Diagnosis | Count | Scenarios |
|-----------|-------|-----------|
| unknown | 1 | ab-B-r3-off |

### Per-Run Diagnosis

| Scenario | Run ID | Diagnosis | Confidence | Next Action |
|----------|--------|-----------|------------|-------------|
| ab-B-r3-off | 20251226010438 | unknown | 50% | `cat runs/20251226010438/timeline.jsonl |...` |

## Detailed Results

### ab-A-r1-off

- **Run ID**: 20251226002958
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 12s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-A-r1-on

- **Run ID**: 20251226003311
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 11s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r1-off

- **Run ID**: 20251226003702
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 12s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r1-on

- **Run ID**: 20251226004007
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/3
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 3 attempts, 0 retries, 16s
- **Ticks Used**: 14 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-A-r2-off

- **Run ID**: 20251226004317
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 18s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-A-r2-on

- **Run ID**: 20251226004706
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 11s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r2-off

- **Run ID**: 20251226005016
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 15s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r2-on

- **Run ID**: 20251226005348
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 11s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-A-r3-off

- **Run ID**: 20251226005628
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/3
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 3 attempts, 0 retries, 16s
- **Ticks Used**: 14 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-A-r3-on

- **Run ID**: 20251226010121
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 12s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r3-off

- **Run ID**: 20251226010438
- **Outcome**: stopped
- **Stop Reason**: implement_blocked
- **Diagnosis**: unknown (50%)
- **Duration**: 2m42s
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 1 attempts, 0 retries, 7s
- **Ticks Used**: 6 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### ab-B-r3-on

- **Run ID**: 20251226010731
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 11s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,diagnosis,diagnosis_confidence,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
ab-A-r1-off,20251226002958,running,,,,,0,2,unknown,unknown,2,0,12,10,false,0,0,0
ab-A-r1-on,20251226003311,running,,,,,0,2,unknown,unknown,2,0,11,10,false,0,0,0
ab-B-r1-off,20251226003702,running,,,,,0,2,unknown,unknown,2,0,12,10,false,0,0,0
ab-B-r1-on,20251226004007,running,,,,,0,3,unknown,unknown,3,0,16,14,false,0,0,0
ab-A-r2-off,20251226004317,running,,,,,0,2,unknown,unknown,2,0,18,10,false,0,0,0
ab-A-r2-on,20251226004706,running,,,,,0,2,unknown,unknown,2,0,11,10,false,0,0,0
ab-B-r2-off,20251226005016,running,,,,,0,2,unknown,unknown,2,0,15,10,false,0,0,0
ab-B-r2-on,20251226005348,running,,,,,0,2,unknown,unknown,2,0,11,10,false,0,0,0
ab-A-r3-off,20251226005628,running,,,,,0,3,unknown,unknown,3,0,16,14,false,0,0,0
ab-A-r3-on,20251226010121,running,,,,,0,2,unknown,unknown,2,0,12,10,false,0,0,0
ab-B-r3-off,20251226010438,stopped,implement_blocked,unknown,0.5,162,0,2,unknown,unknown,1,0,7,6,false,0,0,0
ab-B-r3-on,20251226010731,running,,,,,0,2,unknown,unknown,2,0,11,10,false,0,0,0
```