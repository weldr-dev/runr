Status: Implemented
Source: src/commands/run.ts, src/supervisor/runner.ts, src/workers/*.ts, src/verification/engine.ts

# Mental Model

## What is a run?
A run is a single supervised execution session. It has a run ID, an optional branch in the target repo, and a run store on disk that captures state, events, and artifacts.

## What is a milestone?
A milestone is a unit of work produced by the planner. The supervisor executes one milestone at a time, then verifies, reviews, and checkpoints before moving on.

## Supervisor vs workers
- Supervisor: decides which phase runs next, enforces guards, runs verification, writes artifacts.
- Workers: do the actual planning, implementation, and review (Claude for plan/review, Codex for implementation).

## Verification tiers
Verification is a gate between implementation and review. Tier selection is risk-based, with tier0 always on and tier1 triggered by risk signals. Tier2 is configured but not currently selected in the run loop.

## Resume and checkpoints
Resume re-enters the supervisor loop using the existing run store. Checkpoints commit the current milestone changes to the target repo and record the commit SHA in the run state.

## What this system is not
- Not a fully autonomous PR factory.
- Not a replacement for CI or manual review.
- Not a guarantee of correctness beyond configured verification commands.
