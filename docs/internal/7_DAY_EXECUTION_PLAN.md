# 7-Day Launch Execution Plan

**Start Date:** 2026-01-02
**Goal:** Launch Runr with meta-agent positioning, get first 10 users, validate product-market fit

---

## Day 1: Agent-Friendly Defaults ✅ COMPLETE

### Deliverables
- [x] `runr init` command (auto-detect verify from package.json)
- [x] Example task files (bugfix, feature, docs)
- [x] Silent auto-detection + `--print` and `--force` escape hatches
- [x] Launch materials (Twitter thread, Reddit posts, HN Show post)
- [x] Operator prompt (RUNR_OPERATOR_PROMPT.txt)

### What Works
```bash
# Auto-detects verification commands, presets, directory structure
runr init

# Show what would be generated (no filesystem writes)
runr init --print

# Overwrite existing config
runr init --force
```

**Detection logic:**
- Scans `package.json` scripts (test, lint, typecheck, build)
- Detects presets from dependencies (typescript, vitest, jest, nextjs, etc.)
- Creates 3 example tasks (bugfix, feature, docs)
- Fallback: safe defaults if nothing detected

### Files Created
- `src/commands/init.ts` - Init command implementation
- `RUNR_OPERATOR_PROMPT.txt` - System prompt for meta-agents
- `docs/internal/LAUNCH_HN_SHOW.md` - HN Show post
- `docs/internal/LAUNCH_TWITTER.md` - Twitter thread
- `docs/internal/LAUNCH_REDDIT.md` - Reddit posts (3 versions)

---

## Day 2: Autopilot Mode + Polish

### Deliverables
- [ ] `runr watch --auto-resume` (autopilot mode)
- [ ] Polish `runr report --json` output
- [ ] Update README with `runr init` example
- [ ] Test `runr init` on 3 different repo types

### Tasks
1. **Implement `runr watch` command**
   - Poll `runr status` until terminal state
   - If failed + transient (stall, timeout): auto-resume
   - Respect `--max-attempts N` limit
   - JSON output mode

2. **Polish `runr report --json`**
   - Ensure clean, parseable JSON
   - Include: status, phase, stop_reason, checkpoints, next_action
   - Add `next_action` field (pre-filled resume command or manual step)

3. **Update README**
   - Add `runr init` to Quick Start
   - Show meta-agent workflow example
   - Link to RUNR_OPERATOR.md

4. **Test init on different repos**
   - Node/TypeScript project (current)
   - Python project (pytest detection)
   - Empty repo (fallback behavior)

---

## Day 3-4: Dogfood + Paper Cuts

### Goal
Use Claude Code + Runr for 3 Runr repo changes. Fix top 2 friction points immediately.

### Tasks to Run via Runr
1. **Task: Add `runr watch` command** (autopilot mode)
2. **Task: Polish init command** (better detection, clearer output)
3. **Task: Update README** (meta-agent Quick Start)

### Metrics to Track
- Time to first checkpoint
- Number of resumes required
- Which phase failed most often
- Top friction points (config? task file? error messages?)

### Expected Outcomes
- 2-3 completed runs
- List of 5 friction points, fix top 2
- Real task files to use as examples
- Battle-tested operator workflow

---

## Day 5: Record Failure Demo

### Goal
3-minute video showing failure recovery (not happy path)

### Script
**00:00-00:30 | Setup**
- Show repo, explain task
- `runr init` (already done)
- Create task file

**00:30-01:30 | Run + Failure**
- `runr run --task ... --worktree --json`
- Show progress (live tail or follow)
- Task fails (tests fail / wrong approach)
- Runr stops with diagnostics + checkpoint

**01:30-02:30 | Resume + Success**
- Show diagnostic output (stop reason, checkpoint hash)
- `runr resume <RUN_ID>`
- Fix applied, tests pass
- Checkpoint created

**02:30-03:00 | Proof**
- `runr report <RUN_ID>` (show KPIs, verification output)
- Show git commits (checkpoints)
- Final message: "It's not smarter. It's harder to kill."

