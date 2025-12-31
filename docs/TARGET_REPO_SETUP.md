# Using Agent Framework in Your Project

This guide explains how to set up and run the agent in any target repository.

## Prerequisites

- Node.js 18+
- Git
- Claude CLI (`claude --version`) authenticated

## Installation

Not yet published to npm. Install from source:

```bash
git clone https://github.com/vonwao/agent-runner.git
cd agent-runner
npm install
npm run build
npm link
```

Verify installation:

```bash
agent version
agent doctor
```

## Project Setup

### 1. Create directory structure

```bash
cd /path/to/your-project
mkdir -p .agent/tasks
```

### 2. Create config file

Create `.agent/agent.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["node_modules/**"],
    "presets": ["typescript"]
  },
  "verification": {
    "tier0": ["npm run lint", "npm run typecheck"],
    "tier1": ["npm run build"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

See [Configuration Reference](configuration.md) for full schema.

### 3. Create a task file

Create `.agent/tasks/my-task.md`:

```markdown
# Add User Authentication

## Goal
Add login/logout functionality.

## Requirements
- OAuth2 with Google
- Session management
- Protected routes

## Success Criteria
- Users can log in
- Session persists
- Unauthorized users redirected
```

## Running Tasks

### Basic run

```bash
agent run --task .agent/tasks/my-task.md
```

### With worktree isolation (recommended)

```bash
agent run --task .agent/tasks/my-task.md --worktree
```

### With time limit

```bash
agent run --task .agent/tasks/my-task.md --worktree --time 30
```

## Monitoring

```bash
# Tail progress in real-time
agent follow latest

# Check status
agent status --all

# Generate report
agent report latest
```

## Common Workflows

### Resume a stopped run

```bash
agent resume <run_id>
```

### Clean up old worktrees

```bash
agent gc --dry-run  # Preview
agent gc            # Delete worktrees older than 7 days
```

### View aggregated metrics

```bash
agent metrics
```

## Directory Structure

After running, your project will have:

```
.agent/
  agent.config.json     # Configuration
  tasks/                # Task definitions
  runs/
    <run_id>/
      state.json        # Run state
      timeline.jsonl    # Event log
  worktrees/
    <run_id>/           # Git worktree (if --worktree used)
```

## Troubleshooting

### "Config not found"

Ensure `.agent/agent.config.json` exists in your project root.

### "Worker not found"

```bash
agent doctor
```

Check that Claude CLI is installed and authenticated.

### Scope violation

Task requires files outside `scope.allowlist`. Either:
- Add patterns to `allowlist`
- Use `presets` for common stacks

See [Troubleshooting](troubleshooting.md) for more issues.
