# Agent Development Guide

## Project: agent-framework

Project: agent-framework

## Workflow: Solo Dev (dev → main)

This project uses the **solo** workflow:

- **All work lands on `dev`** (or feature branches)
- Runr creates verified checkpoints with full test evidence
- Submit verified changes to `main` via: **bundle → dry-run → submit → (git push)**
- **Use wrappers, not manual steps**

**Key principle**: Only trustable, verified changes land on `main`.

## Verification Requirements

All checkpoints must pass verification before submit:

**Tier 1 (build)**:
- `npm run build`

**Tier 2 (tests)**:
- `npm run test`

## Working with Runr

### Create a verified checkpoint

```bash
runr run --task .runr/tasks/my-task.md --worktree
```

This creates a checkpoint with full verification evidence.

### Submit verified changes to main

**Preferred (uses wrapper for safety):**
```bash
./scripts/dogfood-submit.sh <checkpoint-id> --to main
```

**Manual (escape hatch only):**
```bash
runr submit <checkpoint-id> --to main
```

Both cherry-pick the verified checkpoint to `main` (requires clean tree + verification evidence).

### View bundle/evidence

```bash
runr bundle <checkpoint-id> --output /tmp/bundle-<checkpoint-id>.md
```

Shows the complete change bundle with verification results.

## Guidelines for Agents

1. **Read first**: Always read files before modifying
2. **Verify incrementally**: Don't wait until the end to verify
3. **Keep changes focused**: Smaller checkpoints are easier to review and submit
4. **Trust verification**: If verification passes, the change is trustable
5. **Document decisions**: Update this file or task files with important context

## Integration Safety Rules

**When to use wrapper vs manual:**
- **Wrapper (preferred):** If your project has a submit wrapper script, use it for automated safety checks
- **Manual (escape hatch):** Use `runr submit` directly for quick iterations or when no wrapper exists

**If any invariant breaks during submit:**
- Stop immediately
- Add regression test to prevent recurrence
- Fix the invariant violation before continuing

**Optional friction logging:**
- If something costs >2 minutes or happens twice, consider logging it for team discussion

## Project Structure

See the existing codebase for structure. Runr automatically detects verification commands from your project setup.
