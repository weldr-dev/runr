# Runr-Native Workflow Sprint

**Sprint Goal:** Make Runr the reliability railroad tracks - opinionated about trust, flexible about style

**Duration:** TBD
**Status:** Planning

**Quick Status:**
- 📋 Workflow profiles (solo/PR/trunk modes)
- 📋 `runr bundle` command (evidence packet generator)
- 📋 `runr submit` command (safe merge to integration branch)
- 📋 Timeline integration + config schema

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

**Leverage:** High | **Risk:** Low | **Effort:** Small

**Problem:** Teams have different integration styles. Force one → reject.

**Solution:** Named workflow profiles with sensible defaults.

**Profiles:**

#### Profile: `solo` (default)
- Target: dev branch (or main if no dev)
- Submit: cherry-pick checkpoint commit
- Evidence: required (verification must pass)
- PR: none (use `runr bundle` for review packets)

**Config:**
```yaml
workflow:
  profile: solo
  integration_branch: dev
  release_branch: main
  submit_strategy: cherry-pick
```

#### Profile: `pr`
- Target: GitHub/GitLab PRs
- Submit: generates PR body from bundle
- Evidence: required
- PR: required human approval

**Config:**
```yaml
workflow:
  profile: pr
  integration_branch: main
  submit_strategy: pr
  pr_body_template: .runr/pr-template.md
```

#### Profile: `trunk`
- Target: main directly
- Submit: cherry-pick or fast-forward
- Evidence: required + strict checks
- PR: none (high trust mode)

**Config:**
```yaml
workflow:
  profile: trunk
  integration_branch: main
  submit_strategy: fast-forward
  require_clean_tree: true
```

**Success Criteria:**
- Profile selection via CLI (`runr init --workflow solo`) or config
- Profiles affect behavior of `submit` and `bundle`
- Clear docs explaining each profile's assumptions

---

### 2. `runr bundle` Command

**Leverage:** High | **Risk:** Low | **Effort:** Medium

**Problem:** Runs have all PR-like data, but scattered across files. Need one packet.

**Solution:** Generate human-readable evidence packet from run artifacts.

**Command:**
```bash
runr bundle <run_id> [--output bundle.md]
```

**Generates:**
```markdown
# Run 20260105020229: Fix Chess Rules

## Intent
Implement complete chess rules including special moves.

## Milestones (3/6 completed)
- [x] M0: Core data structures + piece movement
- [x] M1: Move validation + path checking
- [x] M2: Check detection
- [ ] M3: Special moves (castling, en passant, promotion)
- [ ] M4: Game state + endgame detection
- [ ] M5: UI with drag-and-drop

## Verification Evidence
**Tier:** tier0
**Commands:** `npm run build`
**Result:** ✓ Build passed

**Last Checkpoint:** `0fdd53d`
**Files Changed:** 8 files (+922 lines)

## Key Changes
- dogfood/chess-game/src/logic/checkDetection.ts (+234)
- dogfood/chess-game/src/logic/moveValidation.ts (+278)
- dogfood/chess-game/src/logic/pathChecking.ts (+54)

## Timeline Events
- checkpoint_complete (3x)
- verification_passed (3x)
- phase_transition: IMPLEMENT → REVIEW → CHECKPOINT

## Review Notes
See: .runr/runs/20260105020229/review_digest.md

## Run Artifacts
- Timeline: `.runr/runs/20260105020229/timeline.jsonl`
- Journal: `.runr/runs/20260105020229/journal.md`
- State: `.runr/runs/20260105020229/state.json`

---
🤖 Generated with Runr
Run ID: 20260105020229
```

**Implementation Notes:**
- Read from `state.json`, `timeline.jsonl`, `review_digest.md`
- Compute diffstat from checkpoint SHA
- Include tier/commands from `last_verification_evidence`
- Template is customizable (`.runr/bundle-template.md`)

**Success Criteria:**
- `runr bundle <run_id>` generates complete evidence packet
- Works for both completed and stopped runs
- Output is human-readable and copy-pastable
- Can be piped to stdout or written to file

---

### 3. `runr submit` Command

**Leverage:** High | **Risk:** Medium | **Effort:** Medium

**Problem:** Manual cherry-pick is error-prone. Need safe "merge button."

**Solution:** Automated verified-checkpoint-to-integration workflow.

