# Dogfood Task 01: Polish Init Command

## Goal
Improve `runr init` detection and UX based on real-world usage patterns.

## Requirements
- Add Python project detection (pytest, poetry, pyproject.toml)
- Improve output messaging when verification commands are missing
- Add `--interactive` flag skeleton (stub for now, doesn't need full implementation)
- Update help text to be clearer

## Success Criteria
- `runr init` in a Python project detects pytest/poetry/pyproject.toml
- If no verify commands detected, message suggests next steps clearly
- `runr init --help` shows all flags with clear descriptions
- All existing tests pass (npm test)
- Build succeeds (npm run build)

## Notes
- Keep scope tight: detection logic only, no interactive prompts yet
- Test detection on at least one Python repo (can be minimal)
- Don't break existing Node/TS detection

## Files Expected
- `src/commands/init.ts` (modify detection logic)
- Possibly `src/commands/init.ts` tests if they exist

## Acceptance
- Demo: `runr init --print` on a Python project shows pytest in tier2
- Demo: `runr init` on empty repo shows helpful message
- All verifications pass
