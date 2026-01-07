# Why Runr?

## The Problem

AI coding agents are powerful but chaotic:
- They crash, stall, hit edge cases
- "Just resume" loses context
- Manual fixes become audit black holes
- No proof of what actually happened

## The Solution

Runr is a workflow layer for agent coding.

**Checkpoints**: Every milestone is a resumable state with verification evidence.

**Receipts**: Machine-readable records of what happened and why.

**Hybrid provenance**: Track both agent work AND manual interventions.

## The Trade-off

Runr adds ~5% overhead for:
- 100% resumability
- Complete audit trail
- Proof your code was reviewed

## Who It's For

- Solo devs using Claude Code or Codex
- Teams needing audit trails
- Anyone tired of lost agent context

## Evidence-Driven Development

Traditional: write code -> hope it works -> push

With Runr: plan -> implement -> verify -> checkpoint -> prove it

Every change has evidence. Every manual fix is recorded.
Your git history becomes a provenance chain, not just a commit log.

## Two Modes

**Flow Mode** - Ship fast, record what you can:
- Git hooks warn on provenance gaps (don't block)
- Good for solo dev, prototyping
- Priority: momentum

**Ledger Mode** - Audit-first, everything on record:
- Git hooks block commits without attribution
- Good for production, compliance
- Priority: traceability

Switch modes: `runr mode flow` or `runr mode ledger`

## Next Steps

- [Hybrid Workflow Guide](./hybrid-workflow-guide.md) - How to use Flow and Ledger modes
- [Quick Start](./quickstart.md) - Get running in 60 seconds
- [CLI Reference](./cli.md) - All commands
