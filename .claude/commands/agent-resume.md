# Resume an Agent Run

Resume a paused or interrupted agent run.

## Usage

```
/agent-resume [run-id]
```

## What to do

1. If `$ARGUMENTS` contains a run ID, resume that run:
   ```bash
   agent resume <run-id>
   ```

2. If no run ID provided, find the most recent resumable run:
   ```bash
   agent list-runs
   ```
   Then resume it.

3. Monitor the resumed run and report progress.

4. If resume fails, diagnose the issue:
   - Check if worktree still exists
   - Check for merge conflicts
   - Check if dependencies are stale

## Arguments

$ARGUMENTS
