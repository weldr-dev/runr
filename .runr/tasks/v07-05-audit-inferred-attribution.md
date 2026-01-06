# 05: Audit Inferred Attribution

## Goal
Reduce audit "gaps" by inferring attribution for commits within intervention ranges.

## Requirements

### 1. Inferred Attribution Logic
Update `src/audit/classifier.ts`:

When a commit falls between an intervention's `base_sha` and `head_sha`:
- Mark it as `runr_inferred` (new classification)
- Link it to the intervention's run_id
- Store the inference source: "intervention_range"

Classification priority (updated):
1. `runr_checkpoint` - Direct checkpoint receipt match
2. `runr_intervention` - Has Runr-Intervention trailer
3. `runr_inferred` - Within intervention SHA range (NEW)
4. `manual_attributed` - Has Runr-Run-Id but no receipt
5. `gap` - No attribution

### 2. Load Intervention Receipts for Range Checking
During audit:
- Scan all `.runr/runs/*/interventions/*.json`
- Build a map of `{base_sha, head_sha, run_id}` ranges
- For each commit, check if it falls within any range

### 3. Update Audit Output
New classification display:
- `✓` CHECKPOINT
- `⚡` INTERVENTION
- `~` INFERRED (new icon)
- `○` ATTRIBUTED
- `?` GAP

### 4. Add --strict Flag
`runr audit --strict`:
- Treats `runr_inferred` as gaps
- Useful for "only trust explicit attribution" mode

### 5. Update Summary Counts
```
Summary
-------
Total commits: 50
  ✓ Checkpoints:    12
  ⚡ Interventions:  3
  ~ Inferred:       10
  ○ Attributed:     5
  ? Gaps:           20

Coverage: 50% (explicit) / 70% (with inferred)
```

### 6. Tests
- Commits within intervention range classified as inferred
- --strict treats inferred as gaps
- Summary shows both coverage numbers

## Scope
allowlist_add:
  - src/audit/classifier.ts
  - src/commands/audit.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/audit

# Audit shows inferred classification
runr audit --limit 20

# Strict mode treats inferred as gaps
runr audit --strict --limit 20
```
