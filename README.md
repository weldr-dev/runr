# Agent Runner

**Reliable autonomy for unattended coding runs.**

A CLI that orchestrates Codex and Claude to execute coding tasks while you're away. Hand it a task, walk away, and come back to either checkpointed commits with verification evidence—or a clean stop with a forensic trail explaining what went wrong.

> *"Spec Kit and BMAD help you decide what to do; this runtime makes it happen autonomously, safely, and reproducibly."*

## Why This Exists

Current AI coding tools require constant babysitting or spin endlessly when stuck. This runtime solves that with:

- **Phase gates** that ensure verification before commits
- **Scope locks** that prevent tasks from expanding
- **Retry limits** that stop loops before they spiral
- **Clean stops** with actionable handoff memos

The goal isn't smarter AI—it's AI that's **reliable enough to run unattended**.

See [docs/vision.md](docs/vision.md) for the full philosophy.

## Key Features

- **Dual-LLM orchestration**: Claude for planning/review, Codex for implementation (configurable)
- **Phase-based execution**: PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
- **Safety guards**: Scope allowlist/denylist, lockfile protection, dirty worktree checks
- **Verification tiers**: Risk-based test selection with automatic retries (up to 3 per milestone)
- **Full auditability**: Event timeline, state snapshots, artifacts, and handoff memos
- **Resumable runs**: Environment fingerprinting ensures safe resume across sessions
- **Run anywhere**: Use in any repository via `npm link`

## Quick Start

### Install (one-time, from this repo)

```bash
npm install && npm run build && npm link
```

### Use in any project

```bash
cd /path/to/your-project
npm link agent-runner

# Create .agent directory
mkdir -p .agent/tasks

# Create config
cat > .agent/agent.config.json << 'EOF'
{
  "scope": { "allowlist": ["src/**"], "denylist": [] },
  "verification": { "tier0": ["npm test"] }
}
EOF

# Create a task
echo "# Task: Fix the login bug" > .agent/tasks/fix-login.md

# Run
agent doctor                                           # Check workers
agent run --task .agent/tasks/fix-login.md --worktree  # Run isolated
agent follow                                           # Watch progress
agent report latest                                    # View results
```

See **[docs/TARGET_REPO_SETUP.md](docs/TARGET_REPO_SETUP.md)** for the full setup guide.

## Phases (as implemented)
PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> CHECKPOINT -> FINALIZE

## Run Artifacts

Each run creates a self-contained directory under `.agent/runs/<run_id>/` in the target repo:

```
.agent/
├── agent.config.json        # Your config
├── tasks/                   # Task files
│   └── your-task.md
└── runs/
    └── <run_id>/            # Timestamp-based ID
        ├── artifacts/
        │   ├── task.md              # Original task file
        │   └── tests_tier0.log      # Verification output
        ├── handoffs/
        │   ├── milestone_01_handoff.md
        │   └── stop.md              # Stop reason memo
        ├── worktree/                # Git worktree (if --worktree)
        ├── config.snapshot.json     # Config used for this run
        ├── env.fingerprint.json     # Environment snapshot for resume
        ├── plan.md                  # Generated milestone plan
        ├── seq.txt                  # Event sequence counter
        ├── state.json               # Current phase, milestone, timestamps
        ├── summary.json             # Machine-readable summary
        ├── summary.md               # Human-readable summary
        └── timeline.jsonl           # Append-only event log
```

## Documentation

Full documentation is available in the [docs/](docs/) directory. Start with the [index](docs/index.md) for guided reading paths.

### Getting Started
| Doc | Description |
|-----|-------------|
| [Target Repo Setup](docs/TARGET_REPO_SETUP.md) | **Full guide for using the agent in other projects** |
| [Vision](docs/vision.md) | Why this exists and the core philosophy |
| [Mental Model](docs/mental-model.md) | Core concepts and how the system thinks |
| [CLI Reference](docs/cli.md) | All commands and options |
| [Run Lifecycle](docs/run-lifecycle.md) | Phase flow and tick-based execution |
| [Run Store](docs/run-store.md) | Artifacts, timeline, and state persistence |

### System Design
| Doc | Description |
|-----|-------------|
| [Architecture](docs/architecture.md) | Component overview and data flow |
| [Workers](docs/workers.md) | Codex and Claude adapters |
| [Verification](docs/verification.md) | Tiered testing and retry behavior |
| [Guards and Scope](docs/guards-and-scope.md) | Safety checks and file scope enforcement |

### Configuration
| Doc | Description |
|-----|-------------|
| [Configuration](docs/configuration.md) | agent.config.json schema and options |
| [Tasks and Templates](docs/tasks-and-templates.md) | Task file format and prompt templates |

### Advanced
| Doc | Description |
|-----|-------------|
| [Self-Hosting Safety](docs/self-hosting-safety.md) | Guidelines for using the agent on itself |
| [Deckbuilder Fixture](docs/deckbuilder-fixture.md) | Example target app for testing |
| [Development](docs/development.md) | Contributing and local setup |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |
| [Glossary](docs/glossary.md) | Term definitions |
