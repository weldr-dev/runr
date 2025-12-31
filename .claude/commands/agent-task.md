# Create an Agent Task

Create a new task definition for the agent framework.

## Usage

```
/agent-task <task-name>
```

## What to do

1. Use `$ARGUMENTS` as the task name, or ask the user for one.

2. Ask the user to describe:
   - What the task should accomplish
   - Which files/directories it should modify (`owns`)
   - Any verification requirements

3. Create the task file at `.agent/tasks/<task-name>.md`:

```markdown
# <Task Title>

## Objective
<Clear description of what to accomplish>

## Scope
owns:
  - <file or directory patterns>

## Milestones

### 1. <First milestone>
- [ ] <Specific deliverable>
- [ ] <Specific deliverable>

### 2. <Second milestone>
- [ ] <Specific deliverable>

## Verification
- tier0: <quick check, e.g., "npm run build">
- tier1: <unit tests, e.g., "npm test">
- tier2: <integration, e.g., "npm run test:e2e">

## Context
<Any additional context the agent needs>
```

4. Validate the task:
   ```bash
   agent preflight <task-name>
   ```

## Arguments

$ARGUMENTS
