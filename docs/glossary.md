Status: Implemented
Source: src/types/schemas.ts, src/supervisor/runner.ts

# Glossary

Run
A single supervised execution session with its own run store and run ID.

Milestone
A planned unit of work with a goal, done checks, and risk level.

Phase
A step in the supervisor loop (PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT, FINALIZE).

Tier
A verification level (tier0, tier1, tier2) mapped to configured commands.

Guard
A preflight or post-implement safety check (scope, lockfiles, dirty worktree).

Run store
The on-disk record of a run (`runs/<run_id>/`), including state and events.

Timeline
The JSONL event log in `timeline.jsonl`.

Checkpoint
A commit created after a milestone is approved.

Handoff memo
A markdown note written by the implementer or reviewer for a milestone.
