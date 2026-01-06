# 01: Redaction Foundation

## Goal
Prevent command output capture from leaking secrets (tokens, API keys, credentials).

## Requirements

### 1. Create Redactor Module
Create `src/redaction/redactor.ts`:
- Pattern-based redaction for common secret patterns
- Patterns to detect:
  - `TOKEN=...`, `API_KEY=...`, `SECRET=...` (env var assignments)
  - `Bearer ...`, `Basic ...` (auth headers)
  - `AWS_`, `SUPABASE_`, `OPENAI_`, `ANTHROPIC_` prefixes
  - Long hex strings (40+ chars, likely tokens)
  - npm auth tokens, GitHub tokens (ghp_, gho_)
- Replace matches with `[REDACTED]`
- Export `redact(text: string): string` function

### 2. Add Config Options
Extend `runr.config.json` schema to support:
```json
{
  "receipts": {
    "redact": true,
    "capture_cmd_output": "full" | "truncated" | "metadata_only",
    "max_output_bytes": 10240
  }
}
```

Defaults:
- `redact: true`
- `capture_cmd_output: "truncated"`
- `max_output_bytes: 10240` (10KB)

### 3. Update Intervention Receipt Writer
Modify `src/receipt/intervention.ts`:
- Read receipts config from runr.config.json
- Apply redaction to command stdout/stderr before storing
- Respect `capture_cmd_output` setting:
  - `full`: store all output (redacted)
  - `truncated`: store up to max_output_bytes (redacted)
  - `metadata_only`: only store exit_code, duration_ms, stdout_lines, stderr_lines
- Always store exit code + duration even when output suppressed

### 4. Add CLI Flag Override
Extend `runr intervene`:
- `--cmd-output full|truncated|metadata_only|none` (overrides config)

### 5. Tests
- Token-like strings are redacted
- `metadata_only` stores no output text
- Config options are respected
- CLI flag overrides config

## Scope
allowlist_add:
  - src/redaction/**
  - src/receipt/intervention.ts
  - src/config/schema.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
# Build succeeds
npm run build

# Tests pass
npx vitest run src/redaction

# Redactor works (manual check)
# echo "TOKEN=secret123" | should become "TOKEN=[REDACTED]"

# Config schema accepts new fields
npm run dev -- init --pack solo --dry-run --repo /tmp/test-redact
```
