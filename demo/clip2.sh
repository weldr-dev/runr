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
# CLIP 2: next_action (for GIF)
# ============================================================================

section "Agents Know What To Do Next"
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
