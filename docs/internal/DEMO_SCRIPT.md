# Runr Demo Script (3 minutes, zero-risk)

**Setup:** Terminal with 18-20pt font, high contrast theme, simple prompt

---

## Hook (0:00–0:10)

**SAY:**
> "AI coding agents waste time when they derail. Runr stops cleanly, saves verified checkpoints, and lets you resume instead of restarting."

---

## Show the Task (0:10–0:25)

**COMMAND:**
```bash
cd /Users/vonwao/dev/agent-framework
head -30 .runr/tasks/dogfood-01-polish-init.md
```

**SAY (one line):**
> "Real task from our codebase. Milestones plus verification gates."

---

## Show the Failure (0:25–1:00) — MONEY SHOT

**COMMAND:**
```bash
node dist/cli.js report 20260102075326
```

**Scroll to KPIs section. HIGHLIGHT on screen:**
```
outcome: stopped (verification_failed_max_retries)
phases: CHECKPOINT=192ms(x3) IMPLEMENT=12m25s(x7) PLAN=34s(x1) ...
```

**SAY:**
> "Run stopped after **3 checkpoints**. Verification failed max retries. But we didn't lose the work."

**EMPHASIZE:** Point to "CHECKPOINT=192ms(x3)"

---

## Prove Checkpoints Are Real (1:00–1:35)

**COMMAND:**
```bash
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -8
```

**SHOW:**
```
5c98ffa chore(agent): checkpoint milestone 3
7e5b62c chore(agent): checkpoint milestone 2
82eb3c2 chore(agent): checkpoint milestone 1
61f830b feat: add 3 dogfood task files for Day 3-4
4c7ae7a Day 2: COMPLETE ✅
```

**COMMAND (optional - show one checkpoint):**
```bash
git show --stat 5c98ffa
```

**SAY:**
> "Three real git commits. Checkpoint branch. You can inspect them. Progress isn't lost."

---

## Show next_action (1:35–2:05)

**COMMAND:**
```bash
node dist/cli.js report 20260102075326 --json | jq '{next_action, stop_reason, checkpoint_sha, milestones}'
```

**SHOW:**
```json
{
  "next_action": "resume",
  "stop_reason": "verification_failed_max_retries",
  "checkpoint_sha": "5c98ffa8828132be857644af3d5e7105be08bf6b",
  "milestones": {
    "completed": 0,
    "total": 4
  }
}
```

**SAY:**
> "Agents read one field: next_action. No guessing, no hallucinating resume logic."

---

## Show What Success Looks Like (2:05–2:35)

**COMMAND (run tiny task - should complete in ~20 seconds):**
```bash
node dist/cli.js run --task .runr/tasks/demo-quick-success.md --worktree --json
```

**Capture run_id from output, then:**
```bash
node dist/cli.js report <NEW_RUN_ID> --json | jq '{next_action, stop_reason, outcome}'
```

**SHOW:**
```json
{
  "next_action": "none",
  "stop_reason": null,
  "outcome": "complete"
}
```

**SAY:**
> "Success: next_action is none. Agent knows it's done."

---

## Close (2:35–3:00)

**SAY:**
> "Runr isn't smarter. It's harder to kill. When your agent derails, you resume from verified checkpoints instead of restarting."

**ONE-LINER for autopilot:**
> "There's also `runr watch --auto-resume --max-attempts 3` for bounded retries."

**END SCREEN:**
- Repo: github.com/anthropics/agent-framework
- Install: npm install -g @weldr/runr
- Docs: See RUNR_OPERATOR.md

---

## Pre-Flight Checklist

Before recording:

- [ ] Terminal font 18-20pt
- [ ] High contrast theme
- [ ] Simple prompt: `export PS1='$ '`
- [ ] Clear screen: `clear`
- [ ] cd to /Users/vonwao/dev/agent-framework
- [ ] Verify run 20260102075326 exists: `node dist/cli.js report 20260102075326 --kpi-only`
- [ ] Verify checkpoint branch exists: `git log --oneline agent/20260102075326/dogfood-01-polish-init | head -3`
- [ ] Task file exists: `ls -la .runr/tasks/demo-quick-success.md`

---

## One-Line Summary to Emphasize

When showing the failure KPIs, point to this line and say:

> "**3 checkpoints** — CHECKPOINT=192ms(x3) — that's 3 verified save points."

The viewer needs to see "x3" and understand it means 3 commits they can resume from.

---

## Backup Plan (if live run fails)

If the quick success task fails or takes too long:

**Skip it.** Just show the JSON from the failed run and say:

> "On success, next_action would be 'none' instead of 'resume'. That's how agents know they're done."

Don't gamble on live execution during recording. The failure + checkpoints are already proven.

---

## Terminal Commands (copy-paste ready)

```bash
# Setup
cd /Users/vonwao/dev/agent-framework
export PS1='$ '
clear

# Task
head -30 .runr/tasks/dogfood-01-polish-init.md

# Failure
node dist/cli.js report 20260102075326

# Checkpoints
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -8
git show --stat 5c98ffa

# JSON
node dist/cli.js report 20260102075326 --json | jq '{next_action, stop_reason, checkpoint_sha, milestones}'

# Success (optional - skip if risky)
node dist/cli.js run --task .runr/tasks/demo-quick-success.md --worktree --json
# Then: node dist/cli.js report <RUN_ID> --json | jq '{next_action, outcome}'
```
