# Reddit Launch Materials

## Version A: r/ClaudeAI (agent-operator angle)

**Title:**
```
I built "checkpoint + resume" for Claude Code workflows (failure recovery demo)
```

**Body:**
```
I use Claude Code a lot, and the biggest time-waster isn't "it can't code."
It's this pattern:

You get ~70% done → something fails (tests, lint, wrong approach, scope creep) → you either restart or spend 30 min babysitting.

So I built **Runr**: a reliability layer your agent can drive.

**What it does:**

* Creates **git checkpoints** as milestones pass verification
* If a later milestone fails, it **stops** with structured diagnostics
* You **resume from the last good checkpoint** (no re-running earlier work)

I recorded a **3-minute demo** that shows the *failure path* (not a happy path):
task → failure → diagnostics + checkpoint → resume → success
Video: [LINK]

Repo/docs: [LINK]
npm: [LINK]

I'm trying to figure out if this is actually useful for other Claude Code users.

**Questions:**

1. What's the most common way Claude Code "wastes" your time today?
2. Would you use checkpoint+resume, or do you already have a workaround?
3. If you tried it, where would setup/UX friction be?

(If you want, reply with a repo type + typical verify command + a task prompt and I'll try it.)
```

---

## Version B: r/ChatGPT (pain + proof angle)

**Title:**
```
Built a "safety harness" for AI coding: checkpoints + resume when the agent fails (demo)
```

**Body:**
```
AI coding tools are great… until they're not.

My recurring pain: the agent gets most of the way there, then derails, and you lose time re-running or salvaging.

So I built **Runr** — a reliability layer for agent-driven coding:

* **Checkpoint:** makes git commits as verified milestones pass
* **Stop:** halts on failure with diagnostics
* **Resume:** continues from the last verified checkpoint (no restart)

3-minute demo (shows failure recovery, not happy-path): [LINK]

Repo: [LINK]
npm: [LINK]

I'm not selling anything here — I want real feedback:

* What's your most common "agent failure" mode?
* Would checkpoints/resume help, or is this solving the wrong problem?
* If you were to try it, what would make it easiest (CLI vs extension vs built-in agent integration)?
```

---

## Version C: r/programming (engineering credibility angle)

**Title:**
```
Show: Runr — checkpoint+resume for AI coding runs (git checkpoints, verification gates, failure recovery demo)
```

**Body:**
```
I built **Runr** to make AI-assisted coding less fragile.

Instead of "one long agent session," Runr runs work in **verified milestones**:

* Each milestone must pass verification (tests/lint/build/etc.)
* Runr creates a **git checkpoint** after verified milestones
* On failure, it stops with diagnostics
* You **resume from the last verified checkpoint** (no re-running earlier work)

This is a 3-minute demo of the failure path:
task → failure → diagnostics + checkpoint → resume → verification passes
Video: [LINK]

Repo: [LINK]
npm: [LINK]

I'm looking for sharp critique on:

* Is "checkpoint+resume" actually a meaningful wedge?
* What failure modes would still make this useless?
* What would you require for trust in CI/team workflows (reports, determinism, provenance)?
```

---

## Links to Replace

- [LINK] Video: (upload to YouTube/Loom, get link)
- [LINK] Repo: https://github.com/vonwao/runr
- [LINK] npm: https://www.npmjs.com/package/@weldr/runr

## Posting Strategy

### r/ClaudeAI
- **Best time:** Weekday mornings 8-10 AM ET
- **Flair:** Use "Tools & Integrations" or "Show & Tell"
- **Engagement:** Respond to all comments within 2 hours
- **Follow-up:** Post results/learnings after a week

### r/ChatGPT
- **Best time:** Weekday afternoons 2-4 PM ET
- **Flair:** Use "ChatGPT" (general) or "Projects"
- **Tone:** Keep it conversational, not technical
- **Watch for:** Mods can be strict about "promotion" - frame as feedback request

### r/programming
- **Best time:** Tuesday-Thursday, 9-11 AM ET
- **Flair:** Use "Show" or "Tools"
- **Tone:** Technical, evidence-based, open to critique
- **Watch for:** High bar for "interesting" - lead with technical credibility
- **Backup:** If removed, try r/coding or r/softwareengineering

## Common Responses to Prepare

**"Why not just use git manually?"**
> Fair question. You could, but Runr enforces verification gates + scope guards that agents often skip. The checkpoint is automatic and tied to verified milestones, not manual commits.

**"This seems over-engineered"**
> Maybe! That's what I'm testing. If you've found a simpler solution to the "agent gets 70% done then derails" problem, I'd love to hear it.

**"How is this different from X?"**
> (Be ready with 2-sentence comparisons to: git, CI/CD, Cursor checkpoints, etc.)

**"Tried it, got an error"**
> Thanks for trying! Can you share: repo type, OS, error message? I'll debug and fix.
