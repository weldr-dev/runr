Status: Implemented
Source: src/cli.ts, src/commands/run.ts, src/supervisor/runner.ts, src/store/run-store.ts

# Dual-LLM Agent Runner

A CLI that orchestrates Codex and Claude across plan, implement, verify, review, and checkpoint phases in a target repo, with a run store for auditability.

## When to use
- You want a long-running agent loop with checkpoints and artifacts.
- You need a repeatable run record (plan, events, logs, summary).
- You want basic safety guards (scope, lockfiles, dirty worktree).

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

## Run artifacts (example)
```
runs/<run_id>/
  artifacts/
    task.md
    tests_tier0.log
  handoffs/
    milestone_01_handoff.md
    stop.md
  config.snapshot.json
  plan.md
  seq.txt
  state.json
  summary.md
  timeline.jsonl
```

## Docs
- Mental model: docs/mental-model.md
- Architecture: docs/architecture.md
- CLI reference: docs/cli.md
- Run lifecycle: docs/run-lifecycle.md
- Run store: docs/run-store.md
- Configuration: docs/configuration.md
- Verification: docs/verification.md
- Guards and scope: docs/guards-and-scope.md
- Workers: docs/workers.md
- Tasks and templates: docs/tasks-and-templates.md
- Deckbuilder fixture: docs/deckbuilder-fixture.md
- Development: docs/development.md
- Troubleshooting: docs/troubleshooting.md
- Glossary: docs/glossary.md
