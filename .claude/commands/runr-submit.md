---
description: Submit verified checkpoint to integration branch
---

# Submit Verified Checkpoint

Cherry-picks a verified checkpoint to the integration branch.

## Usage

**Always dry-run first:**
```bash
runr submit <run_id> --to dev --dry-run
```

**Then submit:**
```bash
runr submit <run_id> --to dev
```

**Optional: push to origin:**
```bash
runr submit <run_id> --to dev --push
```

## Requirements

- Checkpoint must exist
- Verification evidence must be present
- Working tree must be clean
- Target branch must exist

## If it fails

Check the error:
- `dirty_tree` → commit or stash changes
- `verification_missing` → run wasn't verified
- `submit_conflict` → manual resolution needed
- `target_branch_missing` → create branch first

## Recovery

If submit is interrupted, the command always restores your starting branch.
Check `git status` and retry.

## Workflow

This project uses the **solo** workflow:
- Integration branch: `dev`
- Release branch: `main`
- Only verified checkpoints can be submitted
