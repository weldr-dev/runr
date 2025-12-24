# Task: Runtime Profiler + KPI Scoreboard

## Goal
Get hard numbers per phase and per worker call. You can't optimize blind.

## North Star Metric
**Time-to-Verified-Checkpoint (TVc)** = minutes from start → verified commit

## Success Contract

- [ ] Each run emits `kpi.json` in the run store with:
  - Wall time by phase (PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT)
  - Worker call count by type (claude/codex) and phase
  - Token/bytes estimate (input + output per call)
  - Verify retries count
  - Commands executed count
  - Files touched count
  - Total milestones completed vs planned
- [ ] `report` command shows 10-line KPI summary at top
- [ ] New `compare` subcommand: diff two runs to see where time went
- [ ] Adds <2% overhead (measured)

## Implementation Milestones

### Milestone 1: Timing Infrastructure
**Goal:** Add phase timing to RunState and emit timing events

**Files expected:**
- `src/types/schemas.ts` - add `PhaseTimings` type
- `src/supervisor/runner.ts` - record phase start/end times
- `src/store/run-store.ts` - add `writeKpi()` method

**Done checks:**
- Each phase emits `phase_start` and `phase_end` events with timestamps
- RunState tracks cumulative phase timings
- `kpi.json` written at FINALIZE

### Milestone 2: Worker Call Metrics
**Goal:** Track token estimates and call metadata per worker invocation

**Files expected:**
- `src/workers/claude.ts` - return token estimates
- `src/workers/codex.ts` - return token estimates
- `src/supervisor/runner.ts` - accumulate worker metrics
- `src/types/schemas.ts` - extend `WorkerStats` with token counts

**Done checks:**
- Each worker call logs input/output byte counts
- Token estimates based on char count / 4 (rough)
- worker_stats includes `tokens_in`, `tokens_out` totals

### Milestone 3: KPI Report Integration
**Goal:** Surface KPIs in report command and add compare functionality

**Files expected:**
- `src/commands/report.ts` - add KPI summary section
- `src/commands/compare.ts` - new command to diff runs
- `src/cli.ts` - register compare command

**Done checks:**
- `agent-run report <run-id>` shows KPI summary first
- `agent-run compare <run-a> <run-b>` shows side-by-side timing diff
- Compare highlights which phases took longer

## KPI Schema (draft)

```typescript
interface RunKpi {
  run_id: string;
  started_at: string;
  ended_at: string;
  total_duration_ms: number;
  outcome: 'complete' | 'stopped' | 'error';

  phases: {
    [phase: string]: {
      duration_ms: number;
      attempts: number;
    };
  };

  workers: {
    claude: WorkerMetrics;
    codex: WorkerMetrics;
  };

  verification: {
    commands_run: number;
    retries: number;
    tiers_executed: string[];
  };

  changes: {
    files_touched: number;
    lines_added: number;
    lines_removed: number;
  };

  milestones: {
    planned: number;
    completed: number;
  };
}

interface WorkerMetrics {
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
  by_phase: {
    plan: { calls: number; tokens_in: number; tokens_out: number };
    implement: { calls: number; tokens_in: number; tokens_out: number };
    review: { calls: number; tokens_in: number; tokens_out: number };
  };
}
```

## Guardrails
- No new dependencies for basic timing
- KPI collection must not affect run outcome
- Graceful degradation if metrics unavailable

## Risk Level
Low - purely additive, no changes to core execution flow