### Production Notes
- Use QuickTime or Loom (no fancy editing)
- Script the failure (inject a bug, make it fail predictably)
- Keep it raw, authentic (show real terminal, real workflow)
- Upload to YouTube (unlisted), get link

---

## Day 6: Launch Assets

### Tasks
1. **Update README**
   - Embed failure demo video
   - Add "Meta-Agent Quickstart" section
   - 2 GIFs: (1) failure stop, (2) resume success
   - Link to launch materials

2. **Create GIFs**
   - Use demo recording to extract 2 key moments
   - GIF 1: Failure stop + diagnostics (5-10 sec)
   - GIF 2: Resume + success (5-10 sec)
   - Tools: Gifox, LICEcap, or ffmpeg

3. **Prepare launch posts**
   - HN Show: paste from `docs/internal/LAUNCH_HN_SHOW.md`
   - Twitter: paste from `docs/internal/LAUNCH_TWITTER.md`
   - Reddit: paste from `docs/internal/LAUNCH_REDDIT.md`

4. **Final checks**
   - `runr init` works on fresh repo
   - `runr doctor` shows green
   - Demo video link works
   - npm package is up to date

---

## Day 7: Launch

### Schedule (Tuesday-Thursday, 9-11 AM PT ideal)

**Hour 0: Post**
- HN Show (https://news.ycombinator.com/submit)
- Twitter thread (pin to profile)
- r/ClaudeAI post

**Hour 1-2: Engage**
- Reply to every HN comment
- Reply to every Twitter mention
- Monitor Reddit upvotes/comments

**Hour 3-4: Expand**
- r/ChatGPT post
- r/programming post (if HN goes well)
- Discord/Slack communities (agent users)

**Hour 5-8: Sustain**
- Continue replying to all comments
- Fix critical bugs immediately
- Update README with user feedback

**Hour 24-48: Follow-up**
- Post "Thank you + roadmap update" on HN
- Twitter: "What I learned from 100+ comments"
- Collect testimonials

### Success Metrics
- **100+ HN upvotes** (good signal)
- **10+ npm installs** (actual tries)
- **5+ GitHub issues/questions** (engagement)
- **2+ positive testimonials** (validation)

### Failure Criteria (Pivot Triggers)
- <10 HN upvotes (message doesn't resonate)
- 0 npm installs (too much friction)
- Negative comments about "over-engineering" (positioning wrong)

---

## Week 2+: Data-Driven Decision

### If Users Love It (>10 active users)
- Finish Sprint 2 (Fast Path, Autonomy)
- Build VSCode extension
- MCP server for Claude Code
- Collect case studies

### If Lukewarm (<10 users, but interest)
- Interview 10 people: what's missing?
- Iterate on positioning
- Try different distribution (demos, tutorials)

### If No Users (crickets)
- Revisit core hypothesis
- Consider CI/team pivot
- Or: slow-burn OSS, keep as personal tool

---

## Critical Success Factors

1. **Demo quality** - Failure recovery must be visceral, not abstract
2. **Friction removal** - `runr init` must work on first try
3. **Response time** - Reply to all comments within 2 hours
4. **Authenticity** - Show real problems, real solutions, real limitations

---

## Launch Assets Checklist

- [x] Operator prompt (RUNR_OPERATOR_PROMPT.txt)
- [x] HN Show post (docs/internal/LAUNCH_HN_SHOW.md)
- [x] Twitter thread (docs/internal/LAUNCH_TWITTER.md)
- [x] Reddit posts (docs/internal/LAUNCH_REDDIT.md)
- [x] `runr init` command
- [ ] `runr watch --auto-resume` command
- [ ] Demo video (3 min, failure recovery)
- [ ] 2 GIFs (failure, resume)
- [ ] Updated README (meta-agent section + demo)
- [ ] npm package update (v0.3.1?)

---

## Next Immediate Action

**Tomorrow (Day 2):**
1. Implement `runr watch --auto-resume`
2. Polish `runr report --json`
3. Test init on 2-3 different repos
4. Update README with init example

**Blockers:**
- None currently

**Questions:**
- None currently

---

**Last Updated:** 2026-01-02 (Day 1 complete)
