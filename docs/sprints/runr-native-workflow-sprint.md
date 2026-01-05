# Runr-Native Workflow Sprint

**Sprint Goal:** Make Runr the reliability railroad tracks - opinionated about trust, flexible about style

**Duration:** 1-2 weeks
**Status:** Planning

**v1 Scope (Ship This):**
- 📋 Workflow config (minimal: 5 fields)
- 📋 Profiles as presets (just default mapping)
- 📋 `runr bundle <run_id>` (deterministic markdown)
- 📋 `runr submit <run_id> --to <branch>` (cherry-pick only)
- 📋 Timeline events + validation

**v2 Scope (Explicitly Deferred):**
- Bundle templates
- Bundle JSON output
- Merge/fast-forward submit strategies
- Protected branches list
- PR API integration

---

## Overview

Runr already creates checkpoints, evidence, and forensics. The next evolution is becoming the **workflow layer** - the thing that makes "verified change → integration" safe and auditable.

### Core Insight

**Runr isn't an agent. It's a reliability workflow that can use agents.**

This is differentiated positioning:
- Everyone else sells "autonomy"
- We sell "safe progress"

### Why Now?

1. Runr runs already contain all structural elements of a PR (diff, evidence, review, audit trail)
2. Users need a workflow that doesn't force GitHub PRs (especially solo/small teams)
3. The "submit verified checkpoint" pattern is already emerging organically
4. External adoption needs clear workflow guidance

---

## Design Philosophy: Opinionated Core, Flexible Edges

### Be Opinionated About (Non-Negotiables)

These are the "trust contract":

1. **Every change has provenance**
   - run_id → checkpoint SHA → evidence → timeline

2. **Only verified states are publishable**
   - You can have intermediate junk
   - `submit` only happens from verified checkpoint

3. **No silent behavior**
   - Stashes, ignores, lockfile changes, drift corrections: always recorded

4. **Recovery is first-class**
   - Resume plans are explicit, deterministic, explainable

### Be Flexible About (Team Preferences)

Don't get into religion wars:

- Git branching model (PR-heavy vs dev branch vs trunk)
- Monorepo vs polyrepo
- Test frameworks
- CI provider
- Code style / linting
- How many reviewers

Instead: **support multiple workflow profiles**.

---

## Sprint Deliverables

### 1. Workflow Profiles (Configuration)

**Leverage:** High | **Risk:** Low | **Effort:** Tiny

**Problem:** Teams have different integration styles. Force one → reject.

**Solution:** Named profiles that set sensible defaults. That's it.

**v1 Config Schema (5 fields only):**

```typescript
interface WorkflowConfig {
  // Workflow profile: solo, pr, trunk
  profile: 'solo' | 'pr' | 'trunk';

  // Target branch for integration
  integration_branch: string;

  // Submit strategy (v1: always cherry-pick)
  submit_strategy: 'cherry-pick';

  // Require clean working tree before submit
  require_clean_tree: boolean;

  // Require verification evidence before submit
  require_verification: boolean;
}
```

**Profile Presets (Just Default Mapping):**

| Profile | integration_branch | require_verification | require_clean_tree |
|---------|-------------------|---------------------|-------------------|
| `solo`  | `dev`             | `true`              | `true`            |
| `pr`    | `main`            | `false`*            | `true`            |
| `trunk` | `main`            | `true`              | `true`            |

*PR profile allows unverified submit because PR has other gates (human approval)

**Config Example:**
```json
{
  "workflow": {
    "profile": "solo",
    "integration_branch": "dev",
    "submit_strategy": "cherry-pick",
    "require_clean_tree": true,
    "require_verification": true
  }
}
```

