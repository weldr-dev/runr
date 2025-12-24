# Task: Adaptive Autonomy Policy

## Goal
Reduce human touches to zero for fixable issues.
Give the agent controlled authority to make decisions.

## Success Contract

- [ ] Autonomy policy config with explicit rules
- [ ] Auto-approve verify retries up to N (default: 3)
- [ ] Auto-fix lint/test failures if changes remain in scope
- [ ] Auto-create tests when modifying behavior (optional)
- [ ] Clear "I stopped because..." reasons when it halts
- [ ] Zero human touches for common "fix+tests" tasks

## Autonomy Policy Schema

```json
{
  "autonomy": {
    "verify_auto_retry": 3,
    "auto_fix_lint": true,
    "auto_fix_tests": true,
    "auto_create_tests": false,
    "max_auto_iterations": 5,
    "stop_conditions": [
      "requires_product_decision",
      "scope_violation",
      "uncertainty_high",
      "changes_exceed_threshold"
    ]
  }
}
```

## Implementation Milestones

### Milestone 1: Autonomy Config Schema
- Add autonomy section to agent.config.json schema
- Defaults that are safe but useful
- Per-run override via CLI flags

### Milestone 2: Auto-Retry Logic
- Verify failures auto-retry without human input
- Track retry count, stop at limit
- Emit clear events for each retry

### Milestone 3: Auto-Fix Integration
- Detect fixable failures (lint, type errors, test failures)
- Re-run IMPLEMENT with fix instructions
- Stay within scope, abort if fix expands scope

### Milestone 4: Stop Condition Clarity
- Clear stop reasons in stop memo
- Structured "blocked_reason" in state
- Actionable next step suggestions

## Risk Level
Medium-High - more autonomy means more potential for runaway

## Guardrails
- Hard limit on auto-iterations (default: 5)
- Scope violations ALWAYS stop
- Lockfile changes ALWAYS require human approval
- Clear audit trail of all autonomous decisions
