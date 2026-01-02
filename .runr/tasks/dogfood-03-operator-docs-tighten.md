# Dogfood Task 03: Tighten Operator Docs

## Goal
Improve RUNR_OPERATOR.md with clearer failure recovery examples and updated command reference.

## Requirements
- Add "Failure Recovery Examples" section showing 3 common scenarios:
  1. Verification failed → resume workflow
  2. Guard violation → how to diagnose and fix
  3. Stuck run → how to use watch --auto-resume
- Update command palette to include `runr init` and `runr watch`
- Add expected JSON output examples for `runr report --json`
- Fix any outdated command syntax

## Success Criteria
- RUNR_OPERATOR.md has "Failure Recovery Examples" section with 3 scenarios
- Command palette includes all Day 2 commands
- Example JSON outputs are accurate (match current schema)
- No broken links or references
- Markdown lints cleanly (no syntax errors)

## Notes
- Use real stop_reason values from codebase
- Keep examples short and copy-pasteable
- This is documentation only, no code changes

## Files Expected
- `RUNR_OPERATOR.md` (update existing file)

## Acceptance
- Read through updated doc, verify it's clear
- Examples are accurate and actionable
- No markdown syntax errors
