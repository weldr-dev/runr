# 06: Audit Coverage and Thresholds

## Goal
Make audit actionable with coverage reporting and CI-friendly exit codes.

## Requirements

### 1. Add --coverage Flag
`runr audit --coverage`:
- Output JSON coverage report suitable for dashboards
```json
{
  "range": "main~50..main",
  "timestamp": "2026-01-06T12:00:00Z",
  "total_commits": 50,
  "classifications": {
    "runr_checkpoint": 12,
    "runr_intervention": 3,
    "runr_inferred": 10,
    "manual_attributed": 5,
    "gap": 20
  },
  "coverage": {
    "explicit": 0.40,   // (checkpoint + intervention) / total
    "with_inferred": 0.50,  // (checkpoint + intervention + inferred) / total
    "with_attributed": 0.60  // (checkpoint + intervention + inferred + attributed) / total
  },
  "gaps": [
    {"sha": "abc123", "subject": "misc cleanup"},
    ...
  ],
  "runs_referenced": ["20260106110000", "20260106120000"]
}
```

### 2. Add --fail-under Flag
`runr audit --fail-under <pct>`:
- Exit code 1 if explicit coverage is below threshold
- Useful for CI enforcement

Example:
```bash
runr audit --fail-under 80  # Fail if coverage < 80%
```

### 3. Add --fail-under-with-inferred Flag
`runr audit --fail-under-with-inferred <pct>`:
- Uses coverage including inferred attribution
- Less strict than explicit-only

### 4. Coverage Calculation
```
explicit_coverage = (checkpoints + interventions) / total
inferred_coverage = (checkpoints + interventions + inferred) / total
full_coverage = (checkpoints + interventions + inferred + attributed) / total
```

### 5. Human-Readable Coverage Output
When not using --json:
```
Coverage Report
---------------
Explicit coverage:     40% (20/50)
With inferred:         50% (25/50)
Full (with attributed): 60% (30/50)

Threshold: 80%
Status: FAIL (explicit coverage 40% < 80%)
```

### 6. CI Integration Docs
Add to help text:
```
CI Usage:
  runr audit --fail-under 60 --json > audit-report.json
  # Exit code 0 if coverage >= 60%, 1 otherwise
```

### 7. Tests
- --coverage outputs valid JSON
- --fail-under exits 1 when below threshold
- --fail-under exits 0 when at or above threshold
- Coverage percentages calculated correctly

## Scope
allowlist_add:
  - src/commands/audit.ts
  - src/audit/classifier.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/audit

# Coverage JSON output
runr audit --coverage | jq .coverage

# Threshold check (will likely fail since we have gaps)
runr audit --fail-under 10 || echo "Failed threshold check"
```