**Command:**
```bash
runr submit <run_id> [--to dev] [--strategy cherry-pick|merge|fast-forward]
```

**Workflow:**
1. **Validate run state**
   - Run must have checkpoint commit
   - Last phase must be CHECKPOINT or FINALIZE
   - Working tree must be clean

2. **Validate target branch**
   - Target branch exists
   - Target branch is not protected (configurable)
   - No uncommitted changes on target

3. **Execute submit strategy**
   - `cherry-pick`: Apply checkpoint commit to target
   - `merge`: Merge run branch into target
   - `fast-forward`: Fast-forward target to checkpoint

4. **Record submission**
   - Append `run_submitted` event to timeline
   - Write submission metadata (target branch, SHA, timestamp)

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
    strategy: 'cherry-pick' | 'merge' | 'fast-forward',
    submitted_at: string
  }
}

// Validation failure
{
  type: 'submit_validation_failed',
  source: 'submit',
  payload: {
    run_id: string,
    reason: 'no_checkpoint' | 'dirty_tree' | 'target_diverged' | 'run_not_complete',
    details: string
  }
}
```

**Safety Checks:**
- Refuse if run has `stop_reason` (not completed cleanly)
- Refuse if working tree is dirty
- Refuse if checkpoint SHA not reachable from current branch
- Warn if target branch has diverged from checkpoint ancestor

**Success Criteria:**
- `runr submit <run_id>` safely merges verified checkpoint
- All validation failures have clear error messages
- Timeline records submission provenance
- Works with all three workflow profiles

---

### 4. Workflow Configuration Schema

**Leverage:** Medium | **Risk:** Low | **Effort:** Small

**Problem:** New workflow concepts need config representation.

**Solution:** Extend `.runr/runr.config.json` with workflow section.

**Schema:**
```typescript
interface WorkflowConfig {
  // Workflow profile: solo, pr, trunk
  profile: 'solo' | 'pr' | 'trunk';

  // Target branch for integration
  integration_branch: string; // default: 'dev' (solo), 'main' (pr/trunk)

  // Release branch (optional)
  release_branch?: string; // default: 'main'

  // Submit strategy
  submit_strategy: 'cherry-pick' | 'merge' | 'fast-forward'; // default: 'cherry-pick'

  // Bundle template path (optional)
  bundle_template?: string; // default: built-in template

  // Submit safety checks
  require_clean_tree?: boolean; // default: true
  require_verification?: boolean; // default: true
  allow_submit_with_stop_reason?: boolean; // default: false

  // Protected branches (cannot submit to)
  protected_branches?: string[]; // default: []
}
```

**Config Example (solo mode):**
```json
{
  "workflow": {
    "profile": "solo",
    "integration_branch": "dev",
    "release_branch": "main",
    "submit_strategy": "cherry-pick",
    "require_clean_tree": true,
    "require_verification": true
  }
}
```

**Success Criteria:**
- Schema validates in `load.ts`
- Defaults are sensible for each profile
- `runr init --workflow <profile>` writes appropriate config

---

## Implementation Order

**Week 1:**
1. Workflow config schema + validation
2. `runr bundle` command (MVP: just markdown generation)

**Week 2:**
3. `runr submit` command (start with cherry-pick only)
4. Submit validation + timeline events

**Week 3:**
5. Profile support (solo/pr/trunk presets)
6. Bundle template customization

---

## Non-Goals (Explicitly Out of Scope)

- **GitHub/GitLab API integration** - defer to later sprint
- **PR comment posting** - can add later if needed
- **Multi-target submit** (submit to dev AND main) - wait for use case
- **Approval workflow** (require N reviews) - too opinionated for v1
- **Merge conflict resolution** - manual for now
- **Rebase support** - cherry-pick is safer

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

## Open Questions

1. **Should `submit` auto-push to remote?**
   - Pro: Completes the workflow
   - Con: Unexpected for some users
   - Decision: Make it opt-in via `--push` flag

2. **Bundle format: Markdown only or also JSON?**
   - Decision: Markdown for humans, add `--json` flag for tooling

3. **What if checkpoint is on a different branch?**
   - Decision: Error with clear message (must be reachable from current branch)

4. **Should bundle include git diff?**
   - Decision: No (too verbose), just diffstat + file list

5. **Allow submit without verification evidence?**
   - Decision: No for solo/trunk, yes for PR mode (since PR has other gates)
