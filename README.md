# Dual-LLM Agent Runner

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

## When to Use

- You want a long-running agent loop with checkpoints and artifacts
- You need a repeatable run record (plan, events, logs, summary)
- You want safety guards (scope, lockfiles, dirty worktree)
- You're automating multi-step development tasks with verification gates

## Quickstart
Prereqs:
- Node.js + npm
- Git in the target repo
- `codex` and `claude` CLIs available on PATH (headless mode)

Build:
```
npm install
npm run build
```

Doctor (first step in every example):
```
node dist/cli.js doctor --repo . --config agent.config.json
```

Plan-only run (one tick):
```
node dist/cli.js run \
  --repo . \
  --task tasks/noop.md \
  --config agent.config.json \
  --max-ticks 1
```
This executes the PLAN phase only and leaves the run ready to resume.

Grab the `run_id=...` from the summary line, then inspect:
```
node dist/cli.js report <run_id> --tail 80
```

Resume the run later:
```
node dist/cli.js resume <run_id> --time 60 --max-ticks 5
```

## Phases (as implemented)
PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> CHECKPOINT -> FINALIZE

## Run Artifacts

Each run creates a self-contained directory under `runs/<run_id>/`:

```
runs/<run_id>/
  artifacts/
    task.md              # Original task file
    tests_tier0.log      # Verification output
  handoffs/
    milestone_01_handoff.md
    stop.md              # Stop reason memo
  config.snapshot.json   # Config used for this run
  env.fingerprint.json   # Environment snapshot for resume safety
  plan.md                # Generated milestone plan
  seq.txt                # Event sequence counter
  state.json             # Current phase, milestone index, timestamps
  summary.md             # Final summary
  timeline.jsonl         # Append-only event log
```

## Documentation

Full documentation is available in the [docs/](docs/) directory. Start with the [index](docs/index.md) for guided reading paths.

### Getting Started
| Doc | Description |
|-----|-------------|
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
