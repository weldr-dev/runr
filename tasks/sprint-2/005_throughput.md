# Task: Throughput Optimization

## Goal
Maximize speed once context and fast-path are in place.
Reduce wall-clock time through parallelism and batching.

## Success Contract

- [ ] Reduce average worker calls per milestone
- [ ] Reduce verify wall-clock by 30%+ (via parallel execution)
- [ ] No increase in failure rate
- [ ] Command batching reduces round-trips

## Optimization Strategies

### 1. Command Batching
Instead of:
```
run: npm run lint
run: npm run typecheck
run: npm run test
```

Do:
```
run: npm run lint && npm run typecheck && npm run test
```

Or generate a temp script that runs all, captures output per command.

### 2. Parallel Verification
When safe (no side effects between commands):
- Run lint + typecheck in parallel
- Run independent test suites in parallel
- Aggregate results

Config:
```json
{
  "verification": {
    "parallel": true,
    "parallel_groups": [
      ["lint", "typecheck"],
      ["test:unit", "test:integration"]
    ]
  }
}
```

### 3. Model Tiering
Use cheaper/faster models for low-stakes phases:

| Phase | Model | Rationale |
|-------|-------|-----------|
| PLAN | claude-haiku | Planning is structured, fast is fine |
| IMPLEMENT | claude-sonnet | Needs reasoning + code generation |
| REVIEW | claude-sonnet | Critical quality gate |

Config:
```json
{
  "phases": {
    "plan": { "worker": "claude", "model": "haiku" },
    "implement": { "worker": "claude", "model": "sonnet" },
    "review": { "worker": "claude", "model": "sonnet" }
  }
}
```

### 4. Incremental Verification
Don't re-run all tests on small changes:
- Track which files changed
- Run only affected tests (if test runner supports it)
- Full suite only on final checkpoint

## Implementation Milestones

### Milestone 1: Command Batching
- Group sequential commands into single shell execution
- Preserve individual command output/status
- Configurable batch size

### Milestone 2: Parallel Verify
- Run independent verify commands in parallel
- Aggregate pass/fail status
- Timeout handling for parallel jobs

### Milestone 3: Model Tiering Config
- Extend phases config with model selection
- Pass model hints to worker adapters
- Measure token cost savings

### Milestone 4: Incremental Verify (stretch)
- Track file → test mapping
- Run minimal test set for changed files
- Fall back to full suite on uncertainty

## Risk Level
Medium - parallelism introduces race conditions, batching changes error semantics

## Guardrails
- Parallel mode opt-in initially
- Clear logging of what ran in parallel
- Fallback to sequential on parallel failures
- Test thoroughly on monorepo scenarios
