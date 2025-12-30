# Reliability-First Agents: A Governance Layer for Autonomous Code Execution

*Technical Whitepaper v1.0*

---

## Abstract

Current agent frameworks optimize for capability—more tools, more autonomy, more sophisticated reasoning chains. This paper presents an alternative approach optimized for reliability: verifiable execution, bounded failure, and unattended operation. We describe the architectural primitives that enable this—phase gates, evidence gates, stop taxonomy, scope guards, and complete forensics—and demonstrate how they compose into a system where failure is expected, classified, and recoverable. The result is an autonomy substrate for high-stakes, unattended execution.

---

## 1. Introduction

### 1.1 The Problem

AI systems can generate code. They make mistakes. Current approaches handle this in two ways:

1. **Interactive supervision**: A human watches and corrects. Works for pair programming; fails for overnight runs.

2. **Hope-based autonomy**: The agent retries, reflects, and eventually claims success. Works for demos; fails in production.

Neither approach produces what practitioners actually need: a system that can run for hours without supervision and produce either verified progress or actionable failure diagnostics.

### 1.2 The Contribution

We present an architecture that treats reliability as a first-class design constraint, not an afterthought. The key insight: **governance structures, not model intelligence, determine whether autonomous execution is trustworthy**.

---

## 2. Principles

These principles guided every architectural decision.

### Principle 1: Governance Over Intelligence

We don't try to make the AI smarter. We constrain it with:

- Scope boundaries that cannot be exceeded
- Verification gates that cannot be skipped
- Retry limits that cannot be ignored
- Time budgets that trigger graceful degradation

Smart AI + good governance = reliable results.
Smart AI alone = unpredictable behavior.

### Principle 2: Failure Is Expected

Every production system fails. The question is how.

Good failure means:
- Named and classified
- Bounded in impact
- Recoverable without prior context
- Instrumented for debugging

Bad failure means:
- Silent corruption
- Infinite loops
- Partial state that can't be resumed
- "Something went wrong"

We design for good failure.

### Principle 3: Evidence Over Assertion

An agent can assert anything. "Tests passed." "Already implemented." "Verified."

These assertions are worthless without evidence:
- Which commands ran?
- What were the exit codes?
- What files were inspected?
- What output was produced?

Claims without evidence are rejected by default.

### Principle 4: Checkpoints Over Transactions

Long-running operations should produce incremental, committed progress—not all-or-nothing transactions.

After each milestone:
- Changes are committed to version control
- State is persisted to disk
- Resumption is possible from this exact point

A 3-hour run that fails at hour 2.5 should preserve 2 hours of work, not zero.

### Principle 5: Forensics Over Logs

Traditional logging answers "what happened while I was watching."

Forensics answers "what happened while I was asleep."

Every run produces:
- Complete event timeline with sequence numbers
- State snapshots after each phase transition
- Artifacts from every verification command
- Handoff memos between phases
- Environment fingerprints for detecting drift

A 2-hour run should be reviewable in 2 minutes.

### Principle 6: Narrowness Over Generality

General-purpose agents can do anything poorly.
Narrow agents can do one thing well.

We chose narrowness:
- One domain (code modification)
- One responsibility (milestone completion)
- One definition of success (verified, committed changes)

This restraint enables the reliability guarantees that matter.

---

## 3. Architecture

### 3.1 Phase-Gated Execution

Execution proceeds through a deterministic phase pipeline:

```
INIT → PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
```

Each phase has:
- **Entry conditions**: What must be true to enter
- **Exit conditions**: What must be true to leave
- **Stop conditions**: What triggers graceful termination

Phases cannot be skipped. Each transition is recorded in the event timeline.

### 3.2 Evidence Gates

Certain claims require proof before acceptance.

**"No changes needed" claim**:

Must provide at least one of:
- `files_checked`: Array of files inspected (within scope)
- `grep_output`: Search output showing feature exists (max 8KB)
- `commands_run`: Commands with `exit_code === 0`

**"Verification passed" claim**:

