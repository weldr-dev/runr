# Quickstart

Get Agent Framework running on your project in 5 minutes.

## Prerequisites

- **Node.js 18+**
- **Git** (for worktree isolation)
- **Claude Code CLI** authenticated (`claude --version`)

## Install

Not yet published to npm. Install from source:

```bash
git clone https://github.com/yourusername/agent-framework.git
cd agent-framework
npm install
npm run build
npm link
```

Verify installation:

```bash
agent version
agent doctor
```

## Configure Your Project

Create `.agent/agent.config.json` in your project root:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["node_modules/**"],
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "tier0": ["npm run typecheck", "npm run lint"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

## Create a Task

Create `.agent/tasks/my-first-task.md`:

```markdown
# Add Health Check Endpoint

Add a GET /api/health endpoint that returns { status: "ok" }.

## Requirements
- Create the route handler
- Return JSON response
- Handle errors gracefully

## Success Criteria
- Endpoint responds with 200 and correct JSON
- TypeScript types are correct
```

## Run

```bash
# Check environment
agent doctor

# Execute task (uses worktree isolation)
agent run .agent/tasks/my-first-task.md --time 10

# Monitor progress
agent follow <run_id>

# View results
agent report <run_id>
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `agent doctor` | Verify environment and worker CLIs |
| `agent run <task>` | Execute a task |
| `agent follow <run_id>` | Tail run progress in real-time |
| `agent report <run_id>` | Generate run report |
| `agent resume <run_id>` | Resume a stopped run |
| `agent status` | Show current run status |

See [CLI Reference](cli.md) for all commands.

## Canonical Paths

All agent files live under `.agent/` in your project:

```
.agent/
  agent.config.json     # Configuration
  tasks/                # Task definitions
  runs/<run_id>/        # Run artifacts
    state.json          # Run state
    timeline.jsonl      # Event log
    worktree/           # Isolated git worktree
```

## Next Steps

- [Configuration Reference](configuration.md) - Full config schema
- [Run Lifecycle](run-lifecycle.md) - How phases work
- [Guards and Scope](guards-and-scope.md) - Safety constraints
