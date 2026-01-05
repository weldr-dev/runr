# Internal Dev Process

**Status:** Active (as of 2026-01-05)
**Applies to:** Runr core development (agent-framework repo)

---

## Philosophy

**Dev branch workflow + Runr-native integration**

- Primary development on `dev` branch (no PR ceremony for internal work)
- Runr runs produce verified checkpoints on feature branches/worktrees
- Bundle + submit commands provide PR-like accountability without GitHub ceremony
- Manual git for core development, Runr integration for verified agent work

**Opinionated about trust, flexible about style:**
- Every change has provenance (run_id → checkpoint → evidence → timeline)
- Only verified states are publishable
- No silent behavior (all changes recorded)
- Recovery is first-class

---

## Daily Development Loop

### Loop A: Manual Development (Human)

**Use for:** Core changes, refactoring, bug fixes, quick iterations

```bash
# 1. Start work
git checkout dev
git pull

# 2. Implement changes
# ... edit files ...

# 3. Test
npm test
npm run build

# 4. Commit
git add <files>
git commit -m "feat/fix/chore: description"

# 5. Push
git push origin dev
```

**When to use:**
- Direct code changes
- Quick fixes
- Refactoring
- Anything that doesn't need agent involvement

---

### Loop B: Runr Run Integration (Agent)

**Use for:** Agent-produced work that needs verification

```bash
# 1. Agent produces verified checkpoint on feature branch
# (happens automatically in worktree)

# 2. Review bundle
runr bundle <run_id>
# or save to file for detailed review
runr bundle <run_id> --output /tmp/review.md

# 3. Preview integration
runr submit <run_id> --to dev --dry-run

# 4. If plan looks clean, integrate
runr submit <run_id> --to dev

# 5. Optional: push if ready
git push origin dev
# or: runr submit <run_id> --to dev --push
```

**When to use:**
- Agent completed a task with verification
- Multi-file changes that need audit trail
- Experimental work that needs careful review
- When you want provenance (run_id → evidence → timeline)

---

## Workflow v1 Implementation Protocol

### Execution Rules

**One agent run per milestone:**
1. Agent implements M0 → runs verification → commits
2. Agent implements M1 → verifies on real run ids → commits
3. Agent implements M2 → tests in sandbox only → commits
4. Agent implements M3 → controlled dogfood → commits

**Stop conditions (agent must halt and report):**
- Changes required to public CLI surface beyond spec
- Git operations need complex abstractions not in spec
- Config changes break existing functionality
- Test fixture setup is ambiguous
- Conflict resolution needs interactive mode
- Authentication issues with push
- Run folder structure differs from expected
- Timeline schema needs changes

**Otherwise:** Agent keeps moving. No design-by-chat.

---

### Dogfooding Strategy

**Phase 1: Bundle (Immediate)**
- ✅ Safe to dogfood immediately (read-only)
- Test on completed runs: `runr bundle <real_run_id>`
- Verify output format, determinism, performance

**Phase 2: Submit Dry-Run (After M2 Tests Pass)**
- ✅ Safe after submit tests pass
- Test validation: `runr submit <real_run_id> --to dev --dry-run`
- Verify plan output, validation logic, error messages

**Phase 3: Submit (After Dry-Run Verification)**
- ⚠️ First real submit to throwaway branch for safety
- Create throwaway: `git checkout -b dev-submit-dogfood`
- Test: `runr submit <real_run_id> --to dev-submit-dogfood`
- Verify git log, inspect changes, confirm branch restoration
- If clean: integrate to dev manually

**Phase 4: Full Integration (After Proven Safe)**
- ✅ Use submit directly to dev
- Standard workflow: `runr submit <run_id> --to dev`
- Optional push: `runr submit <run_id> --to dev --push`

---

## NO Self-Hosting Rules (During Workflow v1 Implementation)

**DO NOT use Runr to build Runr during the workflow v1 sprint.**

