# Agent Framework

A dual-LLM orchestrator that decomposes coding tasks into milestones and executes them with built-in verification, scope guards, and collision handling.

> **Status**: v0.2.1 is the first public release. The project went through heavy iteration prior to this version — that history is preserved as evidence of real-world refinement, not hidden. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Overview

The agent framework orchestrates AI-powered coding sessions by:

1. **Planning**: Breaks tasks into milestones with file scopes
2. **Implementing**: Executes code changes in an isolated worktree
3. **Reviewing**: Validates changes meet requirements
4. **Verifying**: Runs configured checks (tests, lint, build)
5. **Checkpointing**: Commits progress atomically

## Features

- **Scope Guards**: Prevent modifications outside allowed file patterns
- **Collision Detection**: Serialize runs that would touch the same files
- **Review Loop Detection**: Stop when reviewer feedback becomes repetitive
- **Auto-Resume**: Recover from transient failures automatically
- **Worktree Isolation**: Each run operates in its own git worktree
- **Scope Presets**: Common patterns for popular frameworks (nextjs, vitest, drizzle, etc.)

## Quick Start

```bash
# Install
npm install -g agent-runner

# Check environment
agent doctor

# Run a task
agent run --task .agent/tasks/my-task.md --worktree
```

## Configuration

Create `.agent/agent.config.json` in your project:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**", ".next/**"],
    "presets": ["vitest", "typescript"]
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
  },
  "resilience": {
    "max_review_rounds": 2,
    "auto_resume": true,
    "max_auto_resumes": 2
  }
}
```

### Scope Presets

Instead of manually listing file patterns, use presets for common stacks:

```json
{
  "scope": {
    "allowlist": ["src/**"],
    "presets": ["nextjs", "vitest", "drizzle", "tailwind"]
  }
}
```

Available presets: `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent run --task <file>` | Run a task file |
| `agent resume <run-id>` | Resume a stopped run |
| `agent status [run-id]` | Show run status |
| `agent report [run-id]` | Generate run report |
| `agent doctor` | Check environment health |
| `agent follow [run-id]` | Tail run progress |

See [docs/cli.md](docs/cli.md) for all commands and flags.

## Task Files

Tasks are markdown files describing what to build:

```markdown
# Feature: User Authentication

## Goal
Add login/logout functionality to the application.

## Requirements
- OAuth2 integration with Google
- Session management
- Protected routes

## Success Criteria
- Users can log in with Google
- Session persists across page refreshes
- Unauthorized users redirected to login
```

## Stop Reasons

When a run stops, check the stop reason in `state.json`:

| Reason | Description |
|--------|-------------|
| `complete` | Task finished successfully |
| `review_loop_detected` | Reviewer kept requesting same changes |
| `plan_scope_violation` | Planner proposed files outside allowlist |
| `time_budget_exceeded` | Ran out of time |
| `verification_failed_max_retries` | Tests/lint failed too many times |

## Development

```bash
# Build
npm run build

# Test
npm test

# Run locally
npm run dev -- run tasks/test.md
```

## Release History

| Version | Date | Highlights |
|---------|------|------------|
| v0.2.1 | 2025-12-29 | Scope presets, review digest, OSS packaging |
| v0.2.0 | 2025-12-28 | Review loop detection, ESM fix |
| v0.1.0 | 2025-12-27 | Initial stable release |

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.
