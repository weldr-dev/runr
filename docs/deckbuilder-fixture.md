Status: Implemented
Source: apps/deckbuilder/agent.config.json, tasks/deckbuilder/001_engine_combat.md, apps/deckbuilder/*

# Deckbuilder Fixture

The `apps/deckbuilder` app is a reference target with a deterministic test suite and a focused task spec.

## Run the fixture task
```bash
runr doctor --config apps/deckbuilder/agent.config.json

runr run \
  --task tasks/deckbuilder/001_engine_combat.md \
  --config apps/deckbuilder/agent.config.json
```

## What this config does
- Restricts scope to `apps/deckbuilder/**` via allowlist rules.
- Runs `npm run lint`, `npm run typecheck`, and `npm run test` as tier0 verification.

## Why it exists
- Provides a non-trivial but deterministic target for end-to-end runs.
- Demonstrates scoped edits, verification gates, and checkpointing.