Must provide:
- `commands_run`: Array of `{command, exit_code}` pairs
- `tiers_run`: Which verification tiers executed
- Artifact files with command output

### 3.3 Stop Taxonomy

Termination is classified into 11 distinct reasons:

| Category | Stop Reasons | Recovery Path |
|----------|--------------|---------------|
| **Success** | `complete` | None needed |
| **Parse Errors** | `plan_parse_failed`, `implement_parse_failed` | Check worker config |
| **Policy Violations** | `plan_scope_violation`, `guard_violation` | Update scope config |
| **Logic Errors** | `verification_failed_max_retries`, `implement_blocked` | Manual fix needed |
| **Loop Detection** | `review_loop_detected` | Review fingerprint memo |
| **Infrastructure** | `stalled_timeout`, `worker_call_timeout` | Auto-resumable |
| **Resource Limits** | `time_budget_exceeded` | Resume with more budget |

Each reason has:
- Semantic meaning for programmatic handling
- Recovery guidance for operators
- Artifacts for debugging

### 3.4 Scope Guards

File modifications are constrained at two enforcement points:

**Plan-time validation**:
- Planner outputs `files_expected` for each milestone
- All expected files must match allowlist patterns
- Violation triggers `plan_scope_violation` stop

**Implementation-time validation**:
- After implementation, actual changed files are detected via `git status`
- All changed files must match allowlist, not match denylist
- Lockfiles are unconditionally protected
- Violation triggers `guard_violation` stop

### 3.5 Retry Protocol

Verification failures trigger structured retry:

**Attempt 1**: Implementer receives `fixInstructions`:
```typescript
{
  failedCommand: "npm test",
  errorOutput: "Expected 3 but got 2...",
  changedFiles: ["src/calc.ts"],
  attemptNumber: 1
}
```

**Attempt 2-3**: Same structure, cumulative context.

**After attempt 3**: Stop with `verification_failed_max_retries`. No infinite loops.

### 3.6 Verification Tiers

Not every change needs the full test suite:

| Tier | When Selected | Typical Commands |
|------|---------------|------------------|
| **tier0** | Every milestone | Lint, typecheck |
| **tier1** | Risk triggers matched | Unit tests, build |
| **tier2** | Run finalization | Full test suite |

Risk triggers are glob patterns:
```json
{
  "risk_triggers": [
    { "name": "auth", "patterns": ["**/auth/**"], "tier": "tier1" },
    { "name": "deps", "patterns": ["package.json"], "tier": "tier1" }
  ]
}
```

### 3.7 Forensic Record

Every run produces:

```
.agent/runs/{runId}/
├── state.json              # Phase, milestones, stats
├── timeline.jsonl          # Sequenced event log
├── config.snapshot.json    # Config at run start
├── env.fingerprint.json    # Environment for resume validation
├── plan.md                 # Generated milestones
├── summary.md              # Final summary
├── artifacts/
│   ├── tests_tier0.log     # Verification output
│   ├── tests_tier1.log
│   └── context-pack.md     # Context sent to implementer
└── handoffs/
    ├── plan.md             # Planner output
    ├── implement.md        # Implementer memo
    ├── review.md           # Reviewer feedback
    └── stop.md             # Stop diagnostics
```

---

## 4. Comparison with Existing Approaches

### 4.1 Capability-First Frameworks

**LangGraph**, **CrewAI**, **Google ADK** provide:
- Flexible graph-based or role-based orchestration
- Tool use abstraction
- Memory and state management
- Human-in-the-loop hooks

They optimize for **expressiveness**: build any agent workflow.

We optimize for **auditability**: prove any agent did the right thing.

### 4.2 Primitive Comparison

| Primitive | LangGraph | ADK | CrewAI | This System |
|-----------|-----------|-----|--------|-------------|
| Phase gates | Optional | Custom | Implicit | Mandatory |
| Evidence gates | No | No | No | Yes |
| Stop taxonomy | Generic | Generic | Generic | 11 classified |
| Scope guards | No | No | No | Allowlist/denylist |
| Retry limits | Configurable | Configurable | Configurable | 3 max + context |
| Resume checkpoint | State persistence | Custom | No | Automatic + fingerprint |
| Verification tiers | Custom | Custom | Custom | Built-in (0/1/2) |
| Full forensics | Tracing | Logging | Basic | Complete directory |

