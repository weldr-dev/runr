# Runr Pilot Program

Early adopter program for testing the Runr on real projects.

## What is Runr?

A dual-LLM orchestrator that automates coding tasks with:

- **Milestone decomposition** - Breaks tasks into manageable steps
- **Scope guards** - Prevents modifications outside allowed patterns
- **Verification tiers** - Runs tests/lint after each change
- **Review loop detection** - Stops when feedback becomes repetitive
- **Worktree isolation** - Each run operates in its own git worktree

## Who Should Join?

Ideal participants:
- Have a TypeScript/JavaScript project with tests and linting
- Want to experiment with AI-assisted development
- Can provide structured feedback on issues
- Comfortable with CLI tools

## What You'll Get

- Early access to new features
- Direct support for setup and issues
- Influence on roadmap priorities

## Prerequisites

1. **Node.js 18+**
2. **Git**
3. **Claude Code CLI** authenticated (`claude --version`)

## Getting Started

See [Quickstart](quickstart.md) for full setup instructions.

### 1. Install

Install from npm:

```bash
npm install -g @weldr/runr
```

### 2. Configure

Create `.runr/runr.config.json` in your project:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"],
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "tier0": ["npm run typecheck", "npm run lint"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

See [Configuration Reference](configuration.md) for full schema.

### 3. Create a Task

Create `.runr/tasks/my-task.md`:

```markdown
# Add Health Check Endpoint

Add a GET /api/health endpoint that returns { status: "ok" }.
```

### 4. Run

```bash
runr doctor          # Check environment
runr run --task .runr/tasks/my-task.md --worktree --time 10
runr follow latest   # Monitor progress
runr report latest   # View results
```

See [CLI Reference](cli.md) for all commands.

## Providing Feedback

After each run, note:
- Did it complete successfully?
- Stop reason (from `state.json`)
- Any unexpected behavior?
- Duration

Report via GitHub Issues.

## Common Issues

### Scope violation

Task requires files outside allowlist. Add patterns to `scope.allowlist` or use `scope.presets`.

### Review loop detected

Implementer couldn't satisfy reviewer. Check `review_digest.md` for requested changes.

See [Troubleshooting](troubleshooting.md) for more.

## FAQ

**Q: Does this modify my main branch?**
A: No. With `--worktree`, runs happen in isolated git worktrees.

**Q: What if it breaks something?**
A: The worktree is isolated. Delete it anytime with `runr gc`.

**Q: Can I run multiple tasks?**
A: Yes. Use `runr orchestrate run` for multi-track execution.
