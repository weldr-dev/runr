Status: Implemented
Source: product-vision.txt, context.txt

# Vision

## The Problem

You have a coding task that would take an AI agent 1-3 hours to complete. You want to walk away and come back to either:

1. **A checkpointed set of commits** with verification evidence, or
2. **A clean stop** with a forensic trail explaining exactly what went wrong

But current AI coding tools either require constant babysitting or spin endlessly when stuck.

## The Solution

**A deterministic, governed runtime for unattended coding runs.**

You hand it a task + policy, walk away, and the system:

- **Plans** the work into verifiable milestones
- **Implements** each milestone with scope enforcement
- **Verifies** changes with risk-based test selection
- **Reviews** for correctness before committing
- **Checkpoints** progress with git commits
- **Stops cleanly** when blocked, with actionable next steps

## Core Philosophy

### Reliable Autonomy

This isn't about making AI "smarter." It's about making AI **reliable enough to run unattended**.

The system achieves this through:

- **Phase gates** - Each milestone goes through PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
- **Scope locks** - Changes are constrained to allowed files/directories
- **Verification tiers** - Fast checks always, deeper tests when risk is high
- **Retry limits** - Failures trigger fixes, but not infinite loops
- **Clean stops** - When truly stuck, stop with a useful handoff memo

### Observable and Auditable

Every run produces a complete forensic record:

- What was planned
- What commands ran
- What files changed
- What tests passed/failed
- Why it stopped (or completed)

You can review a 2-hour run in 2 minutes and understand exactly what happened.

### Walk-Away Safety

The system is designed for the "walk away" use case:

- **Won't spin** - Retry limits prevent endless loops
- **Won't drift** - Scope locks prevent expanding the task
- **Won't break things** - Verification catches mistakes before commit
- **Won't leave a mess** - Clean stops include actionable next steps

## What This Is NOT

### Not a Spec Framework

Tools like [Spec Kit](https://github.com/github/spec-kit) help you write better instructions for AI. We assume you already have a task—we make it **execute reliably**.

### Not a Process Framework

Tools like [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) structure AI work into team-like workflows. We're not about process—we're about **runtime execution**.

### Not an Ownership System

This isn't about who owns code or how upgrades flow through a system. Our boundaries are **operational safety rails**, not ownership semantics.

## The One-Liner

> **"Spec Kit and BMAD help you decide what to do; this runtime makes it happen autonomously, safely, and reproducibly."**

Or even shorter:

> **"Reliable autonomy for unattended coding runs."**

## Design Principles

### 1. Governance Over Intelligence

We don't try to make the AI "smarter." We constrain it with:
- Scope boundaries
- Verification gates
- Retry limits
- Time budgets

Smart AI + good governance = reliable results.

### 2. Adaptive Verification

Not every change needs the full test suite:

| Tier | When | Speed |
|------|------|-------|
| tier0 | Always | Seconds (lint, typecheck) |
| tier1 | Risk triggered | Minutes (targeted tests) |
| tier2 | Run end | Full suite |

This gives you speed *and* safety.

### 3. Structured Self-Healing

When blocked, the system doesn't just retry blindly. It follows a protocol:
- What broke
- Hypotheses
- Experiments tried
- Decision made
- Next action

After 3 failures on the same issue, it stops with a clear handoff instead of spiraling.

### 4. Complete Observability

Every run produces:
- `state.json` - Current phase and progress
- `timeline.jsonl` - Every event with timestamps
- `plan.md` - The milestone plan
- `handoffs/*.md` - Worker memos
- `artifacts/*.log` - Verification output

You can replay, resume, or audit any run.

## Target Use Cases

### Primary: Unattended Development Tasks

- Feature implementation spanning multiple files
- Refactoring with verification
- Bug fixes with test validation
- Code migrations with safety checks

### Secondary: Supervised Automation

- Semi-automated PR generation
- Batch code modifications
- Exploratory prototyping with guardrails

## Success Criteria

A successful run means:

1. **Progress** - Milestones completed with commits
2. **Verification** - All configured checks passed
3. **Auditability** - Complete record of what happened
4. **Clean state** - No uncommitted changes or broken builds

A successful stop means:

1. **No spinning** - Stopped within retry limits
2. **Clear reason** - Stop memo explains what went wrong
3. **Actionable** - Next steps are documented
4. **Recoverable** - Can resume from checkpoint

## See Also

- [Mental Model](mental-model.md) - Core concepts
- [Architecture](architecture.md) - System components
- [Run Lifecycle](run-lifecycle.md) - Phase details
- [Self-Hosting Safety](self-hosting-safety.md) - Using the agent on itself
