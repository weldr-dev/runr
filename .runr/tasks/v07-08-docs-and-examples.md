# 08: Docs and Examples

## Goal
Update documentation to reflect the v0.7 hybrid workflow features.

## Requirements

### 1. Update Main README
Add sections for:
- Hybrid workflow overview (Flow vs Ledger)
- `runr intervene` usage and examples
- `runr audit` usage and examples
- Mode configuration

### 2. Update CLAUDE.md Template
In `packs/*/templates/CLAUDE.md.tmpl`:
- Add intervention workflow guidance
- Update meta-agent rules for mode awareness
- Add audit coverage expectations

### 3. Create Hybrid Workflow Guide
New file: `docs/hybrid-workflow-guide.md`

Contents:
- Why hybrid workflow?
- Flow mode: when and how
- Ledger mode: when and how
- Intervention best practices
- Audit coverage targets
- CI integration examples

### 4. Create Intervention Examples
New file: `docs/examples/intervention-patterns.md`

Contents:
- Basic intervention recording
- Intervention with command capture
- Retroactive attribution (--since)
- Commit linking (--commit)
- Amending commits (--amend-last, Flow only)

### 5. Update Existing Guides
- `docs/workflow-guide.md` - Add intervention section
- `docs/safety-guide.md` - Add redaction info
- `docs/packs-user-guide.md` - Add mode configuration

### 6. Add CHANGELOG Entry
Add v0.7.0 entry to CHANGELOG.md:
```markdown
## [0.7.0] - 2026-01-XX

**Hybrid Workflow Foundation** - Productivity + Auditability together.

### Added
- `runr intervene` - Record manual work with provenance
- `runr audit` - View project history by classification
- `runr mode` - Switch between Flow and Ledger modes
- Redaction for sensitive data in receipts
- Review loop diagnostics with actionable suggestions
- Audit coverage thresholds for CI

### Changed
- Intervention receipts now include SHA anchors (base/head)
- Audit now supports inferred attribution
- Config schema extended for receipts and workflow mode
```

## Scope
allowlist_add:
  - docs/**
  - README.md
  - CHANGELOG.md
  - packs/*/templates/CLAUDE.md.tmpl

## Verification
tier: tier0

## Acceptance Checks
```bash
# Build succeeds (no TypeScript in docs, but validate links)
npm run build

# Docs files exist
ls docs/hybrid-workflow-guide.md
ls docs/examples/intervention-patterns.md

# CHANGELOG has v0.7.0 entry
grep "0.7.0" CHANGELOG.md
```
