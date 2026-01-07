# 06: Documentation Spine - 3-Page Core

## Goal
Rewrite docs into a tight 3-page spine that tells a coherent story. Ship documentation like a product.

## Problem
Current docs are scattered:
- README is dense and technical
- No clear "why" document
- Workflow guide exists but isn't prominent
- No above-the-fold pitch

## Requirements

### 1. README.md - Above the Fold

**Structure:**
```markdown
# Runr

> Turn agent coding into resumable, reviewable work—without killing momentum.

[One-liner + 30-second GIF]

## Quick Start (3 commands)
npm install -g @weldr/runr
runr init --pack solo
runr run --task .runr/tasks/your-task.md

## Two Modes
- **Flow**: Ship fast, record what you can
- **Ledger**: Audit-first, everything on the record

[Link to hybrid-workflow-guide.md]

## What You Get
- **Checkpoints**: Automatic safe resume
- **Receipts**: Diffs + verification logs
- **Hybrid provenance**: Manual fixes don't become black holes

## Quick Links
- [Hybrid Workflow Guide](docs/hybrid-workflow-guide.md)
- [Why Runr?](docs/why-runr.md)
- [CLI Reference](docs/cli.md)
```

**Key changes:**
- One-liner is the positioning statement
- Quick Start is copy-paste ready
- Two Modes shown as feature, not complexity
- Links to deeper docs

### 2. docs/hybrid-workflow-guide.md - How People Actually Use This

**Structure:**
```markdown
# Hybrid Workflow Guide

## The Reality
Agents are fast but messy. Not everything goes through Runr.
Manual fixes happen. Runr makes them visible, not invisible.

## The Pattern
1. Run task
2. If STOPPED → intervene or resume
3. Submit checkpoint
4. Check audit coverage

## Flow Mode (Productivity-First)
[When to use, how it works, examples]

## Ledger Mode (Audit-First)
[When to use, how it works, examples]

## The STOPPED → Intervene → Resume Pattern
[Step-by-step with copy-paste commands]

## Optional: Git Hooks
[How to enforce provenance at commit time]

## Audit Coverage
[How to check and improve coverage]
```

### 3. docs/why-runr.md - The Story Doc

**Structure:**
```markdown
# Why Runr?

## The Problem
AI coding agents are powerful but chaotic:
- They crash, stall, hit edge cases
- "Just resume" loses context
- Manual fixes become audit black holes
- No proof of what actually happened

## The Solution
Runr is a workflow layer for agent coding:
- **Checkpoints**: Every milestone is a resumable state
- **Receipts**: Evidence of what happened and why
- **Hybrid provenance**: Track manual work, not just agent work

## Who It's For
- Solo devs using Claude Code / Codex
- Teams needing audit trails
- Anyone tired of lost agent context

## The Trade-off
Runr adds ~5% overhead for:
- 100% resumability
- Complete audit trail
- Proof your code is reviewed

## Getting Started
[Link to Quick Start]
```

### 4. Update docs/cli.md
- Ensure all new commands are documented
- Group by workflow phase: init, run, resume, intervene, submit, audit
- Add examples for each command

### 5. Remove/Archive Outdated Docs
- Archive anything that contradicts the new story
- Remove duplicate content
- Consolidate overlapping guides

## Tests
- All links resolve (no 404s)
- Examples are copy-paste ready
- Quick Start actually works
- No legacy `.agent/` references

## Scope
allowlist_add:
  - README.md
  - docs/hybrid-workflow-guide.md
  - docs/why-runr.md
  - docs/cli.md

## Verification
tier: tier0

## Acceptance Checks
```bash
# Verify Quick Start commands work
npm install -g @weldr/runr  # or local install
runr init --pack solo --repo /tmp/test-docs
runr run --task .runr/tasks/example-task.md --repo /tmp/test-docs

# Check for broken links
grep -r "\.agent/" docs/ README.md  # should find nothing
```