### 4.3 When to Use What

**Use capability-first frameworks when**:
- Building interactive assistants
- Exploring novel agent architectures
- Human supervision is available

**Use reliability-first architecture when**:
- Running unattended for hours
- Failure must be recoverable by someone else
- Compliance or audit requirements exist
- CI/CD integration is the goal

---

## 5. Formal Definition

> **A production agent is a system that can execute multi-step tasks without human supervision and produce sufficient evidence for a human to verify or resume the task without prior context.**

Most agents satisfy the first clause (execute without supervision).

Few satisfy the second (evidence + resume without context).

The second clause requires the primitives described in this paper.

---

## 6. Limitations and Future Work

### 6.1 Current Limitations

- **Single-domain focus**: Optimized for code modification, not general tasks
- **Single-agent model**: Supervisor + workers, not true multi-agent coordination
- **No runtime learning**: Reproducibility prioritized over adaptation
- **External LLM dependency**: Relies on CLI-based worker invocation

### 6.2 Future Directions

- **Cost-aware planning**: Budget as a first-class constraint, not just a metric
- **Context optimization**: Measuring and minimizing context for long runs
- **Multi-agent coordination**: Parallel implementers, specialist reviewers
- **Adaptive verification**: Learning which tests matter for which changes

---

## 7. Conclusion

The agent literature asks: "Can the agent figure it out?"

We ask: "Can the agent prove it did the right thing?"

This reframing leads to a different architecture—one built on governance primitives rather than reasoning sophistication. Phase gates, evidence gates, stop taxonomy, scope guards, and complete forensics compose into a system where failure is expected, classified, and recoverable.

The result is not "another agent framework."

It's an autonomy substrate for high-stakes, unattended execution.

---

## References

1. LangGraph Documentation. LangChain, 2024.
2. Agent Development Kit. Google, 2024.
3. CrewAI Documentation. CrewAI, 2024.
4. Agentic Design Patterns. Springer, 2024.

---

## Appendix A: Configuration Schema

```json
{
  "agent": { "name": "string", "version": "string" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**"],
    "lockfiles": ["package-lock.json"]
  },
  "verification": {
    "tier0": ["npm run lint", "npm run typecheck"],
    "tier1": ["npm run test:unit"],
    "tier2": ["npm run test"],
    "risk_triggers": [
      { "name": "auth", "patterns": ["**/auth/**"], "tier": "tier1" }
    ],
    "max_verify_time_per_milestone": 600
  },
  "workers": {
    "claude": { "bin": "claude", "args": ["-p"], "output": "json" },
    "codex": { "bin": "codex", "args": ["exec"], "output": "jsonl" }
  },
  "phases": {
    "plan": "claude",
    "implement": "codex",
    "review": "claude"
  }
}
```

---

## Appendix B: Stop Reason Reference

| Reason | Phase | Cause | Automatic Resume |
|--------|-------|-------|------------------|
| `complete` | FINALIZE | All milestones done | N/A |
| `plan_parse_failed` | PLAN | Worker output unparseable | No |
| `plan_scope_violation` | PLAN | Files outside allowlist | No |
| `implement_parse_failed` | IMPLEMENT | Worker output unparseable | No |
| `implement_blocked` | IMPLEMENT | Worker returned blocked | No |
| `guard_violation` | IMPLEMENT | Changed files outside scope | No |
| `verification_failed_max_retries` | VERIFY | 3 failed attempts | No |
| `review_loop_detected` | REVIEW | Same feedback twice | No |
| `stalled_timeout` | Any | No progress 15+ min | Yes |
| `worker_call_timeout` | Any | Worker unresponsive | Yes |
| `time_budget_exceeded` | Any | Time limit reached | No |
