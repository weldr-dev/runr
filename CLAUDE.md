# Claude Code Integration

This project uses Runr with Claude Code for agent tasks.

## Quick Start

1. Ensure Claude Code is installed and configured
2. Create tasks in `.runr/tasks/`
3. Run: `runr run --task .runr/tasks/your-task.md --worktree`
4. Submit: `runr submit <run_id> --to dev`

**Runr-native workflow is the happy path.** Manual cherry-pick is the escape hatch only.

**Tip:** If your project has a submit wrapper (e.g., `./scripts/submit-wrapper.sh`), use that instead for automated safety checks.

## How Runr Works with Claude

Runr orchestrates Claude through a phase-gated workflow:

1. **Plan**: Claude reads the task and plans implementation
2. **Implement**: Worker executes the plan, making changes
3. **Review**: Claude reviews changes against requirements
4. **Verify**: Runr runs verification commands
5. **Checkpoint**: If verified, create checkpoint with evidence

## Configuration

See `.runr/runr.config.json` for:

- Worker configuration (Claude/Codex)
- Phase assignments
- Verification tiers
- Scope and file patterns

## Determinism & Safety Are Sacred (Non-Negotiables)

These invariants are enforced by wrappers:

**P0-1 Determinism (bundle):**
- Same run_id → identical markdown output
- Quick check: `runr runs bundle <id> > /tmp/a && runr runs bundle <id> > /tmp/b && diff /tmp/a /tmp/b`

**P0-2 Dry-run safety (submit):**
- `submit --dry-run` changes **nothing**: no branch change, no file changes, no new timeline events
- Quick check: capture branch + status + timeline lines before/after

**P0-3 Recovery (submit):**
- Submit always restores starting branch, even on failure
- Quick check: run forced failure, confirm branch restored

**If anything violates P0 → stop and add regression test immediately.**

## Concrete Commands (Copy-Paste)

**Bundle evidence:**
```bash
runr runs bundle <run_id> --output /tmp/bundle-<run_id>.md
```

**Submit to integration branch:**
```bash
runr submit <run_id> --to dev
```

**Dry-run first (recommended):**
```bash
runr submit <run_id> --to dev --dry-run
```

## What To Do When Things Go Wrong

**Submit conflict:**
- Expect: `submit_conflict` event written + clean tree + branch restored
- Check: timeline.jsonl for conflicted files list
- Resolve: manual cherry-pick or rebase checkpoint

**Validation fails:**
- Expect: `submit_validation_failed` event written, **no git mutations**
- Check: error message for specific validation reason (dirty_tree, verification_missing, etc.)
- Resolve: fix validation issue, retry submit

**Any P0 violation:**
- Stop immediately
- Add regression test to prevent recurrence
- Escalate to project maintainers

## Tips for Claude

- Always verify incrementally during implementation
- If verification fails, fix issues before review
- Keep changes focused on task requirements
- Use verification results to guide decisions

## Meta-Agent Safety Contract

If you are a meta-agent driving Runr workflows, you MUST obey these rules:

**Rule 1: Never delete on dirty tree**
- Before any file deletion, check: `git status --porcelain`
- If output is non-empty, refuse deletion with: "Working tree has uncommitted changes. Commit or stash before deletion."

**Rule 2: Never delete outside `.runr/` without explicit file list**
- If asked to "clean up" or "remove files", respond: "I can only safely delete files within `.runr/` directory. For project files, provide explicit file list."
- Never assume what "cleanup" means

**Rule 3: Must end with bundle + dry-run**
- Every task execution must end with:
  ```bash
  runr runs bundle <run_id> --output /tmp/bundle-<run_id>.md
  runr submit <run_id> --to dev --dry-run
  runr submit <run_id> --to dev
  ```
- Generate review artifact even if coding manually

**Violation of any rule = stop and ask user for clarification.**

## Workflow: solo

This project uses the **solo** pack:

- Integration branch: `dev`
- Release branch: `main`
- Requires verification: Yes
- Requires clean tree: Yes

Only verified checkpoints can be submitted to production branches.
