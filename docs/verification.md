Status: Partial
Source: src/supervisor/verification-policy.ts, src/supervisor/runner.ts, src/verification/engine.ts

# Verification

Verification runs between IMPLEMENT and REVIEW. Commands are configured per tier in `agent.config.json`.

## Tier selection (current behavior)
| Tier | When selected | Commands | Notes |
| --- | --- | --- | --- |
| tier0 | always | `verification.tier0` | Required gate for every milestone |
| tier1 | risk trigger match or high risk | `verification.tier1` | Optional, based on risk signals |
| tier2 | run end (not currently selected) | `verification.tier2` | Configured but unused in the loop |

Risk triggers come from `verification.risk_triggers` and match changed files via glob patterns.
Risk triggers configured for `tier2` are normalized to `tier1` during selection.

## Execution model
- Commands run sequentially per tier.
- Output is captured (stdout + stderr) and written to `artifacts/tests_<tier>.log`.
- The run stops immediately on the first failed command.
- A per-milestone time budget (`max_verify_time_per_milestone`, seconds) caps total verification time.

## Failure behavior
On failure:
- Event: `verification` with `ok=false`.
- Event: `stop` with `reason=verification_failed`.
- Stop memo written to `handoffs/stop.md`.
