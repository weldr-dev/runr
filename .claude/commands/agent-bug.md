# Report an Agent Framework Bug

Report a bug or suggest an enhancement for the agent framework.

## Usage

```
/agent-bug [summary]
```

## What to do

1. Gather context about the issue:
   - What were you trying to do?
   - What happened vs what was expected?
   - Any error messages?

2. If `$ARGUMENTS` contains a summary, use it. Otherwise, ask the user to describe the issue.

3. Determine issue type:
   - Bug (something broken)
   - Feature request (something missing)
   - Friction (something awkward)
   - Edge case (unusual scenario)

4. Try to create a GitHub issue:
   ```bash
   gh issue create \
     --repo <owner>/agent-framework \
     --title "[Agent Feedback] $ARGUMENTS" \
     --body "## Context
   <gathered context>

   ## Issue
   <description>

   ## Evidence
   <logs, errors, etc>

   ---
   *Reported via /agent-bug command*"
   ```

5. If GitHub issue creation fails, save to evidence:
   ```bash
   cat > .agent/artifacts/bug-report-$(date +%Y%m%d-%H%M%S).md <<EOF
   # Bug Report: $ARGUMENTS

   **Type**: <bug|feature|friction|edge-case>
   **Impact**: <blocker|major|minor>

   ## Details
   <full description>

   ## Evidence
   <relevant logs/errors>
   EOF
   ```

6. Confirm the report was saved and explain next steps.

## Arguments

$ARGUMENTS