**Exceptions:**
- ✅ OK: Test `runr bundle` on existing runs (read-only)
- ✅ OK: Test `runr submit --dry-run` (no changes)
- ❌ NOT OK: Use `runr run` or `runr submit` to develop workflow v1 features
- ❌ NOT OK: Run `.runr/tasks/workflow-v1-implementation.md` through Runr

**Why:** Avoid "tool broke itself mid-development" scenarios.

**Development workflow for workflow v1:**
1. Work on `dev` branch directly (manual git)
2. Make commits manually
3. Test in fixture repos / dogfood/ sandbox
4. Only dogfood `submit` on real repo AFTER M2 tests pass

**After workflow v1 ships:** Self-hosting is allowed and encouraged.

---

## What Runr Does vs Doesn't Do

### Runr Provides (The Trust Layer)

**PR-like primitives without PR infrastructure:**
- **PR description** ≈ `runr bundle` output (deterministic markdown packet)
- **PR merge button** ≈ `runr submit` (safe cherry-pick with validation)
- **PR audit trail** ≈ timeline events + checkpoint sidecars
- **Review checklist** ≈ milestones + verification evidence

**Core guarantees:**
- Every change has provenance (run_id → checkpoint_sha → timeline)
- Only verified states are publishable (if configured)
- All repo changes recorded (stashes, drift corrections, lockfiles)
- Recovery is deterministic and explainable

### Runr Does NOT (Stay in Lane)

**Not trying to be:**
- Full IDE
- Git replacement
- CI/CD system
- Code review tool
- Project management system

**Not opinionated about:**
- Branching model (PR-heavy vs dev branch vs trunk)
- Monorepo vs polyrepo
- Test frameworks or CI provider
- Code style / linting
- How many reviewers

---

## Integration Patterns

### Pattern 1: Quick Fix (Manual)

```bash
git checkout dev
# fix typo in README
git add README.md
git commit -m "docs: fix typo"
git push
```

**Use when:** Trivial changes, no verification needed, human confidence high

---

### Pattern 2: Agent Task with Verification (Runr)

```bash
# Start agent run
runr run -f .runr/tasks/some-task.md

# Agent completes with verified checkpoint
# Review bundle
runr bundle <run_id> --output /tmp/review.md

# Preview integration
runr submit <run_id> --to dev --dry-run

# Integrate if clean
runr submit <run_id> --to dev

# Push when ready
git push origin dev
```

**Use when:** Multi-file changes, needs verification, wants audit trail

---

### Pattern 3: Experimental Agent Work (Runr + Manual Cherry-Pick)

```bash
# Agent explores on feature branch
runr run -f .runr/tasks/experimental-feature.md

# Review results
runr bundle <run_id>

# If good but not ready to integrate:
# - Leave on feature branch
# - Manual cherry-pick specific commits later
# - Or: use runr submit when ready

# If not good:
# - Delete worktree/branch (cheap)
# - No pollution of dev
```

**Use when:** Experimental work, uncertain outcome, want isolation

---

## Branch Strategy

**Primary branches:**
- `main` - stable, infrequently updated (releases)
- `dev` - active development, integration point

**Feature branches:**
- Created automatically by Runr in worktrees
- Named: `agent/<run_id>/<task-name>`
- Short-lived (hours to days)
- Deleted after integration or abandonment

**Integration flow:**
```
feature branch → verified checkpoint → bundle review → submit to dev → push
```

**Release flow (future):**
```
dev → accumulated changes → bundle + review → submit to main → tag → push
```

---

## Verification Gates

### What Gets Verified

**Always verified (if configured):**
- Tests pass (npm test)
- Build succeeds (npm run build)
- Type check clean (npm run typecheck)

**Optional verification (tier-dependent):**
- Integration tests
- Lint checks
- Specific commands (configurable)

### When Verification Runs

- **During run:** After each milestone checkpoint
- **Before submit:** Validation checks if verification evidence exists (if required)
- **Manual:** Can run verification commands manually anytime

---

## Timeline Events (Audit Trail)

Every significant action writes a timeline event to `.runr/runs/<run_id>/timeline.jsonl`:

