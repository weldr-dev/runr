# Check Agent Run Status

Check the status of agent runs in this project.

## Usage

```
/agent-status [run-id]
```

## What to do

1. If `$ARGUMENTS` contains a run ID, check that specific run:
   ```bash
   agent status <run-id>
   ```

2. If no run ID provided, list recent runs:
   ```bash
   agent list-runs
   ```

3. Report:
   - Run phase and status
   - Current milestone progress
   - Any errors or warnings
   - Time elapsed

4. If a run is stuck or failed, suggest recovery options.

## Arguments

$ARGUMENTS
