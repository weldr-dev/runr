# Bug Reporting for Agents

When an agent encounters a problem or identifies a potential improvement while using this system, it should capture that feedback. This document explains how.

## When to Report

Report when you encounter:

- **Bugs**: Something doesn't work as expected
- **Friction**: A workflow that's harder than it should be
- **Missing features**: Something you needed but wasn't available
- **Confusing behavior**: Something worked but was unexpected
- **Edge cases**: Scenarios the system doesn't handle well

## How to Report

### Option 1: GitHub Issue (Preferred)

If you have access to `gh` CLI and can create issues:

```bash
gh issue create \
  --repo vonwao/agent-runner \
  --title "[Agent Feedback] Brief description" \
  --body "$(cat <<'EOF'
## Context
- Run ID: <run_id>
- Task: <task_name>
- Milestone: <milestone_index>

## What happened
<description of the problem>

## Expected behavior
<what should have happened>

## Reproduction steps
1. ...
2. ...

## Relevant logs/errors
```
<paste relevant output>
```

## Suggested fix (optional)
<if you have ideas>

---
*Reported automatically by agent during run*
EOF
)"
```

### Option 2: Save to Evidence (Fallback)

If you can't create a GitHub issue, save the bug report as an artifact:

```bash
# Create bug report file
cat > .runr/artifacts/bug-report-$(date +%Y%m%d-%H%M%S).md <<'EOF'
# Bug Report

**Date**: <timestamp>
**Run ID**: <run_id>
**Agent**: <agent_name>

## Issue Type
- [ ] Bug
- [ ] Feature request
- [ ] Friction/UX issue
- [ ] Edge case

## Summary
<one-line summary>

## Details
<full description>

## Context
- What were you trying to do?
- What command/action triggered this?
- What was the state of the system?

## Evidence
<relevant logs, error messages, file states>

## Impact
- [ ] Blocker (can't continue)
- [ ] Major (workaround exists but painful)
- [ ] Minor (annoying but manageable)

## Suggested fix
<optional>
EOF
```

The evidence directory is preserved after the run and can be reviewed later.

### Option 3: Inline in Run Summary

If neither option above is feasible, include the feedback in your run summary or final status message:

```
## Issues Encountered

### [BUG] Worktree cleanup fails silently
When the run ends, worktree cleanup doesn't report errors...
```

## What Makes a Good Report

1. **Reproducible**: Include steps to trigger the issue
2. **Specific**: Exact error messages, not paraphrased
3. **Contextual**: What were you doing when it happened?
4. **Minimal**: Strip out noise, focus on the problem
5. **Actionable**: If you know the fix, suggest it

## Example Reports

### Bug Example

```markdown
## Summary
`owns` validation fails when file path contains spaces

## Details
The scope guard rejects modifications to files with spaces in the path,
even when they're explicitly listed in the `owns` array.

## Reproduction
1. Create task with `owns: ["src/my file.ts"]`
2. Try to edit `src/my file.ts`
3. Get rejection: "File not in owned scope"

## Evidence
```
Error: Scope violation: src/my file.ts not in ["src/my", "file.ts"]
```
The path is being split on spaces instead of treated as a single path.

## Suggested fix
Use proper path parsing instead of string split in `src/ownership/normalize.ts`
```

### Feature Request Example

```markdown
## Summary
Add `--dry-run` flag to show what would be verified without running

## Details
When debugging verification failures, it would help to see:
- Which verification tiers will run
- What commands will be executed
- What files are in scope

Currently you have to run verification to see this, which is slow.

## Use case
Debugging why tier1 keeps failing - want to inspect the verification
plan without waiting for actual execution.
```

## Reviewing Bug Reports

Bug reports saved to `.runr/artifacts/` should be reviewed after runs:

```bash
# List all bug reports
ls -la .runr/artifacts/bug-report-*.md

# Review a specific report
cat .runr/artifacts/bug-report-20251230-141523.md

# Bulk create GitHub issues from saved reports (manual review recommended)
for f in .runr/artifacts/bug-report-*.md; do
  echo "=== $f ==="
  cat "$f"
  echo ""
  read -p "Create issue? [y/N] " yn
  if [[ "$yn" == "y" ]]; then
    title=$(grep "^## Summary" -A1 "$f" | tail -1)
    gh issue create --title "[Agent] $title" --body-file "$f"
    mv "$f" "$f.submitted"
  fi
done
```

## Categories/Labels

When creating GitHub issues, use these labels if available:

- `agent-feedback` - All agent-reported issues
- `bug` - Something broken
- `enhancement` - Feature request
- `dx` - Developer experience / friction
- `edge-case` - Unusual scenario not handled

## Privacy Note

Before submitting, ensure bug reports don't contain:
- API keys or secrets
- Sensitive file contents
- Personal information
- Internal/proprietary code (unless it's the agent-framework repo itself)
