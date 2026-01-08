# Reliability-First Agents: Why We Built a Governance Layer Under "Agentic AI"

*How this system differs from agent literature—and what we still learn from it.*

---

## Executive Summary

Most agent frameworks optimize for **capability**: more tools, more autonomy, more clever reasoning loops.

We optimize for **reliability**: verifiable execution, bounded failure, and unattended operation you can trust.

This isn't branding. It forces different architecture, different stop conditions, and a different definition of "done."

---

## 1. What the Mainstream Means by "Agent"

Across popular frameworks, an agent is typically defined as:

> Goal → Plan → Tool use → Adapt → Repeat

With optional memory, reflection, and multi-agent collaboration.

**CrewAI** explicitly defines agents as: role + goal, tool use, collaboration, memory, delegation.

**Google's ADK** frames agents as "self-contained execution units" that can use tools and coordinate.

**LangGraph** emphasizes stateful, graph-based orchestration with human-in-the-loop hooks.

Pattern catalogs like *Agentic Design Patterns* try to standardize this into reusable building blocks—prompt chaining, tool use, self-correction, multi-agent orchestration.

All fair. All useful abstractions.

But most of that literature implicitly assumes a human is around to notice when things go weird.

---

## 2. The Dividing Line: Capability vs Governance

The question most systems implicitly answer:

> "Can it figure it out?"

The question we answer:

> "Can it **prove** what happened, and make failure **recoverable**?"

That difference cascades into everything:

| Dimension | Typical Agent Loop | Reliability-First Agent |
|-----------|-------------------|------------------------|
| **Success criteria** | Plausible completion | Evidence-gated completion |
| **Verification** | Optional / best effort | Mandatory, tier-based |
| **Review** | LLM judgment | Artifacts + exit codes + checks |
| **Failure handling** | Retry / reflect | Diagnose → stop → resume |
| **Human role** | Supervisor | Cold-start debugger (only when needed) |
| **Autonomy** | Claimed | Enforced |

Some frameworks absolutely care about production. LangGraph emphasizes durable execution, HITL hooks, and visibility. ADK emphasizes a more "software-like" developer experience.

Our claim isn't "they don't care."

It's: **they don't force governance as the default definition of done.**

---

## 3. Our Architectural Primitives

These aren't prompt tweaks. They're structural guarantees.

### 3.1 Phase Gates

