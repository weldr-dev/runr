# HN Show Launch Materials

## Title

```
Show HN: Runr — checkpoint + resume for AI coding (failure recovery, not happy-path demos)
```

## Body

```text
I built Runr because AI coding tools waste the most time in the same way:
you get 70% done, then the agent derails (tests fail, scope creep, wrong approach),
and you lose 30 minutes trying to salvage or re-run.

Runr is a reliability layer you can put under a coding agent.

The feature that matters:
- Runr creates git checkpoints as milestones pass verification.
- If a later milestone fails, the run stops with diagnostics.
- You resume from the last good checkpoint (no re-running the earlier work).

Demo (3 min): [VIDEO LINK]
It shows the *failure path*:
task → agent fails → Runr stops with diagnostics + checkpoint → resume → verification passes.

What Runr enforces:
- Phase gates + verification gates (tests/lint/build, etc.)
- Scope guards (deny/allow lists)
- Worktree isolation (no repo trashing)
- Structured diagnostics + run reports

How people use it (what I'm betting on):
- A coding agent (Claude Code / etc.) drives Runr as the execution substrate.
- Runr becomes the "hard to kill" layer underneath.

CLI basics:
- `runr init` (adds minimal config + detects verify commands)
- `runr run <task>`
- `runr resume <RUN_ID>`
- `runr report <RUN_ID> --json`
- optional: `runr watch <RUN_ID> --auto-resume --max-attempts 3`

Repo + docs: https://github.com/vonwao/runr
npm: https://www.npmjs.com/package/@weldr/runr

I'm looking for blunt feedback from people who actually use AI coding tools:
1) Would checkpoint+resume change your workflow, or do you already have a workaround?
2) What's the most common way your agent sessions waste time today?
3) If you tried it, where did setup or UX feel like friction?
```

## First Comment (for engagement)

```text
Extra details / implementation notes:

- Checkpoints are real git commits, so the state is inspectable and reversible.
- A "resume" recreates the worktree and continues from the last verified checkpoint.
- Reports are designed for agent-driving: `--json` includes phase timing, retries, failures, and next action hints.

If you want a specific use case tested, drop:
- repo type (Node/Python/etc.)
- your typical verification command
- a task you'd normally give Claude/Cursor
and I'll try to reproduce the workflow.
```

## Backup Title Options (if main gets rejected)

1. "Show HN: Runr – Checkpointing for AI coding agents (resume from failure, not restart)"
2. "Show HN: Phase-gated execution for AI agents with git checkpoints"
3. "Show HN: I built failure recovery for AI coding (checkpoint + resume)"

## Timing Notes

- **Best time to post:** Tuesday-Thursday, 8-10 AM ET or 2-4 PM ET
- **Reply frequency:** First 2 hours critical - reply to every comment
- **Follow-up:** Post summary of feedback + roadmap update 48h later
