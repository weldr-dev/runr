#!/bin/bash
set -e

cd /Users/vonwao/dev/agent-framework
export PS1='$ '

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

clear

# ============================================================================
# CLIP 1: Failure + Checkpoints (for GIF)
# ============================================================================

section "What Happened: Verification Failed After 3 Checkpoints"
echo "$ runr report 20260102075326"
pause 1
runr report 20260102075326 | head -35
pause 4

echo ""
echo "→ Stopped after verification_failed_max_retries"
echo "→ But look: CHECKPOINT=192ms(x3) — 3 verified save points"
pause 3

section "Checkpoints Are Real Git Commits"
echo "$ git log --oneline agent/20260102075326/dogfood-01-polish-init | head -5"
pause 1
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -5
pause 3

echo ""
echo "→ Three checkpoint commits. Progress isn't lost."
pause 2
