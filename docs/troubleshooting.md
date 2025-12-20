Status: Implemented
Source: src/commands/doctor.ts, src/workers/*.ts, src/supervisor/runner.ts, src/verification/engine.ts

# Troubleshooting

## Doctor fails: command not found
- Ensure the `bin` value in `agent.config.json` is on PATH.
- Verify `codex --version` and `claude --version` work in your shell.

## Doctor fails: headless mode not supported
- Codex: ensure `--full-auto` is supported by your CLI version.
- Claude: headless mode requires `--output-format json` and `--dangerously-skip-permissions`.

## Worker JSON parse failures
Symptoms:
- `parse_failed` events in the timeline.
- Run stops with `plan_parse_failed`, `implement_parse_failed`, or `review_parse_failed`.

Actions:
- Inspect `runs/<run_id>/timeline.jsonl` for the output snippet.
- Verify workers are returning JSON between `BEGIN_JSON` and `END_JSON`.
- Ensure Codex is configured for JSONL output (`--json`) and Claude uses JSON output (`--output-format json`).

## Verification failures
- Check `runs/<run_id>/artifacts/tests_<tier>.log` for stderr/stdout.
- Confirm commands in `agent.config.json` run in the target repo.

## Guard violations
- Guard violations stop the run before or after implementation.
- Inspect `summary.md` and `timeline.jsonl` for details.
- Use `--allow-dirty` or `--allow-deps` if the change is intentional.

## No events in report
- `--no-write` disables the run store and supervisor loop.
- If `timeline.jsonl` is missing, `report` will show no events.

## Worker execution and shells
- Worker CLIs are executed directly (no shell), so aliases and shell-only syntax are ignored.
- If you need shell logic, wrap the command in a script and point `bin` to it.
