Status: Implemented
Source: src/supervisor/verification-policy.ts, src/supervisor/runner.ts, src/verification/engine.ts

# Verification

Verification runs between IMPLEMENT and REVIEW. Commands are configured per tier in `runr.config.json`.

## Tier selection

| Tier | When selected | Commands | Notes |
| --- | --- | --- | --- |
| tier0 | Always | `verification.tier0` | Required gate for every milestone |
| tier1 | Risk trigger match, high risk level, or milestone end | `verification.tier1` | Triggered by risk signals |
| tier2 | Run end only | `verification.tier2` | Reserved for final validation |

### Selection logic

```
tier0: Always selected (baseline gate)
tier1: Selected if ANY of:
  - Risk trigger pattern matches changed files
  - Milestone has risk_level: "high"
  - is_milestone_end flag is true
tier2: Selected only if is_run_end flag is true
```

### Risk triggers

Risk triggers are glob patterns in `verification.risk_triggers` that escalate verification:

```json
{
  "risk_triggers": [
    { "name": "deps", "patterns": ["package.json", "package-lock.json"], "tier": "tier1" },
    { "name": "auth", "patterns": ["**/auth/**", "**/security/**"], "tier": "tier1" }
  ]
}
```

**Note:** Triggers configured for `tier2` are normalized to `tier1` during selection (tier2 is reserved for run-end only).

### Milestone and run-end escalation

At the final milestone, both `is_milestone_end` and `is_run_end` are set to `true`, triggering automatic tier escalation:

```typescript
const isLastMilestone = milestone_index === milestones.length - 1;
// At final milestone: tier1 (milestone_end) and tier2 (run_end) both trigger
```

This ensures comprehensive testing at the end of a run without slowing down intermediate milestones.

## Execution model
- Commands run sequentially per tier.
- Output is captured (stdout + stderr) and written to `artifacts/tests_<tier>.log`.
- The run stops immediately on the first failed command.
- A per-milestone time budget (`max_verify_time_per_milestone`, seconds) caps total verification time.

## Failure behavior
On verification failure, the supervisor retries the milestone (up to 3 attempts):

1. **First failure:** Event `verify_failed_retry` logged, transitions back to IMPLEMENT with fix instructions.
2. **Retry attempts:** Implementer receives `fixInstructions` containing the failed command, error output, and changed files.
3. **Max retries exceeded:** After 3 failed attempts, run stops with `reason=verification_failed_max_retries`.

Events on failure:
- `verification` with `ok=false` (each attempt).
- `verify_failed_retry` (retries 1-3).
- `verify_failed_max_retries` (when limit reached).
- `stop` with `reason=verification_failed_max_retries`.
- Stop memo written to `handoffs/stop.md`.

## Time budget

Each milestone has a verification time budget configured via `max_verify_time_per_milestone` (default: 600 seconds).

- Time is tracked across all tiers for a single milestone
- If time runs out mid-tier, remaining tiers are skipped with a log message
- The budget resets for each new milestone

```json
{
  "verification": {
    "max_verify_time_per_milestone": 600
  }
}
```

## Debugging verification failures

### 1. Check the verification log

```bash
cat runs/<run_id>/artifacts/tests_tier0.log
```

### 2. Review the timeline for context

```bash
node dist/cli.js report <run_id> --tail 20
```

Look for events:
- `verification` - Shows which tier failed and duration
- `verify_failed_retry` - Shows retry count and failed command
- `implement_complete` - Shows what files changed before verification

### 3. Reproduce locally

Run the same commands in the target repo:
```bash
cd <target-repo>
pnpm lint    # or whatever tier0 command
pnpm test    # or whatever tier1 command
```

### 4. Check fix instructions

On retry, the implementer receives `fixInstructions` with:
- `failedCommand` - The command that failed
- `errorOutput` - Captured stderr/stdout
- `changedFiles` - Files modified in this milestone
- `attemptNumber` - Current retry count (1-3)

## See Also
- [Guards and Scope](guards-and-scope.md) - Pre-verification scope checks
- [Run Store](run-store.md) - Where verification logs are stored
- [Configuration](configuration.md) - Setting up verification tiers
- [Run Lifecycle](run-lifecycle.md) - Where VERIFY fits in the phase flow
