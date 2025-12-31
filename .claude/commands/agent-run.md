# Run an Agent Task

Start a new agent run for a task in this project.

## Usage

```
/agent-run <task-name> [options]
```

## What to do

1. First, list available tasks:
   ```bash
   agent list
   ```

2. If `$ARGUMENTS` is provided, use it as the task name. Otherwise, ask the user which task to run.

3. Run the task:
   ```bash
   agent run <task-name>
   ```

4. Monitor the output and report:
   - Run ID
   - Current phase (PLAN, IMPLEMENT, VERIFY, REVIEW)
   - Any errors or blockers

5. If the run pauses or fails, explain why and suggest next steps.

## Options

The user may specify:
- `--fresh` - Start fresh, ignore previous progress
- `--worker codex` - Use Codex instead of Claude
- `--worktree` - Run in isolated git worktree

## Arguments

$ARGUMENTS
