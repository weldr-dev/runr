---
description: Generate Runr evidence bundle for review
---

# Bundle Evidence

Generates a deterministic Markdown evidence packet for a Runr run.

## Usage

```bash
runr bundle <run_id> --output /tmp/bundle-<run_id>.md
```

## What's in the bundle?

- Checkpoint metadata
- Milestone progression
- Verification evidence
- Diff statistics
- Timeline summary

## When to use

- Before submitting verified work
- When debugging why verification failed
- When providing audit trail to team

## Example

```bash
# After a successful run
runr bundle abc123 --output /tmp/bundle-abc123.md

# Review the bundle
cat /tmp/bundle-abc123.md

# Then proceed to dry-run submit
runr submit abc123 --to dev --dry-run
```
