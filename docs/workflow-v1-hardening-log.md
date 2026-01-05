# Workflow v1 Hardening Log

**Status:** Dogfooding (started 2026-01-05)
**Goal:** Capture repeat friction from real `bundle` + `submit` usage (target: 10+ submits)
**Rule:** Fix only what repeats **or** breaks invariants.

---

## Dogfood Progress

**Submits:** `0/10` ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜

**Gate Cases:**
- dirty_tree: ⬜ (not yet hit)
- target_branch_missing: ⬜ (not yet hit)
- conflict recovery: ⬜ (not yet tested)

**Run:** `./scripts/test-gate-cases.sh` to check off all three at once.

---

## One-minute rule (how to log)
Log an entry only if it:
- cost you **>2 minutes**, or
- you hit it **twice**, or
- it breaks an invariant.

If not, ignore it.

---

## Entry (copy/paste)
```
Date:
Repo:
Run ID:
Command:
Observed:
Expected:
Root cause guess (optional):
Fix idea (1 sentence):
Priority: P0 invariant | P1 blocks | P2 slows | P3 polish

Evidence (optional):
- bundle diff? (yes/no)
- error snippet:
- timeline event(s):
```

---

## Invariants (P0 = stop and fix immediately)

### P0-1 Determinism (bundle)
**Rule:** Same run_id → identical markdown output.
**Quick check:** `runr bundle <id> > /tmp/a && runr bundle <id> > /tmp/b && diff /tmp/a /tmp/b`

### P0-2 Dry-run safety (submit)
**Rule:** `submit --dry-run` changes **nothing**:
- no branch change
- no file changes
- no new timeline events

**Quick check:** capture `git branch --show-current`, `git status --porcelain`, and `wc -l timeline.jsonl` before/after.

### P0-3 Recovery (submit)
**Rule:** submit restores starting branch even on error/conflict.
**Quick check:** run a forced failure and confirm branch restored.

**Note on scope:** Validation failures may append to the run timeline (that's fine), but must never mutate git state.

---

## Dogfood Protocol (for each submit)

**Enforced wrapper (use this):**
```bash
./scripts/dogfood-submit.sh <run_id> --to dev
```

This wrapper automatically:
1. Generates bundle → /tmp/bundle-{run_id}.md
2. Runs submit --dry-run
3. Spot-checks invariants (branch, status, timeline lines)
4. Runs real submit
5. Prompts for push (Git owns push - Option B)
6. Shows OK/FAIL summary
7. Prompts to log friction if it meets one-minute rule

**Push strategy locked:** Option B (Git owns push) for week 1 dogfooding. Cleaner separation of concerns, easier debugging.

**If any invariant breaks even once:** stop dogfooding, fix immediately, add regression test.

---

## Deliberate Gate Testing

**Don't wait for natural occurrence - deliberately trigger validation cases:**

```bash
./scripts/test-gate-cases.sh
```

This script tests:
- ✅ dirty_tree validation (creates uncommitted file, runs submit, checks error)
- ✅ target_branch_missing validation (submits to fake branch, checks error)
- ⚠️  conflict recovery (manual test - see script output for checklist)

**Run this ONCE during dogfooding week to satisfy release gate requirements.**

---

## Release Gate

Ship v1 when:

- ✅ 10 submits succeeded
- ✅ At least 1 conflict case happened and recovered cleanly (use test-gate-cases.sh)
- ✅ At least 1 "dirty_tree" and 1 "target_branch_missing" got hit (use test-gate-cases.sh)
- ✅ No P0 invariant breaks

---

## Entries (append below)

### 2026-__-__
Repo:
Run ID:
Command:
Observed:
Expected:
Fix idea:
Priority:
Evidence:

---

## Patterns (fill after 10 uses)
- P0:
- P1:
- P2:

---

## Fixes applied
- YYYY-MM-DD: <short fix> (ref: entry date)
