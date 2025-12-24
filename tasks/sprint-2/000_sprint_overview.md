# Sprint 2: High-Throughput Autonomous Worker

## Vision
Turn this from a reliable runtime into a **high-throughput autonomous worker** worth using every day.

Optimize for:
- **Minimum wall-clock time** to a verified outcome
- **Minimum human attention** required
- **Maximum autonomy** within explicit boundaries
- **Clear receipts** when it can't proceed

## North Star Metric
**Time-to-Verified-Checkpoint (TVc)** = minutes from start → verified commit

Secondary: **Human touches** per task (target: ~0 for small/medium tasks)

## Task Categories

| Category | Duration | Examples |
|----------|----------|----------|
| Small | 2-8 min | tweak UI, refactor file, add test, fix lint |
| Medium | 15-45 min | feature slice with tests, verify gates |

## Sprint Tasks (in order)

### 1. KPI Scoreboard ⭐ [001_kpi_scoreboard.md]
**Unlock:** Measurement. Can't optimize blind.
- Phase timing, worker metrics, token counts
- `report` shows KPIs, `compare` diffs runs
- Foundation for all optimization work

### 2. Context Packer ⭐ [002_context_packer.md]
**Unlock:** Speed + autonomy via smarter context.
- RepoMap indexing (exports, tests, hotspots)
- Relevant file retrieval (top-K scoring)
- 40%+ token reduction target

### 3. Fast Path Mode [003_fast_path.md]
**Unlock:** Pleasant daily use for small tasks.
- Skip PLAN→REVIEW ceremony when safe
- Auto-detect: small diff, within allowlist, tests exist
- 30-60% time reduction for small tasks

### 4. Adaptive Autonomy [004_adaptive_autonomy.md]
**Unlock:** Zero-touch task completion.
- Auto-retry verify failures
- Auto-fix lint/test within scope
- Clear "I stopped because..." reasons

### 5. Throughput Optimization [005_throughput.md]
**Unlock:** Raw speed at scale.
- Command batching
- Parallel verification
- Model tiering (cheap for plan, strong for review)

## Dependencies

```
┌─────────────┐
│ 1. KPI      │ ← Foundation (measure everything)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 2. Context  │ ← Biggest lever for speed + autonomy
└──────┬──────┘
       │
       ├──────────────┐
       ▼              ▼
┌─────────────┐ ┌─────────────┐
│ 3. Fast Path│ │ 4. Autonomy │ ← Can parallelize
└──────┬──────┘ └──────┬──────┘
       │              │
       └──────┬───────┘
              ▼
       ┌─────────────┐
       │ 5. Throughput│ ← Final optimization pass
       └─────────────┘
```

## Success Criteria (Sprint Complete)

- [ ] TVc for small tasks < 5 minutes (currently ~10-15?)
- [ ] TVc for medium tasks < 20 minutes (currently ~30-45?)
- [ ] Human touches = 0 for 80% of small tasks
- [ ] Token usage down 40% from baseline
- [ ] All metrics visible in `report` output

## How to Run This Sprint

1. Establish baseline KPIs with current runtime
2. Implement KPI scoreboard
3. Measure baseline properly
4. Implement Context Packer
5. Measure improvement
6. Implement Fast Path + Autonomy (can parallelize)
7. Measure improvement
8. Final throughput optimizations
9. Ship sprint summary with before/after comparisons