Every milestone passes through a deterministic pipeline:

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
```

You can't skip steps. Each gate has explicit entry/exit conditions.

This is how operating systems work, not chatbots.

### 3.2 Evidence Gates

The system cannot claim "no changes needed" without proof.

Acceptable evidence (at least one required):
- **files_checked**: Array of inspected files within scope
- **grep_output**: Non-empty search output showing feature exists
- **commands_run**: Commands with `exit_code === 0`

This prevents the anti-pattern where an LLM claims "already implemented" without verification.

### 3.3 Stop Taxonomy

When the system stops, it produces a classified failure:

| Stop Reason | Category | Recovery |
|-------------|----------|----------|
| `complete` | Success | None needed |
| `plan_scope_violation` | Policy | Update allowlist |
| `guard_violation` | Policy | Review scope config |
| `verification_failed_max_retries` | Logic | Manual fix needed |
| `review_loop_detected` | Loop | Has fingerprint for debugging |
| `stalled_timeout` | Infrastructure | Auto-resumable |
| `time_budget_exceeded` | Budget | Resume manually |

Every stop is named, categorized, and produces artifacts for resumption.

### 3.4 Scope Guards

The system enforces file boundaries at two levels:

1. **Allowlist matching** - Changed files must match allowed patterns
2. **Denylist matching** - Changed files must NOT match denied patterns
3. **Lockfile protection** - Package locks are immutable by default

Violations don't just warn—they stop the run.

### 3.5 Retry Limits with Context

When verification fails:
- Attempt 1: Implementer gets `fixInstructions` with error output
- Attempt 2: Same, with more context
- Attempt 3: Same
- **After 3 failures: Stop with `verification_failed_max_retries`**

No infinite loops. No silent degradation.

### 3.6 Complete Forensics

Every run produces:

```
.runr/runs/{runId}/
├── state.json              # Current phase, milestones, stats
├── timeline.jsonl          # Every event with timestamps
├── plan.md                 # The milestone plan
├── handoffs/*.md           # Worker memos between phases
├── artifacts/*.log         # Verification output
└── env.fingerprint.json    # Environment snapshot
```

You can review a 2-hour run in 2 minutes.

---

## 4. Why Agent Demos Fail in Unattended Reality

This is the uncomfortable truth the literature mostly avoids.

### 4.1 "Approval" Without Evidence

A classic failure: the agent says it ran tests, or "verified," but it didn't—or ran the wrong thing—or tests were skipped.

Without hard evidence, review becomes vibes.

**Our fix**: The REVIEW phase cannot approve unless:
- Required verification commands ran
- Exit codes are recorded
- Expected artifacts exist

### 4.2 Soft Failure Semantics

Many agent loops blur "partial progress" with "completion," especially after retries. You end up with a repo that *looks* updated but is subtly broken.

**Our fix**: Treat failure like an operating system:
- Name it
- Classify it
- Stop cleanly
- Emit resume artifacts

### 4.3 Self-Modification Without Rollback

"Self-improvement" sounds good until it silently regresses reliability.

**Our fix**:
- Freeze the boot chain (critical files in DENYLIST)
- Limited self-modification
- Environment fingerprinting detects drift on resume

### 4.4 Scope Creep

Agent asked to "fix a button" ends up refactoring the authentication system.

**Our fix**: Scope guards enforce boundaries at PLAN (predicted files) and IMPLEMENT (actual changes). Violations stop the run, not just warn.

---

## 5. A Concrete Example

**Scenario**: "Add feature X, update tests, verify."

### Capability-first agent:

1. Makes code changes
2. Runs *some* tests (or claims to)
3. Sees failures
4. Retries with edits
5. Eventually declares success

But if:
- The test command never actually ran
- The repo state is dirty
- The test suite is incomplete
- The agent "fixed" by deleting coverage

You get a green-sounding narrative and a broken reality.

### Reliability-first agent:

1. PLAN: Break into milestones, validate scope
2. IMPLEMENT: Make changes, scope guard validates
3. VERIFY: Run tier0 (lint/typecheck), tier1 if risk triggered
4. REVIEW: Approve only if verification passed with evidence
5. CHECKPOINT: Git commit with SHA recorded
6. If stuck: Stop with classified reason and resume point

Won't claim success without recorded verification. Won't paper over failure with narration.

---

## 6. Where We Are Intentionally Narrower

Honesty matters.

We are **not** trying to be:

- A general assistant
- A cross-domain autonomous organism
- A constantly learning system
- A self-rearchitecting meta-agent

Pattern catalogs can list 21 patterns and beyond. ADK and LangGraph can orchestrate sophisticated graphs and multi-agent flows.

But the moment you want **unattended** work, the foundational requirement is not cleverness—it's governance.

So we chose restraint:

> **One domain. One responsibility. Done right.**

---

## 7. What We Can Learn From Other Approaches

We're ahead on governance. We're not done learning.

### 7.1 Pattern Vocabulary (Communication)

We already implement many patterns implicitly:
- Prompt chaining (phase handoffs)
- Tool use (verification commands)
- Reflection (review phase)
- Planning (milestone generation)

Adopting standard pattern names helps onboarding and positioning. This is a messaging upgrade, not a rewrite.

### 7.2 Context Engineering as a Measurable Surface

The literature's framing is useful: context as a constructed environment, not just prompt text.

Future directions (not now):
- Measuring context size vs success rate
- Detecting context overload
- Safe shrinking over long runs

### 7.3 Resource-Aware Reasoning

We already track call counts, wall time, run duration.

The missing piece (later): making cost a **first-class planning constraint**, not just a metric.

### 7.4 Multi-Agent Coordination (Eventually)

Our current model is supervisor + workers. True multi-agent coordination (parallel implementers, specialist reviewers) is a valid future direction.

But only after single-agent reliability is rock solid.

---

## 8. Framework Comparison: Governance Primitives

| Primitive | LangGraph | ADK | CrewAI | This System |
|-----------|-----------|-----|--------|-------------|
| **Phase gates** | Optional checkpoints | Custom flows | Implicit | Mandatory, enforced |
| **Evidence gates** | Not built-in | Not built-in | Not built-in | Required for claims |
| **Stop taxonomy** | Generic errors | Exceptions | Task failure | 11 classified reasons |
| **Scope enforcement** | Not built-in | Not built-in | Not built-in | Allowlist/denylist guards |
| **Retry limits** | Configurable | Configurable | Configurable | 3 max, with context |
| **Resume from checkpoint** | State persistence | Custom | Not built-in | Automatic, with env fingerprint |
| **Verification tiers** | Custom | Custom | Custom | Built-in (tier0/1/2) |
| **Complete forensics** | Tracing | Logging | Basic | Full run directory |

The others aren't wrong. They optimize for flexibility.

We optimize for unattended execution where **failure must be recoverable by someone who wasn't watching**.

---

## 9. Our Definition of a Production Agent

> A production agent is a system that can execute multi-step tasks **without human supervision** and produce sufficient **evidence** for a human to verify or resume the task **without prior context**.

Most agents fail the second half.

We built the second half.

---

## 10. Positioning Lines

Use these:

- Most agent frameworks focus on making agents smarter. **We focus on making them trustworthy.**

- Most systems optimize for autonomy. **We optimize for accountability.**

- An agent that can't explain why it stopped isn't autonomous—it's irresponsible.

- The goal isn't "did it figure it out?" The goal is "can you prove what happened?"

---

## 11. Strategic Implication

We are not building "another agent framework."

We are building:

- An **autonomy substrate**
- For **high-stakes, unattended execution**
- Where failure is expected, classified, and recoverable

That is rarer—and more valuable—than general agent demos.

---

## Closing

The agent literature isn't wrong.

It's just incomplete.

We didn't ignore it.

We built the missing layer underneath it.

---

## See Also

- [Vision](vision.md) - Core philosophy and design principles
- [Architecture](architecture.md) - System components and data flow
- [Run Lifecycle](run-lifecycle.md) - Phase details and transitions
- [Guards and Scope](guards-and-scope.md) - Scope enforcement mechanisms
- [Verification](verification.md) - Tier selection and execution
