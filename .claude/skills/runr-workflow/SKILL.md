---
name: runr-workflow
description: Safe, checkpointed Runr workflow - always verify and bundle before finish
---

# Runr Workflow Skill

You are working in a repository using **Runr** for safe, verified agent work.

## When to Use Runr (Decision Tree)

**REQUIRED - Use `runr run` for:**
- Any change to `src/**` (code changes)
- New features or modules
- Bug fixes
- Refactoring
- Anything that needs verification (build/tests)

**OPTIONAL - Direct editing acceptable for:**
- Documentation only (`docs/**`, `README.md`, `CHANGELOG.md`)
- Spec files and planning artifacts
- Config tweaks (`.runr/runr.config.json`)
- Task file creation (`.runr/tasks/*.md`)

**How to decide:** If it touches code that could break the build or tests, use Runr. If it's just words, direct edit is fine.

## The Runr Loop (For Code Changes)

1. **Create task file** → `.runr/tasks/your-task.md`
2. **Run** → `runr run --task .runr/tasks/your-task.md --worktree`
3. **Verify** → Runr handles build + tests automatically
4. **Checkpoint** → Verified work saved as git commit
5. **Bundle + Submit** → Evidence packet + integration

## Commands You'll Use

- `runr run --task .runr/tasks/<name>.md --worktree` - Start task
- `runr status <run_id>` - Check progress
- `runr resume <run_id>` - Continue from checkpoint
- `runr bundle <run_id>` - Generate evidence packet
- `runr submit <run_id> --to dev --dry-run` - Preview submit
- `runr submit <run_id> --to dev` - Submit verified work

## Safety Rules (CRITICAL - Never Violate)

### Rule 1: Never delete on dirty tree
- Before any file deletion, run: `git status --porcelain`
- If output is non-empty: **REFUSE** with message:
  "Working tree has uncommitted changes. Commit or stash before deletion."

### Rule 2: Never delete outside `.runr/` without explicit file list
- If asked to "clean up" or "remove files", respond:
  "I can only safely delete files within `.runr/` directory.
   For project files, provide explicit file list."
- **Never assume** what "cleanup" means

### Rule 3: Must end with bundle + dry-run
Every task must end with:
```bash
runr bundle <run_id> --output /tmp/bundle.md
runr submit <run_id> --to dev --dry-run
# Review dry-run output
runr submit <run_id> --to dev
```

### Rule 4: Trust verification, not promises
- Verification passed = trustable change
- No verification = not trustable
- Never claim "tests passed" without evidence

## When Things Go Wrong

### Verification fails
1. Read the error output carefully
2. Fix the specific issue
3. Re-verify
4. Don't move to next milestone until verification passes

### Scope violation
1. Stop immediately
2. Run `runr bundle <run_id>`
3. Explain what file was outside scope
4. Ask user to adjust scope or task

### Submit conflict
1. Expect `submit_conflict` event
2. Check timeline.jsonl for conflicted files
3. Inform user - they must resolve manually

## Evidence Discipline

- Always paste command outputs, don't paraphrase
- If verification fails, show the error in full
- Bundle contains the audit trail - use it

**Violation of any safety rule = stop and ask user for clarification.**
