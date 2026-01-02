# Twitter/X Launch Thread

## 10-Tweet Thread

**Tweet 1/10**
I'm tired of losing 30 minutes every time an AI coding agent derails.
70% done → tests fail / wrong approach / scope creep → you either restart or babysit.

So I built **Runr**: checkpoint + resume for AI coding.

**Tweet 2/10**
The pitch is simple:
**Stop losing work when the agent fails.**
Runr creates **git checkpoints** as milestones pass verification.

When a later step fails, Runr stops *cleanly* with diagnostics.

**Tweet 3/10**
Then you don't restart. You **resume from the last good checkpoint**.

It's the difference between:

* "Re-run the whole thing"
  vs
* "Continue from the last verified state"

**Tweet 4/10**
I made a 3-minute demo and it's *not* a happy path.
It shows the real world:

task → agent fails → Runr catches it + checkpoint → resume → tests pass.

(Video) [LINK]

**Tweet 5/10**
What Runr enforces:

* phase gates + verification gates
* scope guards (allow/deny)
* worktree isolation (no repo trashing)
* structured diagnostics + run reports

**Tweet 6/10**
The bet: **meta-agent mode**.
Your coding agent (Claude Code / etc.) drives Runr as the execution substrate.

Runr isn't "smarter."
It's **harder to kill.**

**Tweet 7/10**
Typical flow:

* `runr init` (minimal config, detect verify commands)
* `runr run <task>`
* if it fails: `runr resume <RUN_ID>`
* `runr report <RUN_ID> --json`

**Tweet 8/10**
Optional autonomy bridge:
`runr watch <RUN_ID> --auto-resume --max-attempts 3`
Bounded retries, no infinite loops, still verified.

**Tweet 9/10**
Repo: [LINK]
npm: [LINK]
Docs: [LINK]

If you use AI coding tools: I want blunt feedback.

**Tweet 10/10**
Questions:

* What's your #1 "agent wasted my time" failure mode?
* Would checkpoint+resume change your workflow?
* What would make you try this today: CLI, VSCode, or "agent skill" integration?

---

## Links to Replace

- [LINK] Video: (upload to YouTube/Loom, get link)
- [LINK] Repo: https://github.com/vonwao/runr
- [LINK] npm: https://www.npmjs.com/package/@weldr/runr
- [LINK] Docs: https://github.com/vonwao/runr#readme

## Timing

- Post Tuesday-Thursday, 9-11 AM PT (peak tech Twitter hours)
- Pin thread to profile
- Reply to all comments within first 4 hours
- Follow up with user feedback summary 48h later