**What PR Profile Does in v1:**
- Sets defaults (main branch, verification optional)
- Bundle output is PR-ready markdown
- **No actual PR automation** (that's v2)

**Success Criteria:**
- Profile selection via `runr init --workflow solo` writes config
- Profiles are just preset defaults (no behavior magic)
- User can override any field in config
- Submit command respects config validation rules

---

### 2. `runr bundle` Command

**Leverage:** High | **Risk:** Low | **Effort:** Small

**Problem:** Runs have all PR-like data, but scattered across files. Need one packet.

**Solution:** Generate deterministic markdown evidence packet. No templating, no heuristics.

**Command:**
```bash
runr bundle <run_id>                    # stdout
runr bundle <run_id> --output bundle.md # file
```

**Output Format (Fixed, Deterministic):**
```markdown
# Run 20260105020229

**Created:** 2026-01-05T02:02:39Z
**Repo:** /Users/vonwao/dev/agent-framework/.runr-worktrees/20260105020229
**Checkpoint:** 0fdd53d (or "none")
**Status:** STOPPED (verification_failed_max_retries)

## Milestones (3/6)
- [x] M0: Core data structures + piece movement
- [x] M1: Move validation + path checking
- [x] M2: Check detection
- [ ] M3: Special moves (castling, en passant, promotion)
- [ ] M4: Game state + endgame detection
- [ ] M5: UI with drag-and-drop

## Verification Evidence
**Tier:** tier0
**Commands:** npm run build
**Result:** ✓ PASSED

## Changes (since checkpoint base)
8 files changed, 922 insertions(+), 0 deletions(-)

 dogfood/chess-game/src/logic/checkDetection.ts | 234 ++++++
 dogfood/chess-game/src/logic/moveValidation.ts | 278 ++++++
 dogfood/chess-game/src/logic/pathChecking.ts   |  54 ++
 dogfood/chess-game/src/logic/pieceMovement.ts  | 236 ++++++
 dogfood/chess-game/src/types.ts                |  53 ++
 dogfood/chess-game/package.json                |  17 +
 dogfood/chess-game/tsconfig.json               |  20 +
 dogfood/chess-game/package-lock.json           |  30 +

## Timeline Event Summary
- checkpoint_complete: 3
- verification_passed: 3
- phase_transition: 10

## Artifacts
- Timeline: .runr/runs/20260105020229/timeline.jsonl
- Journal: .runr/runs/20260105020229/journal.md
- State: .runr/runs/20260105020229/state.json
- Review: .runr/runs/20260105020229/review_digest.md

---
🤖 Generated with Runr
```

**What Bundle Includes (v1):**
- run_id + repo path + created_at (from state.json)
- checkpoint SHA (or "none")
- milestone checklist (from state.milestones)
- verification evidence summary (from last_verification_evidence)
- diffstat (via `git show --stat <checkpoint_sha>`)
- timeline event counts (aggregate by type)
- artifact pointers (paths only)

**What Bundle Does NOT Include (v1):**
- Custom templates (deferred to v2)
- JSON output (deferred to v2)
- Full timeline dump (just counts)
- Git diff content (too verbose)
- "Key files" heuristics (too magical)

**Success Criteria:**
- `runr bundle <run_id>` outputs deterministic markdown
- Takes <2 seconds
- Works for completed, stopped, and in-progress runs
- Output is copy-pastable to Slack/GitHub/email
- If checkpoint missing, shows "none" and warns

---

### 3. `runr submit` Command

**Leverage:** High | **Risk:** Medium | **Effort:** Medium

**Problem:** Manual cherry-pick is error-prone. Need safe "merge button."

**Solution:** Automated verified-checkpoint-to-integration. Cherry-pick only (v1).

**Command:**
```bash
runr submit <run_id> --to <branch>  # execute
runr submit <run_id> --to <branch> --dry-run  # preview
runr submit <run_id> --to <branch> --push     # execute + push
```

**Workflow:**
1. **Validate run state** (fail fast with single actionable error)
   - Run has checkpoint SHA
   - Checkpoint SHA exists locally (git object present)
   - Verification evidence exists (if `require_verification: true`)
   - Working tree clean (if `require_clean_tree: true`)

2. **Validate target branch**
   - Target branch exists locally
   - Target branch working tree clean
   - Current repo matches run repo (not in different worktree)

3. **Execute cherry-pick**
   - Checkout target branch
   - Cherry-pick checkpoint SHA
   - If conflicts: abort + report error (manual resolution required)

4. **Record submission** (only if cherry-pick succeeds)
   - Append `run_submitted` event to run timeline
   - Include: run_id, checkpoint_sha, target_branch, timestamp

5. **Optional push** (if `--push` flag)
   - Push target branch to remote
   - Record `run_pushed` event

**Events:**
```typescript
// Success
{
  type: 'run_submitted',
  source: 'submit',
  payload: {
    run_id: string,
    checkpoint_sha: string,
    target_branch: string,
    strategy: 'cherry-pick', // always in v1
    submitted_at: string
  }
}

// Validation failure
{
  type: 'submit_validation_failed',
  source: 'submit',
  payload: {
    run_id: string,
    reason: 'no_checkpoint' | 'dirty_tree' | 'no_verification' | 'checkpoint_missing' | 'wrong_repo',
    details: string // single actionable error message
  }
}

// Cherry-pick conflict
{
  type: 'submit_conflict',
  source: 'submit',
  payload: {
    run_id: string,
    checkpoint_sha: string,
    target_branch: string,
    conflicted_files: string[]
  }
}
```

**--dry-run Behavior:**
- Runs all validations
- Prints what would happen
- Exits 0 if would succeed, 1 if would fail
- Does NOT execute cherry-pick
- Does NOT write events

**Success Criteria:**
- `runr submit <run_id> --to dev` cherry-picks verified checkpoint
- `--dry-run` shows exactly what will happen
- Validation failures have single, actionable error
- Timeline records submission provenance
- Cherry-pick conflicts are detected and aborted cleanly
- `--push` is opt-in (never auto-pushes)

---

## Implementation Order (1-2 Weeks)

**Pass 1: MVP (Week 1)**
1. Workflow config schema (5 fields only)
2. Profile presets as default mapping (tiny, do inline with #1)
3. `runr bundle <run_id>` (deterministic markdown to stdout)
4. `runr submit <run_id> --to <branch>` (cherry-pick only, no push)
5. Submit validation + timeline events

**Pass 2: Polish (Days 8-10)**
6. `--dry-run` flag for submit
7. `--push` flag for submit
8. `--output` flag for bundle
9. Error messages polish + testing

---

## Non-Goals (Explicitly Out of Scope for v1)

**Deferred to v2:**
- Bundle templates (custom formatting)
- Bundle JSON output (stable schema required first)
- Merge/fast-forward submit strategies (cherry-pick is safest)
- Protected branches list (can refuse main manually for now)
- PR API integration (GitHub/GitLab automation)
- Approval workflow (require N reviews)
- Multi-target submit (cascade to multiple branches)
- Merge conflict resolution (manual for now)
- Auto-push by default (always opt-in)

---

## Risk Assessment

### Low Risk
- Config changes are additive
- `bundle` is read-only (no git operations)
- Submit validation prevents most footguns

### Medium Risk
- `submit` does git operations (cherry-pick/merge)
- Need good rollback story if submit fails
- Edge case: checkpoint SHA not reachable from target

### Migration Strategy
- **No breaking changes to existing commands**
- New commands are opt-in
- Existing manual workflows still work
- Config defaults match current behavior

---

## Success Metrics

**Workflow Clarity:**
- Users can choose a profile and understand its assumptions
- Submit command replaces manual cherry-pick
- Bundle provides all PR-like info without GitHub

**Safety:**
- Submit validation catches 95%+ of bad states
- No accidental force-pushes or dirty commits
- Timeline always shows provenance

**UX:**
- `runr bundle` takes <2 seconds
- `runr submit` completes in <5 seconds
- Error messages are actionable

**Adoption Signal:**
- External users choose a workflow profile during init
- Submit events show up in timeline
- Bundle markdown gets shared in team chats

---

## Follow-up Work (Future Sprints)

After this sprint, consider:

### Phase 2: PR Integration
- `runr submit --pr` creates GitHub PR with bundle as body
- PR checklist auto-generated from milestones
- Status checks integration

### Phase 3: Approval Gates
- `runr gate <run_id>` requires N approvals
- Approvals recorded in timeline
- Blocks submit until gate passes

### Phase 4: Release Workflow
- `runr release --from dev --to main --tag v1.2.3`
- Release notes from bundle + changelog
- Tag + push in one atomic operation

### Phase 5: Multi-Branch Coordination
- `runr submit --cascade dev,staging,main`
- Dependency tracking between runs
- Conflict detection across branches

---

## References

- Current manual workflow: cherry-pick checkpoint commits
- Related work: checkpoint sidecar (provides provenance)
- User request: "dev branch, no PR spam" workflow
- Design principle: opinionated about trust, flexible about style

---

## Decisions (Closed Questions)

1. **Should `submit` auto-push to remote?**
   - ✅ No. Make it opt-in via `--push` flag.
   - Rationale: Never surprise users with remote operations.

2. **Bundle format: Markdown only or also JSON?**
   - ✅ Markdown only in v1. JSON deferred to v2.
   - Rationale: JSON becomes a forever-API. Don't commit to stable schemas casually.

3. **What if checkpoint is on a different branch?**
   - ✅ Cherry-pick doesn't require "reachable," just that SHA exists locally.
   - Validation: "checkpoint SHA exists locally and cherry-pick succeeds."

4. **Should bundle include git diff?**
   - ✅ No. Just diffstat + file list.
   - Rationale: Full diff is too verbose for review packet.

5. **Allow submit without verification evidence?**
   - ✅ In `pr` profile: `require_verification=false` is OK (PR has other gates).
   - ✅ Bundle must clearly show "UNVERIFIED" at top if no evidence.
   - ✅ In `solo`/`trunk`: verification required by default.
