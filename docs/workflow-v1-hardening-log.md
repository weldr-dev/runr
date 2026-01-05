# Workflow v1 Hardening Log

**Status:** Dogfooding (started 2026-01-05)
**Goal:** Capture repeat friction from real `bundle` + `submit` usage (target: 10+ submits)
**Rule:** Fix only what repeats **or** breaks invariants.

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

Force this checklist for next 10 uses:

1. `runr bundle <run_id> > /tmp/bundle.md`
2. `runr submit <run_id> --to dev --dry-run`
3. `git status && git branch --show-current` (spot check invariants)
4. Real submit: `runr submit <run_id> --to dev` (or `--push` if you want Runr to own integration)
5. Log friction if it meets one-minute rule

**If any invariant breaks even once:** stop dogfooding, fix immediately, add regression test.

---

## Release Gate

Ship v1 when:

- ✅ 10 submits succeeded
- ✅ At least 1 conflict case happened and recovered cleanly
- ✅ At least 1 "dirty_tree" and 1 "target_branch_missing" got hit in real life and error was good enough
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
