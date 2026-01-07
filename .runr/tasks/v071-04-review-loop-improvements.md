# 04: Review Loop Kill Switch - Make Loops Rare

## Goal
Tighten the review loop to make STOPPED runs the exception, not the norm. When loops do occur, provide exact recovery commands.

## Problem
Review loops happen when:
1. Reviewer requests changes that aren't in verifier output
2. Implementer doesn't have enough context to satisfy reviewer
3. Mismatch between review expectations and actual verification

The diagnostics are good, but we can do better at preventing loops and making recovery obvious.

## Requirements

### 1. Unmet Check Extraction
When STOPPED with `review_loop_detected`:
- Parse the last review response for specific unmet checks
- Categorize checks: test coverage, type errors, lint, documentation, etc.
- Include the exact commands to satisfy each check

**Example output:**
```
Review Loop Detected (round 3/2)

Unmet checks:
  1. Type errors remain
     Fix: npm run typecheck
     Last output: 3 errors in src/foo.ts

  2. Missing test coverage
     Fix: npm test -- --coverage
     Requirement: >80% on changed files

Suggested recovery:
  runr intervene 20260107120000 --reason review_loop \
    --note "Fixed type errors and added tests" \
    --cmd "npm run typecheck" --cmd "npm test"
```

### 2. Review Contract (Machine-Readable Checks)
Extend the review response parsing to extract structured checks:
```json
{
  "checks": [
    {
      "type": "typecheck",
      "command": "npm run typecheck",
      "requirement": "0 errors",
      "current": "3 errors"
    },
    {
      "type": "coverage",
      "command": "npm test -- --coverage",
      "requirement": "80%",
      "current": "65%"
    }
  ]
}
```

### 3. Add `runr resume --after <cmd>` Flag
Allow running a command before resume and attaching output to run artifacts:

```bash
runr resume 20260107120000 --after "npm run typecheck && npm test"
# Runs commands
# If all pass (exit 0), resumes run with evidence attached
# If any fail, shows output and aborts resume
```

This creates a mini-intervention without requiring full `runr intervene` ceremony.

### 4. Pre-Check Before Resume
When `runr resume` is called on a `review_loop_detected` run:
- Show the unmet checks from the last review
- Suggest `--after` with the required commands
- Warn if resuming without running the checks

```
Warning: This run stopped due to review_loop_detected.

Last unmet checks:
  - npm run typecheck (3 errors)
  - npm test (65% coverage, need 80%)

Resume anyway? Or try:
  runr resume 20260107120000 --after "npm run typecheck && npm test"
```

### 5. Evidence Attachment
When `--after` commands succeed:
- Capture output (redacted)
- Store in run artifacts: `evidence/pre-resume-<timestamp>.json`
- Include in timeline: `pre_resume_check_passed` event

### 6. Improve Verifier-Reviewer Alignment
Add a config option to make verifier output available to reviewer:
```json
{
  "review": {
    "include_verifier_output": true
  }
}
```

This reduces loops caused by reviewer not knowing what passed.

## Tests
- Unmet checks are extracted from review responses
- `--after` runs commands and captures output
- Failed `--after` aborts resume
- Evidence is stored correctly
- Pre-check warning appears for review_loop runs

## Scope
allowlist_add:
  - src/supervisor/runner.ts
  - src/commands/resume.ts
  - src/receipt/evidence.ts
  - src/review/check-parser.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: trigger review loop, verify unmet checks shown
# Manual: test --after flag with passing/failing commands
```