**Core events:**
- `checkpoint_complete` - Checkpoint created with SHA
- `verification_passed` / `verification_failed` - Test results
- `run_submitted` - Checkpoint integrated to branch
- `submit_conflict` - Cherry-pick conflict detected
- `submit_validation_failed` - Submit blocked by validation

**Why this matters:**
- Full provenance chain for every change
- Forensics when things go wrong
- Compliance/audit requirements
- Debugging agent behavior

---

## When to Use Manual Git vs Runr

### Use Manual Git For

- Quick fixes (typos, small edits)
- Refactoring existing code
- Reviewing PRs (if external contributors)
- Emergency hotfixes
- Anything on `main` branch

### Use Runr For

- Agent-driven tasks with milestones
- Changes that need verification evidence
- Experimental work that might fail
- Complex multi-file changes
- When you want audit trail

### Use Both

- Start with Runr run (agent implements)
- Review bundle output
- If changes needed, manual git on feature branch
- Integrate via submit or manual merge

---

## Merge Gate Checks (Pre-Integration)

Before integrating any Runr checkpoint to `dev`, verify:

**Automated checks:**
- [ ] Checkpoint SHA exists and is valid git object
- [ ] Verification evidence present (if required by config)
- [ ] Working tree clean (if required by config)
- [ ] Target branch exists locally
- [ ] No merge conflicts with target

**Manual checks:**
- [ ] Bundle output reviewed and looks correct
- [ ] Dry-run plan is sensible
- [ ] No unexpected file changes
- [ ] Tests pass in feature branch

**For workflow v1 specifically:**
- [ ] M2 tests pass (including conflict + branch restore tests)
- [ ] Bundle deterministic checks pass (run twice, diff identical)
- [ ] Submit dry-run shows clean plan on real run id

---

## Recovery Patterns

### If Agent Run Fails

```bash
# Check diagnosis
runr doctor <run_id>

# Review what happened
runr bundle <run_id>

# Resume if resumable
runr resume <run_id>

# Or abandon and start fresh
# (delete worktree/branch, keep timeline for forensics)
```

### If Submit Fails

```bash
# Check error
runr submit <run_id> --to dev --dry-run

# If validation failed:
# - Fix validation issue (verify tests, clean tree, etc)
# - Retry submit

# If cherry-pick conflict:
# - Review conflicted files in error output
# - Manual resolution:
git checkout dev
git cherry-pick <checkpoint_sha>
# resolve conflicts
git add .
git cherry-pick --continue
```

### If Bundle Breaks

```bash
# Manual fallback (bundle is read-only, no damage)
cat .runr/runs/<run_id>/state.json | jq
git show --stat <checkpoint_sha>
cat .runr/runs/<run_id>/timeline.jsonl | tail -20
```

---

## Current State (as of 2026-01-05)

**Completed:**
- ✅ Checkpoint sidecar metadata (commit `1d43ffd`)
- ✅ Sprint planning (checkpoint resilience + workflow v1)
- ✅ Workflow v1 implementation (commits `ae5070b`, `8b04f6c`, `ba34d72`)
  - M0: Workflow config + init --workflow flag
  - M1: Bundle command (deterministic markdown)
  - M2: Submit command (cherry-pick with validation)
  - M3: Dogfooded on real Runr repo
- ✅ Bundle and submit commands ready for production use

**Available now:**
- `runr bundle <run_id>` - Generate evidence packet
- `runr submit <run_id> --to <branch>` - Cherry-pick verified checkpoint

**Next up:**
- ⏸️ Adopt dev-branch + bundle/submit workflow as steady state

**Backlog:**
- 📋 allow_deps allowlist (checkpoint resilience sprint)
- 📋 Stop reason registry
- 📋 RunState schema versioning (maybe not needed with sidecars)

---

## References

- [Workflow v1 Implementation Task](./.runr/tasks/workflow-v1-implementation.md)
- [Runr-Native Workflow Sprint](./sprints/runr-native-workflow-sprint.md)
- [Checkpoint Resilience Sprint](./sprints/checkpoint-resilience-sprint.md)
- [Architectural Assessment](./architecture/assessment-2026-01-04.md)
