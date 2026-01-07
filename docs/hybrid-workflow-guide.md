# Hybrid Workflow Guide

Runr v0.7 introduces the **Hybrid Workflow** - combining productivity with auditability.

## Overview

The hybrid workflow recognizes two realities:

1. **Not everything goes through Runr** - Manual fixes, quick patches, and exploratory work happen
2. **Audit trails matter** - For compliance, review, and understanding project history

Rather than fighting against #1 to achieve #2, Runr's hybrid workflow embraces both.

## Two Modes

### Flow Mode (Default)

**Productivity-first.** Get work done, record what you can.

- `runr intervene` allowed freely
- `--amend-last` allowed for clean commit history
- Manual merges to integration branch allowed
- Receipts created but not blocking
- Lower friction, more flexibility

Best for:
- Solo development
- Early-stage projects
- Rapid prototyping
- Teams new to Runr

### Ledger Mode

**Audit-first.** Everything goes on the record.

- `runr intervene` requires explicit `--reason`
- `--amend-last` blocked (use `--commit` instead)
- All merges should go through `runr submit`
- Higher audit coverage expectations
- Stricter but more traceable

Best for:
- Production codebases
- Compliance-sensitive projects
- Teams requiring audit trails
- Enterprise deployments

## Switching Modes

```bash
# View current mode
runr mode

# Switch to ledger mode
runr mode ledger

# Switch to flow mode
runr mode flow
```

Or set in config:
```json
{
  "workflow": {
    "mode": "ledger"
  }
}
```

## Key Commands

### runr intervene

Records manual work done outside Runr's normal flow.

```bash
# Basic intervention
runr intervene <run_id> --reason manual_fix --note "Fixed import issue"

# With commands to run and capture
runr intervene <run_id> --reason review_loop --note "Fixed TS errors" \
  --cmd "npm run typecheck" --cmd "npm test"

# Retroactive attribution (what you did since specific commit)
runr intervene <run_id> --reason scope_violation --note "Manual changes" \
  --since abc123

# Create commit with Runr trailers
runr intervene <run_id> --reason manual_fix --note "Hotfix" \
  --commit "Fix production bug"
```

**Reasons:**
- `review_loop` - Fixing issues from review cycle
- `stalled_timeout` - Recovering from stalled run
- `verification_failed` - Fixing verification failures
- `scope_violation` - Handling out-of-scope changes
- `manual_fix` - General manual work
- `other` - Catch-all

### runr audit

View project history classified by provenance.

```bash
# View last 50 commits
runr audit

# Custom range
runr audit --range main~100..main

# JSON output for dashboards
runr audit --coverage --json

# CI mode: fail if coverage below threshold
runr audit --fail-under 60
```

**Classifications:**
- `CHECKPOINT` - Runr checkpoint with receipt
- `INTERVENTION` - Recorded via `runr intervene`
- `INFERRED` - Within intervention SHA range
- `ATTRIBUTED` - Has Runr trailers but no receipt
- `GAP` - No attribution (audit gap)

## Coverage Targets

| Stage | Explicit Coverage | With Inferred |
|-------|------------------|---------------|
| Starting out | 20%+ | 40%+ |
| Established | 50%+ | 70%+ |
| Production | 80%+ | 90%+ |

## CI Integration

```yaml
# GitHub Actions example
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check audit coverage
        run: |
          runr audit --fail-under 60 --json > audit-report.json

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: audit-report
          path: audit-report.json
```

## Best Practices

### 1. Record as you go

Don't wait until the end. Record interventions when they happen:
```bash
# Just fixed something manually? Record it immediately
runr intervene latest --reason manual_fix --note "Fixed flaky test"
```

### 2. Use meaningful notes

The note is your future self's context:
```bash
# Good
--note "Fixed circular import between auth and user modules"

# Not helpful
--note "fixed stuff"
```

### 3. Link to runs when possible

Even manual work relates to a Runr task:
```bash
runr intervene 20260106120000 --reason review_loop \
  --note "Reviewer requested these changes"
```

### 4. Review audit regularly

```bash
# Weekly: check for gaps
runr audit --limit 100

# Before release: ensure coverage
runr audit --range last-release..HEAD --fail-under 80
```

### 5. Use --since for retroactive attribution

Already made commits without attribution? Use `--since`:
```bash
runr intervene <run_id> --reason manual_fix \
  --note "Retroactively attributing recent work" \
  --since <commit_before_your_changes>
```

## Git Hooks (Optional)

Automatically enforce provenance discipline:

```bash
runr hooks install
```

**In Flow mode:** Warns on provenance gaps but allows commit
**In Ledger mode:** Blocks commits without Runr attribution

The hook checks for:
- `Runr-Run-Id:` trailer (from checkpoint commits)
- `Runr-Intervention:` trailer (from `runr intervene --commit`)
- `Runr-Checkpoint:` trailer (from checkpoint commits)

If a stopped run exists and you commit without trailers, the hook will either warn (Flow) or block (Ledger).

Override in emergencies: `RUNR_ALLOW_GAP=1 git commit ...`

To uninstall: `runr hooks uninstall`

## Troubleshooting

### "Too many gaps in audit"

1. Start recording interventions going forward
2. Use `--since` for recent unattributed work
3. Consider lowering coverage targets initially

### "Ledger mode blocking my workflow"

1. Use `--force` sparingly when needed
2. Consider switching to Flow mode during rapid development
3. Switch to Ledger mode for release cycles

### "Run stopped with review_loop_detected"

The review loop diagnostic will suggest specific actions:
```bash
runr status <run_id>
# Shows: what reviewer requested, what evidence was missing
```

## See Also

- [Intervention Patterns](examples/intervention-patterns.md)
- [CLI Reference](cli.md)
- [Safety Guide](safety-guide.md)
