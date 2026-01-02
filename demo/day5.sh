#!/bin/bash
set -e

# Demo setup
cd /Users/vonwao/dev/agent-framework
export PS1='$ '

# Ensure runr is available (install globally first: npm install -g @weldr/runr)

# Helper functions
section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  sleep 1
}

pause() {
  sleep "${1:-2}"
}

# ============================================================================
# DEMO START
# ============================================================================

clear
echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                                                                    ║"
echo "║  Runr: AI agents that checkpoint progress and survive failures    ║"
echo "║                                                                    ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
pause 2

# ============================================================================
# 1. SHOW THE TASK (0:10-0:25)
# ============================================================================

section "1. The Task"
echo "Real task from our codebase: Add Python detection to init command"
pause 1
echo ""
echo "$ head -20 .runr/tasks/dogfood-01-polish-init.md"
head -20 .runr/tasks/dogfood-01-polish-init.md
pause 3

# ============================================================================
# 2. SHOW THE FAILURE (0:25-1:00)
# ============================================================================

section "2. What Happened: Verification Failed After 3 Checkpoints"
echo "$ runr report 20260102075326"
pause 1
runr report 20260102075326 | head -35
pause 4

echo ""
echo "→ Stopped after verification_failed_max_retries"
echo "→ But look: CHECKPOINT=192ms(x3) — 3 verified save points"
pause 3

# ============================================================================
# 3. PROVE CHECKPOINTS ARE REAL (1:00-1:35)
# ============================================================================

section "3. Checkpoints Are Real Git Commits"
echo "$ git log --oneline agent/20260102075326/dogfood-01-polish-init | head -5"
pause 1
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -5
pause 3

echo ""
echo "→ Three checkpoint commits. Progress isn't lost."
pause 2

echo ""
echo "$ git show --stat 5c98ffa"
pause 1
git show --stat 5c98ffa | head -15
pause 3

# ============================================================================
# 4. SHOW next_action (1:35-2:05)
# ============================================================================

section "4. Agents Know What To Do Next"
echo "$ runr summarize 20260102075326"
pause 1
runr summarize 20260102075326 | head -3
pause 2

echo ""
echo "$ cat .runr/runs/20260102075326/handoffs/stop.json | jq '{stop_reason, next_actions}'"
pause 1
cat .runr/runs/20260102075326/handoffs/stop.json | jq '{stop_reason, next_actions}'
pause 3

echo ""
echo "→ Runr writes a stop handoff with the next action"
pause 2

# ============================================================================
# CLOSE (2:35-3:00)
# ============================================================================

section "Summary"
echo "Runr isn't smarter. It's harder to kill."
pause 1
echo ""
echo "When your agent derails:"
echo "  • Work is saved in verified checkpoints"
echo "  • Resume from last good state"
echo "  • No restarting from scratch"
pause 2
echo ""
echo "Also: runr watch --auto-resume --max-attempts 3 (bounded autonomy)"
pause 2
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Try it now:"
echo ""
echo "    npm install -g @weldr/runr"
echo "    cd your-project"
echo "    runr init"
echo "    runr run --task .runr/tasks/your-task.md --worktree"
echo ""
echo "  Repo + docs: github.com/anthropics/agent-framework"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
pause 2
