# Agent Run Skill

This skill provides context for running tasks with the agent framework.

## When to Use

Auto-invoke this skill when:
- User wants to run an automated task
- User mentions "agent run", "start task", or "execute milestone"
- User wants to automate a multi-step implementation
- Context involves `.agent/tasks/` files

## Overview

The agent framework executes tasks through a structured lifecycle:

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
```

Each task is defined in `.agent/tasks/<name>.md` and runs through milestones.

## Key Commands

```bash
# List available tasks
agent list

# Run a task
agent run <task-name>

# Run with options
agent run <task-name> --fresh          # Ignore previous progress
agent run <task-name> --worker codex   # Use Codex worker
agent run <task-name> --worktree       # Isolated git worktree

# Check status
agent status <run-id>

# Resume interrupted run
agent resume <run-id>
```

## Task Structure

Tasks are markdown files with:
- **Objective**: What to accomplish
- **Scope/owns**: Files the agent can modify
- **Milestones**: Ordered steps with checkboxes
- **Verification**: Test commands (tier0/tier1/tier2)

## Run Artifacts

Runs are stored in `.agent/runs/<run-id>/`:
- `state.json` - Current phase, milestone, status
- `plan.md` - Generated implementation plan
- `events.jsonl` - Event log
- `artifacts/` - Generated files, evidence

## Common Issues

1. **Scope violation**: Agent tried to modify file not in `owns`
   - Fix: Add file to task's `owns` list

2. **Verification failed**: Tests didn't pass
   - Check: `.agent/runs/<id>/artifacts/` for logs

3. **Review loop**: Reviewer keeps requesting changes
   - Usually means verification isn't producing expected evidence

## Best Practices

- Start with small, focused tasks
- Define clear `owns` scope upfront
- Use `--worktree` for risky changes
- Monitor first few runs interactively
