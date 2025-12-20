Status: Implemented
Source: src/cli.ts, src/commands/*.ts, src/supervisor/*.ts, src/workers/*.ts, src/store/run-store.ts

# Architecture

## Components
- CLI: entry point and command routing.
- Preflight: repo context, guards, tier selection.
- Supervisor loop: phase orchestration and state transitions.
- Workers: Codex and Claude adapters for plan/implement/review.
- Verification engine: runs configured commands per tier.
- Run store: JSONL timeline, state, artifacts, and memos.

## Data flow (high level)
```
CLI -> Preflight -> RunStore init -> Supervisor loop
  -> PLAN (Claude) -> IMPLEMENT (Codex) -> VERIFY -> REVIEW (Claude)
  -> CHECKPOINT -> ... -> FINALIZE
```

## Run store boundaries
- Run data is stored under `runs/<run_id>/` in this repo.
- Target repo changes happen in the repo passed to `--repo`.
- The run branch is created in the target repo (if not disabled).

## Worker adapters
- Codex: JSONL output parsed to text, then JSON extracted between markers.
- Claude: JSON output parsed to text, then JSON extracted between markers.
- Parsing failures stop the run and record a stop memo.

## Verification and guards
- Guard checks run before branch checkout and after implementation.
- Verification commands run sequentially per tier with a per-milestone time budget.
