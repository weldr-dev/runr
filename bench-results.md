# Benchmark Results

Generated: 2025-12-25T18:32:11.794Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| verify-stress-deckbuilder | 20251225182042 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| impl-churn-engine | 20251225182409 | running | - | - | 0/4 | unknown/unknown | 4/0 | 18 | ✓ |
| noop-strict | 20251225183051 | running | - | - | 0/2 | unknown/unknown | 1/0 | 5 | ⏱️ |

## Detailed Results

### verify-stress-deckbuilder

- **Run ID**: 20251225182042
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 12s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### impl-churn-engine

- **Run ID**: 20251225182409
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 24s
- **Ticks Used**: 18 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### noop-strict

- **Run ID**: 20251225183051
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 1 attempts, 0 retries, 6s
- **Ticks Used**: 5 (max hit: true)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
verify-stress-deckbuilder,20251225182042,running,,,0,2,unknown,unknown,2,0,12,10,false,0,0,0
impl-churn-engine,20251225182409,running,,,0,4,unknown,unknown,4,0,24,18,false,0,0,0
noop-strict,20251225183051,running,,,0,2,unknown,unknown,1,0,6,5,true,0,0,0
```