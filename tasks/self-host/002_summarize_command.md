# Task: Add summarize command that writes summary.json

Create a new CLI command that derives KPIs from a run and writes a compact JSON summary file.

## Goal

After any run, operators should be able to generate `runs/<id>/summary.json` containing all key metrics in a machine-readable format. This enables:
- Automated soak test analysis
- Regression detection across runs
- Dashboard integration without parsing timeline

## Implementation

### New Command: `summarize`

Location: `src/commands/summarize.ts`

```bash
# Summarize a specific run
node dist/cli.js summarize <runId>

# Summarize latest run
node dist/cli.js summarize latest
```

### Output: `summary.json`

Write to `runs/<runId>/summary.json` with this structure:

```json
{
  "run_id": "20251225120000",
  "outcome": "complete" | "stopped" | "running",
  "stop_reason": "complete" | "guard_violation" | "stalled_timeout" | null,
  "duration_seconds": 1234,
  "milestones": {
    "total": 4,
    "completed": 4
  },
  "worker_calls": {
    "claude": 5,
    "codex": 3
  },
  "verification": {
    "attempts": 4,
    "retries": 0,
    "duration_ms": 5000
  },
  "reliability": {
    "clean": true,
    "infra_retries": 0,
    "fallback_count": 0,
    "stalls_triggered": 0,
    "late_results_ignored": 0
  },
  "config": {
    "worktree_enabled": true,
    "time_budget_minutes": 30,
    "max_ticks": 20
  },
  "timestamps": {
    "started_at": "2025-12-25T10:00:00.000Z",
    "ended_at": "2025-12-25T10:20:00.000Z"
  }
}
```

### Implementation Details

1. **Reuse existing KPI logic** from `src/commands/report.ts`:
   - `computeKpiFromEvents()` already derives most metrics
   - Extract shared logic into a helper if needed

2. **Read inputs**:
   - `timeline.jsonl` - for events and timestamps
   - `state.json` - for phase, milestones, stop_reason
   - `config.snapshot.json` - for worktree info, time budget

3. **Compute duration**:
   - From first event timestamp to last event timestamp
   - Or use `started_at`/`updated_at` from state.json

4. **Write output**:
   - Use `RunStore.writeArtifact()` or direct fs.writeFileSync
   - Overwrite if exists (idempotent)

### CLI Integration

**Note**: `src/cli.ts` is in the denylist (boot chain protection). Create the command implementation only. The CLI wiring will be done manually after verification.

Export from `src/commands/summarize.ts`:
```typescript
export async function summarizeCommand(options: { runId: string }): Promise<void>
```

## Constraints

- **Read-only derivation**: Only read existing files, write only summary.json
- **Deterministic**: Same inputs → same output
- **No boot chain changes**: Do not modify supervisor, workers, or config loaders
- **Reuse patterns**: Follow existing command structure in `src/commands/`

## Verification

- `pnpm build` passes
- `pnpm test` passes (add tests if time permits)
- Manual test: run `summarize latest` after a completed run, verify summary.json exists with expected fields

## Acceptance Criteria

1. `node dist/cli.js summarize <runId>` writes `runs/<runId>/summary.json`
2. `node dist/cli.js summarize latest` resolves to most recent run
3. Summary includes: outcome, duration, milestones, worker_calls, verification, reliability, config flags
4. File is valid JSON and can be parsed by external tools
