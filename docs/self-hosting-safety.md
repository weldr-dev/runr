# Self-Hosting Safety Guide

## Overview
When using the agent framework to modify itself, extra guardrails are required.
This document defines what's safe to touch and what requires protection.

## Boot Chain (PROTECTED)

These files form the "minimum runnable core" - if broken, the tool bricks itself.

```
src/supervisor/runner.ts      # Phase orchestration - CRITICAL
src/supervisor/state-machine.ts # State transitions - CRITICAL
src/store/run-store.ts        # Persistence - CRITICAL
src/workers/json.ts           # JSON marker parsing - CRITICAL
src/workers/claude.ts         # Worker protocol - CRITICAL
src/workers/codex.ts          # Worker protocol - CRITICAL
src/commands/resume.ts        # Resume mechanism - CRITICAL
src/config/load.ts            # Config loading - CRITICAL
src/cli.ts                    # Entry point - CRITICAL
```

**Rule:** Never include boot chain files in allowlist for self-hosted runs until explicitly requested AND with external verification.

## External Verification Commands

After ANY self-modification, run these externally (not via the agent):

```bash
# 1. Build still works
pnpm build

# 2. Tests still pass
pnpm test

# 3. Doctor command works
node dist/cli.js doctor

# 4. Can parse a known-good run
node dist/cli.js report <known-run-id>
```

## Known-Good Recovery

Always maintain a recovery path:

```bash
# Tag before self-hosting session
git tag known-good-$(date +%Y%m%d)

# Recovery command
git reset --hard known-good-YYYYMMDD && pnpm install && pnpm build && pnpm test
```

---

## Sprint 2 Task Safety Analysis

### ✅ SAFE: 001_kpi_scoreboard.md

**Risk Level:** Low - purely additive instrumentation

**Why safe:**
- Adds new fields to schemas (additive)
- Adds new methods to run-store (additive)
- New compare command (new file)
- Doesn't change core execution flow

**Allowlist:**
```json
{
  "scope": {
    "allowlist": [
      "src/types/schemas.ts",
      "src/store/run-store.ts",
      "src/commands/report.ts",
      "src/commands/compare.ts"
    ],
    "denylist": [
      "src/supervisor/runner.ts",
      "src/workers/*.ts",
      "src/cli.ts"
    ]
  }
}
```

**Canary check:** `node dist/cli.js doctor && node dist/cli.js report <test-run>`

---

### ✅ SAFE: 002_context_packer.md

**Risk Level:** Low - new module behind a flag

**Why safe:**
- Entirely new `src/context/` directory
- Can be built and tested in isolation
- Integration is additive (new param to prompt builders)
- Can be feature-flagged

**Allowlist:**
```json
{
  "scope": {
    "allowlist": [
      "src/context/**",
      "src/workers/prompts.ts"
    ],
    "denylist": [
      "src/supervisor/**",
      "src/store/**",
      "src/workers/claude.ts",
      "src/workers/codex.ts"
    ]
  }
}
```

**Canary check:** `pnpm test && node dist/cli.js doctor`

---

### ⚠️ CAUTION: 003_fast_path.md

**Risk Level:** Medium - changes phase flow

**Why caution:**
- Modifies supervisor phase logic
- Changes when PLAN/REVIEW run
- Could break normal flow if implemented wrong

**Self-hosting approach:**
1. First milestone: Add flag parsing only (safe)
2. Second milestone: Add detection heuristics (safe, no behavior change)
3. Third milestone: Wire up abbreviated flow (NEEDS EXTERNAL VERIFICATION)

**Allowlist (Phase 1-2 only):**
```json
{
  "scope": {
    "allowlist": [
      "src/config/schema.ts",
      "src/commands/run.ts"
    ],
    "denylist": [
      "src/supervisor/runner.ts"
    ]
  }
}
```

**Phase 3:** Do NOT self-host. Implement manually with full test coverage first.

---

### ⚠️ CAUTION: 004_adaptive_autonomy.md

**Risk Level:** Medium-High - changes retry/stop behavior

**Why caution:**
- Modifies core supervisor loop behavior
- Changes when runs stop vs continue
- Could cause infinite loops or premature stops

**Self-hosting approach:**
1. Milestone 1 (config schema): Safe to self-host
2. Milestone 2-4 (retry logic): Do NOT self-host initially

**Allowlist (Milestone 1 only):**
```json
{
  "scope": {
    "allowlist": [
      "src/config/schema.ts"
    ],
    "denylist": [
      "src/supervisor/**"
    ]
  }
}
```

---

### 🚫 DO NOT SELF-HOST: 005_throughput.md

**Risk Level:** High - changes execution semantics

**Why dangerous:**
- Parallel execution changes timing/ordering
- Command batching changes error semantics
- Model tiering touches worker protocol
- Hard to rollback if broken

**Approach:** Implement entirely manually with extensive testing before any self-hosting.

---

## Self-Hosting Checklist

Before each self-hosted run:

- [ ] Working in a fresh worktree or dedicated clone
- [ ] Tagged known-good commit
- [ ] Allowlist explicitly set (not using defaults)
- [ ] Denylist includes ALL boot chain files
- [ ] Max 2 milestones
- [ ] Wall clock cap set (e.g., 30 minutes)
- [ ] External verification commands ready

After each self-hosted run:

- [ ] Run `pnpm build` externally
- [ ] Run `pnpm test` externally
- [ ] Run `node dist/cli.js doctor` externally
- [ ] Review diff before committing
- [ ] Test a normal (non-self) run to verify nothing broke

---

## Recommended Self-Hosting Order

1. **KPI Scoreboard** - Safe, purely additive
2. **Context Packer** - Safe, new module
3. **Fast Path (config only)** - Safe, no behavior change
4. **Autonomy (config only)** - Safe, no behavior change

Then manually implement:
- Fast Path (phase flow changes)
- Autonomy (retry logic)
- Throughput (all of it)

---

## Two-Phase Protocol Changes

If ever modifying worker protocol (prompts + parsers):

**Phase 1:** Add backward-compatible parsing
```typescript
// Accept both old and new format
const result = parseNewFormat(output) ?? parseOldFormat(output);
```

**Phase 2:** Update prompts/emitters (separate run)

**Never** change parser and emitter in the same run.
