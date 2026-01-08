Status: Implemented
Source: src/workers/codex.ts, src/workers/claude.ts, src/workers/prompts.ts, src/workers/json.ts, src/workers/schemas.ts, src/commands/doctor.ts

# Workers

Workers are external CLIs configured in `runr.config.json` and invoked by the supervisor.

## WorkerConfig
Fields:
- `bin`: executable name on PATH.
- `args`: default arguments for runtime invocations.
- `output`: `text`, `json`, or `jsonl`.

## Codex adapter
- Invoked with configured `args` plus `-C <repo_path>`.
- Expects JSONL output with assistant message events.
- Extracts assistant text blocks and then parses JSON between `BEGIN_JSON` and `END_JSON`.

## Claude adapter
- Invoked with configured `args`.
- If output is JSON, it extracts `result`, `content`, or `message` from the JSON payload.
- Parses JSON between `BEGIN_JSON` and `END_JSON`.

## JSON parsing and retries
- The parser extracts the JSON marker block and validates it with Zod schemas.
- On parse failure, the worker is called once more with stricter output instructions.
- A second failure stops the run and writes a stop memo.

## Doctor behavior
- Uses each worker `bin` from config.
- Runs `--version` for a quick sanity check.
- Uses fixed arguments for headless tests (not the configured `args`).

## Notes
- Worker CLIs are executed directly (no shell), so PATH and arguments must be correct.
- Claude examples use `--dangerously-skip-permissions` for headless execution; this bypasses interactive permission prompts and should be used with care.

## See Also
- [Configuration](configuration.md) - Worker configuration in runr.config.json
- [Architecture](architecture.md) - How workers fit into the system
- [Troubleshooting](troubleshooting.md) - Common worker issues
