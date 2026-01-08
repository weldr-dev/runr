# Runr

> Autopilot for AI-driven dev work: run tasks end-to-end, and when something breaks, stop cleanly with the next 3 best actions.

![Failure Recovery](demo/failure-checkpoint.gif)

## Try it (2 minutes)

```bash
npx @weldr/runr@latest init --demo
cd runr-demo
npm install

# Task 1: success
runr run --task .runr/tasks/00-success.md
runr report latest

# Task 2: failure + recovery
runr run --task .runr/tasks/01-intentional-fail.md
runr                 # shows STOPPED + 3 next actions
runr continue
runr report latest

# Task 3: scope guard (expected to stop)
runr run --task .runr/tasks/02-scope-violation.md
# STOPPED: scope guard. Runr tells you what to do.
```

The demo creates a self-contained TypeScript project with three tasks: success, a failure that stops with next actions (then `continue`), and a scope guard stop.

**Runr is language-agnostic.** The demo is JS/TS because it's the fastest proof. Other languages work by swapping verification commands (e.g., `pytest -q` for Python, `go test ./...` for Go).

---

## In your own repo

```bash
npm install -g @weldr/runr
runr init --pack solo

# Start work
runr run --task .runr/tasks/example-task.md

# If it stops, do the obvious next thing
runr continue

# Inspect what happened
runr report latest
```

## What happens when it fails

Runr doesn't "keep going and hope." It stops with receipts and 3 next actions you can trust:

- **continue** — auto-fix what's safe, then resume
- **report** — open the run receipt: diffs + logs + timeline
- **intervene** — record manual fixes so they don't become black holes

That's the whole UX: keep momentum, keep receipts, never lose your place.

## The mental model

- **Autopilot:** run work in milestones with phase gates (plan → implement → verify → review)
- **Recovery:** save checkpoints so you can resume from the last verified state
- **Runs:** capture diffs, verification logs, and interventions automatically

## Quick links

- [Why Runr?](docs/why-runr.md)
- [Hybrid Workflow](docs/hybrid-workflow-guide.md)
- [CLI Reference](docs/cli.md)
- [Configuration](docs/configuration.md)

---

## How it works

Runr orchestrates AI workers through phase gates with checkpoints:

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → done
         ↑___________|  (retry if verification fails)
```

- **Phase gates:** the agent can't skip verification or claim false success
- **Checkpoints:** verified milestones are saved as git commits
- **Stop handoffs:** structured diagnostics with next actions
- **Scope guards:** files outside scope are protected

> **Status**: v0.7.x — Hybrid workflow with provenance tracking. Early, opinionated, evolving.

---

## Try it: Hello World

```bash
cd dogfood/hello-world
npm install
runr run --task .runr/tasks/add-farewell.md --worktree
```

Complete walkthrough in [dogfood/hello-world/README.md](dogfood/hello-world/README.md).

---

## Meta-Agent Mode

**The easiest way to use Runr:** one command, zero ceremony.

Best for: longer tasks, multiple milestones, and hands-off recovery.

Runr works as a **reliable execution backend** for meta-agents (Claude Code, Codex CLI). The meta-agent operates Runr for you — handling runs, interpreting failures, and resuming from checkpoints.

```bash
# Initialize with Claude Code integration
runr init --pack solo --with-claude

# Launch meta-agent with workflow context
runr meta
```

The agent will automatically:
- Follow workflow rules from `AGENTS.md`
- Use safety playbooks from `.claude/skills/runr-workflow`
- Have `/runr-bundle`, `/runr-submit`, `/runr-resume` slash commands available

Tip: start from a clean tree. `runr meta` blocks if you have uncommitted changes.

---

## Direct CLI Usage

Tip: start from a clean tree (commit or stash first).

```bash
# Install
npm install -g @weldr/runr

# Initialize
cd /your/project
runr init --pack solo

# Run a task
runr run --task .runr/tasks/example-feature.md --worktree

# Submit verified checkpoint
runr submit <run_id> --to dev
```

---

## Configuration

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**"],
    "presets": ["vitest", "typescript"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm test"],
    "tier2": ["npm run build"]
  }
}
```

Tiers run from fast → slow. Keep `tier0` as a quick sanity check.

### Scope presets

Don't write patterns by hand:

```json
{
  "scope": {
    "presets": ["nextjs", "vitest", "drizzle", "tailwind"]
  }
}
```

Available: `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

---

## CLI Reference

| Command | What it does |
|---------|--------------|
| `runr` | Show status and next actions |
| `runr run --task <file>` | Start a task |
| `runr continue` | Do the next obvious thing |
| `runr report <id>` | View run receipt: diffs, logs, timeline |
| `runr resume <id>` | Resume from checkpoint |
| `runr intervene <id>` | Record manual work |
| `runr submit <id> --to <branch>` | Submit verified checkpoint |
| `runr meta` | Launch meta-agent with workflow context |
| `runr init` | Initialize Runr in a repo |
| `runr runs bundle <id>` | Generate evidence bundle |
| `runr tools doctor` | Check environment health |

---

## Task Files

Tasks are markdown files:

```markdown
# Add user authentication

## Goal
OAuth2 login with Google.

## Requirements
- Session management
- Protected routes
- Logout functionality

## Success Criteria
- Users can log in with Google
- Session persists across refreshes
```

---

## Stop Reasons

When Runr stops, it tells you why:

| Reason | What happened |
|--------|---------------|
| `complete` | Task finished. Ship it. |
| `verification_failed_max_retries` | Tests failed too many times |
| `guard_violation` | Touched files outside scope |
| `review_loop_detected` | Reviewer kept requesting same changes |
| `time_budget_exceeded` | Ran out of time |

Every stop produces structured diagnostics with next actions.

---

## Philosophy

This isn't magic. Runs fail. The goal is understandable, resumable failure.

This isn't a chatbot. Task in, code out.

This isn't a code generator. It orchestrates generators.

Agents lie. Logs don't. If it can't prove it, it didn't do it.

---

## Development

```bash
npm run build    # compile
npm test         # run tests
npm run dev -- run --task task.md  # run from source
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 — See [LICENSE](LICENSE).

---

<sub>Shipping beats rerunning the same milestone twice.</sub>
