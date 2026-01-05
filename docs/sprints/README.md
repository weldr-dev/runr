# Sprint Planning

This directory contains sprint plans and detailed specifications for Runr development.

---

## Active Sprints

### [Checkpoint Resilience Sprint](./checkpoint-resilience-sprint.md)

**Status:** In Progress (1/4 complete)
**Goal:** Make checkpoint/resume mechanism bulletproof and add essential forensics infrastructure

**Progress:**
- ✅ Checkpoint Metadata Sidecar (completed Jan 5, commit `1d43ffd`)
- ⏸️ Structured allow_deps with Allowlist (next)
- 📋 Stop Reason Registry (backlog)
- 📋 RunState Schema Versioning (backlog)

### [Runr-Native Workflow Sprint](./runr-native-workflow-sprint.md)

**Status:** Planning
**Goal:** Make Runr the reliability railroad tracks - opinionated about trust, flexible about style

**Key Deliverables:**
1. Workflow Profiles - Choose your integration style (solo/PR/trunk modes)
2. `runr bundle` command - Generate evidence packet from run artifacts
3. `runr submit` command - Safe merge of verified checkpoint to integration branch
4. Workflow config schema - Configure workflow preferences

**Total Effort:** ~800 LOC, 2-3 weeks
**Risk:** Medium (git operations in submit command)

---

## Detailed Specifications

All specs follow this template:
- **Priority:** HIGH / MEDIUM / LOW
- **Effort:** Tiny / Small / Medium / Large
- **Risk:** Low / Medium / High
- **Problem:** What issue this addresses
- **Solution:** How we'll fix it
- **Implementation Plan:** Step-by-step rollout
- **Testing Strategy:** Unit and integration tests
- **Success Criteria:** What "done" looks like

### 1. [Checkpoint Metadata Sidecar](./specs/checkpoint-metadata-sidecar.md)

**Priority:** HIGH | **Effort:** Small (~150 LOC) | **Risk:** Low

Git commit messages are not a database. This spec adds `.runr/checkpoints/<sha>.json` sidecar files to store checkpoint metadata, making resume bulletproof against git history rewrites.

**Key Features:**
- Sidecar files alongside git commits (not instead of)
- Resume reads sidecar first, falls back to git log parsing
- No breaking changes to existing runs
- Faster, more reliable resume

---

### 2. [Structured allow_deps with Allowlist](./specs/allow-deps-allowlist.md)

**Priority:** HIGH | **Effort:** Medium (~300 LOC) | **Risk:** Low

Binary on/off switch for deps blocks adoption. This spec adds allowlist mode where users can specify exactly which packages are allowed.

**Key Features:**
- CLI: `--allow-deps zod,date-fns`
- Config: Persistent allowlist in runr.config.json
- Timeline event: `lockfile_changed` with forensics (diffstat, package count)
- Validation: Block disallowed packages with helpful errors
- Default unchanged: Strict mode (no deps)

---

### 3. [Stop Reason Registry](./specs/stop-reason-registry.md)

**Priority:** MEDIUM | **Effort:** Small (~100 LOC) | **Risk:** Low

Stop reasons are informal strings scattered across the codebase. This spec creates a central registry with families, exit codes, and default diagnoses.

**Key Features:**
- Single source of truth for all stop reasons
- Structured metadata (family, exit code, diagnosis, auto_resumable)
- Type-safe constants (no more string literals)
- Diagnosis becomes registry lookup, not string matching
- Consistent CLI exit codes

---

### 4. [RunState Schema Versioning](./specs/runstate-schema-version.md)

**Priority:** MEDIUM | **Effort:** Tiny (~30 LOC) | **Risk:** Low

RunState has no schema version, making future evolution risky. This spec adds a `schema_version` field with semver-like versioning.

**Key Features:**
- Add `schema_version: "1.0.0"` field to RunState
- Backward compatible (legacy runs get "0.0.0")
- Versioning rules (MAJOR/MINOR/PATCH)
- Foundation for future schema migrations

---

## Architecture Reference

- [Architectural Assessment (2026-01-04)](../architecture/assessment-2026-01-04.md)
  - Full architectural review
  - What's strong, what's biting, what to improve
  - Long-term vision

---

## Implementation Timeline

### Week 1: Core Infrastructure
**Days 1-2:** RunState Schema Versioning + Checkpoint Metadata Sidecar (write path)
**Days 3-4:** Checkpoint Metadata Sidecar (read path + drift detection)
**Day 5:** Integration testing, polish

### Week 2: Deps & Diagnosis
**Days 1-2:** Stop Reason Registry (refactoring)
**Days 3-4:** allow_deps Allowlist (lockfile parsing + validation)
**Day 5:** allow_deps Forensics (timeline events + polish)

---

## Success Metrics

### Checkpoint Resilience
- [ ] Resume succeeds even after git rebase/squash
- [ ] Drift detection uses sidecar (faster, more reliable)
- [ ] Legacy runs still work (backward compatible)

### Deps Safety
- [ ] Users can install specific packages without scary blanket permission
- [ ] Lockfile changes are visible in timeline with diffstat
- [ ] Package count warnings catch transitive explosions
- [ ] Default behavior unchanged (strict, no deps)

### Code Quality
- [ ] Stop reason diagnosis is lookup, not string matching
- [ ] All stop reasons have consistent families and exit codes
- [ ] RunState schema versioning enables future evolution
- [ ] No breaking changes to existing runs

---

## Future Sprints (Backlog)

Ideas for later (not committed):
- Optional SQLite index for cross-run analytics
- Audit/open modes for allow_deps (if allowlist proves insufficient)
- RunState field layering (if sprawl becomes painful)
- Timeline compaction (if logs get huge)
- Fixture governance (if gym tests become hard to maintain)

---

## How to Use This Directory

**For Planning:**
1. Read the sprint plan for overview
2. Read individual specs for details
3. Use specs as implementation guide

**For Development:**
1. Pick a spec to implement
2. Follow the implementation plan
3. Use testing strategy to verify
4. Check off success criteria
5. Update sprint plan status

**For Review:**
1. Specs are living documents
2. Update as you learn during implementation
3. Keep "Future Enhancements" section for scope control
