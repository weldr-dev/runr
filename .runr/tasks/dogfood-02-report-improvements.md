# Dogfood Task 02: Report JSON Improvements

## Goal
Add useful fields to `runr report --json` output for better meta-agent decision making.

## Requirements
- Add `run_id` field to top level of JSON output (currently missing)
- Add `checkpoint_sha` field (from state.checkpoint_commit_sha)
- Add `milestones_total` field alongside `milestones.completed`
- Add `phase` field (current phase from state)
- Ensure JSON is valid and well-formatted

## Success Criteria
- `runr report <id> --json | jq '.run_id'` returns the run ID
- `runr report <id> --json | jq '.checkpoint_sha'` returns checkpoint SHA (or null)
- `runr report <id> --json | jq '.milestones_total'` returns total milestone count
- All existing fields preserved (no breaking changes)
- Build succeeds, existing tests pass

## Notes
- These fields already exist in state.json, just need to expose them in report
- Don't change human-readable output (non-JSON mode)
- Keep changes minimal and additive

## Files Expected
- `src/commands/report.ts` (modify reportCommand and/or DerivedKpi interface)

## Acceptance
- Demo: `runr report latest --json` shows new fields
- JSON parses correctly with jq
- All verifications pass
