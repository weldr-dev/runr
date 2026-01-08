Status: Implemented
Source: src/commands/doctor.ts, src/workers/*.ts, src/supervisor/runner.ts, src/verification/engine.ts

# Troubleshooting

## Doctor fails: command not found
- Ensure the `bin` value in `runr.config.json` is on PATH.
- Verify `codex --version` and `claude --version` work in your shell.

## Doctor fails: headless mode not supported
- Codex: ensure `--full-auto` is supported by your CLI version.
- Claude: headless mode requires `--output-format json` and `--dangerously-skip-permissions`.

## Worker JSON parse failures
Symptoms:
- `parse_failed` events in the timeline.
- Run stops with `plan_parse_failed`, `implement_parse_failed`, or `review_parse_failed`.

Actions:
- Inspect `.runr/runs/<run_id>/timeline.jsonl` for the output snippet.
- Verify workers are returning JSON between `BEGIN_JSON` and `END_JSON`.
- Ensure Codex is configured for JSONL output (`--json`) and Claude uses JSON output (`--output-format json`).

## Verification failures
- Check `.runr/runs/<run_id>/artifacts/tests_<tier>.log` for stderr/stdout.
- Confirm commands in `runr.config.json` run in the target repo.

## Guard violations
- Guard violations stop the run before or after implementation.
- Inspect `summary.md` and `timeline.jsonl` for details.
- Use `--allow-dirty` or `--allow-deps` if the change is intentional.

## Ownership violations
- Occurs only when a task declares `owns:` and modifies files outside its declared paths.
- Runs without `owns:` are not affected; use `--worktree` if you want isolation without ownership rules.
- The timeline will show `ownership_violation` event with `violating_files`.
- Fix: Either expand the `owns:` patterns in the task frontmatter, or constrain the implementation.
- Note: Renames count as touching both old and new paths (conservative rule for parallel safety).

## Worktree issues

### Worktree location
Worktrees are now stored at `.runr-worktrees/<runId>/` (outside `.runr/`), not inside `.agent/worktrees/`.

This prevents conflicts with denylist patterns like `.runr/**` that could cause workers to refuse operations.

Override the location with `AGENT_WORKTREES_DIR` env var (absolute or relative to repo).

### "Worktree became dirty after env setup"
This error occurs when `git status` shows untracked files after worktree creation.

Common cause: Stale gitdir exclude. The agent writes exclude patterns to the main repo's `.git/info/exclude`. If this fails or patterns are missing, symlinked `node_modules` appears as untracked.

Fix:
```bash
# Check if excludes are present
cat .git/info/exclude

# Manually add if missing
echo "node_modules" >> .git/info/exclude
```

### "Unable to create index.lock"
Git lock contention when creating multiple worktrees simultaneously.

Fix: Stagger worktree creation or clean up stale locks:
```bash
rm .git/worktrees/*/index.lock
git worktree prune
```

## implement_blocked

The worker (Claude/Codex) reported it cannot proceed. Check the `handoff_memo` in `state.json` or `stop.md` for details.

Common causes:
- **Task requires forbidden operations**: Task needs `npm install` but `node_modules` is in denylist
- **Missing dependencies**: Required packages not installed in worktree
- **Unclear requirements**: Task description is ambiguous

Solutions:
- For dependency issues: Run `npm install` in original repo before starting (worktree symlinks node_modules)
- For scope conflicts: Adjust `denylist` patterns or use `--allow-deps` flag
- For unclear tasks: Improve task file with specific requirements

## No events in report
- `--no-write` disables the run store and supervisor loop.
- If `timeline.jsonl` is missing, `report` will show no events.

## Worker execution and shells
- Worker CLIs are executed directly (no shell), so aliases and shell-only syntax are ignored.
- If you need shell logic, wrap the command in a script and point `bin` to it.
