# Agent Debug Skill

This skill provides context for debugging agent runs and issues.

## When to Use

Auto-invoke this skill when:
- User mentions an agent run failed or is stuck
- User asks about agent errors or logs
- User wants to understand why verification failed
- Context involves troubleshooting `.agent/runs/`

## Debugging Workflow

### 1. Check Run Status

```bash
# Get current state
agent status <run-id>

# Or check state file directly
cat .agent/runs/<run-id>/state.json | jq .
```

Key fields:
- `phase`: PLAN, IMPLEMENT, VERIFY, REVIEW, STOPPED
- `stop_reason`: complete, error, rejected, review_loop
- `milestone_index`: Current milestone (0-indexed)

### 2. Check Event Log

```bash
# Recent events
tail -20 .agent/runs/<run-id>/events.jsonl | jq .

# Filter by type
grep '"type":"error"' .agent/runs/<run-id>/events.jsonl | jq .
```

### 3. Check Artifacts

```bash
ls -la .agent/runs/<run-id>/artifacts/

# Common artifacts:
# - plan.md: Generated plan
# - verification-*.log: Test output
# - bug-report-*.md: Agent-reported issues
```

## Common Issues

### Scope Violation
```
Error: File not in owned scope: src/other/file.ts
```
**Fix**: Add file to task's `owns` list or check if wrong file was targeted.

### Verification Failed
```
phase: VERIFY, stop_reason: error
```
**Debug**:
1. Check `artifacts/verification-*.log`
2. Run verification manually: `npm run build && npm test`
3. Check if tests are flaky

### Review Loop Detected
```
stop_reason: review_loop
```
**Cause**: Reviewer keeps requesting changes, usually because:
- Verification doesn't produce expected evidence
- Tests aren't actually passing
- Scope is too narrow for the changes needed

**Fix**: Check what reviewer is asking for in events log.

### Worktree Issues
```
Error: Worktree dirty or missing
```
**Debug**:
```bash
# List worktrees
git worktree list

# Check worktree status
cd .agent/worktrees/<run-id> && git status

# Remove stale worktree
git worktree remove .agent/worktrees/<run-id> --force
```

### Stalled Run
Run hasn't progressed for a long time.

**Check**:
```bash
# Last event time
tail -1 .agent/runs/<run-id>/events.jsonl | jq .timestamp

# Worker process
ps aux | grep -E "claude|codex"
```

## Recovery Commands

```bash
# Resume with fresh state
agent resume <run-id> --fresh

# Abort and cleanup
agent abort <run-id>

# Force cleanup worktrees
agent cleanup --force
```

## Reporting Bugs

If you find a framework bug, report it:
1. Create issue: `gh issue create --repo <owner>/agent-framework`
2. Or save to: `.agent/artifacts/bug-report-<timestamp>.md`

See `docs/bug-reporting.md` for template.

## Useful Diagnostics

```bash
# Full run summary
agent summarize <run-id>

# Compare with previous run
diff .agent/runs/<old-id>/state.json .agent/runs/<new-id>/state.json

# Check config
cat .agent/agent.config.json | jq .
```
