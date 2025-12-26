# Using the Agent in Other Projects

This guide explains how to set up and run the agent in any target repository.

## Prerequisites

- Node.js 18+
- Git
- Claude CLI (`claude`) and/or Codex CLI (`codex`) installed and authenticated

## One-Time Setup (Agent Framework)

From the agent framework directory:

```bash
cd ~/dev/agent-framework
npm install
npm run build
npm link
```

This makes the `agent` command available globally.

## Target Repository Setup

### 1. Link the agent

From your target repository:

```bash
cd /path/to/your-project
npm link agent-runner
```

### 2. Create the `.agent` directory structure

```bash
mkdir -p .agent/tasks
```

### 3. Create the config file

Create `.agent/agent.config.json`:

```json
{
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["src/**/*.test.ts", "src/**/__tests__/**"]
  },
  "verification": {
    "tier0": ["npm run lint", "npm run typecheck"],
    "tier1": ["npm test"]
  },
  "workers": {
    "planner": "claude",
    "implementer": "claude",
    "reviewer": "claude"
  }
}
```

Adjust the config for your project:

| Field | Description |
|-------|-------------|
| `scope.allowlist` | Glob patterns for files the agent CAN modify |
| `scope.denylist` | Glob patterns for files the agent CANNOT modify |
| `verification.tier0` | Fast checks (lint, typecheck) - run frequently |
| `verification.tier1` | Slower checks (tests) - run after implementation |
| `workers.*` | Which LLM to use (`claude` or `codex`) |

### 4. Create a task file

Create `.agent/tasks/your-task.md`:

```markdown
# Task: Add user authentication

## Objective
Implement JWT-based authentication for the API.

## Requirements
- Add login endpoint at POST /api/auth/login
- Add middleware to protect routes
- Store JWT secret in environment variable
- Add tests for auth flow

## Acceptance Criteria
- [ ] Login returns valid JWT on success
- [ ] Protected routes reject requests without valid token
- [ ] Tests pass for happy path and error cases
```

## Running the Agent

### Basic run (modifies working directory directly)

```bash
agent run --task .agent/tasks/your-task.md
```

### Isolated run with worktree (recommended)

```bash
agent run --task .agent/tasks/your-task.md --worktree
```

This creates a separate git worktree so your working directory stays clean.

### Other useful commands

```bash
# Check that workers are available
agent doctor

# Follow a running agent in real-time
agent follow

# View report for latest run
agent report latest

# Generate summary JSON
agent summarize latest

# Compare two runs
agent compare <runA> <runB>

# Clean up old worktrees
agent gc --dry-run
agent gc
```

## Where Artifacts Go

All artifacts are stored in `.agent/runs/<runId>/`:

```
.agent/
├── agent.config.json      # Your config
├── tasks/
│   └── your-task.md       # Task files
└── runs/
    └── 20251225123456/    # Run ID (timestamp)
        ├── artifacts/     # task.md copy, test logs
        ├── handoffs/      # Memos between phases
        ├── worktree/      # Git worktree (if --worktree)
        ├── config.snapshot.json
        ├── env.fingerprint.json
        ├── plan.md
        ├── state.json
        ├── summary.json
        ├── summary.md
        └── timeline.jsonl
```

## CLI Options Reference

### `agent run`

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <path>` | `.` | Target repository path |
| `--task <path>` | (required) | Path to task file |
| `--config <path>` | `.agent/agent.config.json` | Path to config |
| `--time <minutes>` | `120` | Time budget |
| `--max-ticks <n>` | `50` | Max supervisor iterations |
| `--worktree` | `false` | Create isolated git worktree |
| `--allow-deps` | `false` | Allow lockfile changes |
| `--allow-dirty` | `false` | Allow dirty working tree |
| `--dry-run` | `false` | Initialize without executing |
| `--fast` | `false` | Skip PLAN and REVIEW phases |

### `agent resume <runId>`

Resume a stopped run from where it left off.

| Option | Default | Description |
|--------|---------|-------------|
| `--repo <path>` | `.` | Target repository path |
| `--force` | `false` | Resume despite env mismatch |

## Worktree + Dependencies

When using `--worktree`, the agent:

1. Creates a fresh git checkout in `.agent/runs/<runId>/worktree/`
2. Symlinks `node_modules` from the main repo (fast, shared deps)
3. Runs all verification in the worktree

This gives you:
- Clean code isolation (no dirty working tree conflicts)
- Fast startup (no `npm install`)
- Safe experimentation (trash the worktree if needed)

## Troubleshooting

### "Config not found"

Make sure `.agent/agent.config.json` exists. You can also use `--config` to specify a different path.

### "No runs found"

Run `agent run` first to create a run, then use `report`/`follow`/etc.

### Worker authentication errors

Run `agent doctor` to check worker availability. Make sure:
- `claude --version` works
- `codex --version` works (if using codex)
- You're logged in (`claude` or `codex` auth)

### Worktree conflicts

If you have uncommitted changes, either:
- Commit or stash them first
- Use `--allow-dirty` (not recommended)
- Run without `--worktree`

## Example: Full Workflow

```bash
# 1. Set up target repo
cd ~/projects/my-app
npm link agent-runner
mkdir -p .agent/tasks

# 2. Create config
cat > .agent/agent.config.json << 'EOF'
{
  "scope": {
    "allowlist": ["src/**"],
    "denylist": []
  },
  "verification": {
    "tier0": ["npm run lint", "npm run build"],
    "tier1": ["npm test"]
  }
}
EOF

# 3. Create task
cat > .agent/tasks/add-feature.md << 'EOF'
# Task: Add dark mode toggle

## Objective
Add a dark mode toggle to the settings page.

## Requirements
- Toggle persists to localStorage
- CSS variables for theme colors
- Respects system preference by default
EOF

# 4. Check workers
agent doctor

# 5. Run (isolated)
agent run --task .agent/tasks/add-feature.md --worktree

# 6. Monitor progress
agent follow

# 7. Review results
agent report latest
agent summarize latest
```
