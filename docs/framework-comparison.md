# Framework Comparison: Governance Primitives in Agent Systems

*A technical comparison of how different frameworks handle reliability, failure, and unattended execution.*

---

## Overview

This document compares four agent systems across governance primitives:

| Framework | Primary Optimization | Typical Use Case |
|-----------|---------------------|------------------|
| **LangGraph** | Stateful graph orchestration | Complex, multi-step workflows |
| **Google ADK** | Software-like agent development | Enterprise agent applications |
| **CrewAI** | Role-based multi-agent teams | Collaborative AI workflows |
| **This System** | Unattended reliability | Overnight code execution |

---

## 1. Phase Gates

**The question**: Can execution steps be skipped? Are transitions explicit?

### LangGraph

Phases are nodes in a graph. Transitions are edges. The developer defines the structure.

```python
from langgraph.graph import StateGraph

workflow = StateGraph(AgentState)

# Add nodes (phases)
workflow.add_node("plan", plan_step)
workflow.add_node("implement", implement_step)
workflow.add_node("review", review_step)

# Add edges (transitions) - can be conditional
workflow.add_edge("plan", "implement")
workflow.add_conditional_edges(
    "implement",
    should_continue,  # Developer-defined function
    {"continue": "review", "retry": "implement"}
)
```

**Assessment**: Flexible but optional. Developer must explicitly enforce gates.

### Google ADK

Agents are defined with tools. Flow is typically implicit within the agent's reasoning.

```python
from google.adk import Agent

agent = Agent(
    name="code_agent",
    model="gemini-2.0-flash",
    tools=[plan_tool, implement_tool, verify_tool],
    instruction="Execute coding tasks step by step"
)

# The agent decides the order
response = agent.run("Add a login feature")
```

**Assessment**: Agent-directed flow. No explicit phase gates by default.

### CrewAI

Tasks are assigned to agents. Order is specified in the crew definition.

```python
from crewai import Agent, Task, Crew

planner = Agent(role="Planner", goal="Break down tasks")
developer = Agent(role="Developer", goal="Write code")
reviewer = Agent(role="Reviewer", goal="Review changes")

crew = Crew(
    agents=[planner, developer, reviewer],
    tasks=[plan_task, implement_task, review_task],
    process=Process.sequential  # or Process.hierarchical
)
```

**Assessment**: Sequential or hierarchical process. Gates are implicit in task ordering.

### This System

Phases are enforced by the state machine. Cannot be skipped.

```typescript
// src/supervisor/state-machine.ts
const PHASE_ORDER: Phase[] = [
  'INIT', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'CHECKPOINT', 'FINALIZE'
];

function getNextPhase(current: Phase): Phase | 'STOPPED' {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return 'STOPPED';
  return PHASE_ORDER[idx + 1];
}

// Transitions are explicit and recorded
function updatePhase(state: RunState, newPhase: Phase): RunState {
  store.appendEvent({
    type: 'phase_transition',
    payload: { from: state.phase, to: newPhase }
  });
  return { ...state, phase: newPhase, phase_started_at: new Date().toISOString() };
}
```

**Assessment**: Mandatory gates. Every transition recorded. Cannot skip phases.

---

## 2. Evidence Gates

**The question**: Can the agent claim something without proving it?

### LangGraph

No built-in evidence gates. Developer can add custom validation.

```python
def review_step(state):
    # Agent claims verification passed
    if state["verification_status"] == "passed":
        return {"approved": True}

    # No requirement that verification_status is backed by evidence
    # The agent could hallucinate this value
```

**Assessment**: Not built-in. Developer must implement.

### Google ADK

Tool results provide some evidence, but claims in reasoning are not validated.

```python
@tool
def run_tests():
    """Run the test suite."""
    result = subprocess.run(["npm", "test"], capture_output=True)
    return {"exit_code": result.returncode, "output": result.stdout}

# The tool provides evidence, but nothing prevents the agent from
# ignoring it and claiming tests passed anyway
```

**Assessment**: Tools can provide evidence. No enforcement of evidence-based claims.

### CrewAI

Task outputs flow between agents. No built-in evidence validation.

```python
review_task = Task(
    description="Review the implementation",
    expected_output="Approval or rejection with reasons",
    agent=reviewer
)

# The reviewer can claim anything in expected_output
# No requirement to cite evidence from previous tasks
```

**Assessment**: Not built-in. Trust-based between agents.

### This System

Evidence gates are enforced at specific decision points.

```typescript
// src/supervisor/evidence-gate.ts
interface NoChangesEvidence {
  files_checked?: string[];      // Must be within scope allowlist
  grep_output?: string;          // Max 8KB, must be non-empty
  commands_run?: Array<{
    command: string;
    exit_code: number;           // Must be 0
  }>;
}

function validateNoChangesNeeded(evidence: NoChangesEvidence): boolean {
  // At least one form of evidence required
  const hasFilesChecked = evidence.files_checked?.length > 0 &&
    evidence.files_checked.every(f => matchesAllowlist(f));

  const hasGrepOutput = evidence.grep_output?.length > 0 &&
    evidence.grep_output.length <= 8192;

  const hasCommands = evidence.commands_run?.some(c => c.exit_code === 0);

  if (!hasFilesChecked && !hasGrepOutput && !hasCommands) {
    throw new Error('No changes claim requires evidence');
  }

  return true;
}
```

```typescript
// src/supervisor/runner.ts - REVIEW phase
function handleReview(state: RunState): RunState {
  // Reviewer cannot approve without verification evidence
  const verificationArtifact = store.readArtifact('tests_tier0.log');
  if (!verificationArtifact) {
    return stopWithReason(state, 'review_without_verification');
  }

  // Evidence is passed to reviewer, and recorded
  const reviewInput = {
    diff: getDiff(),
    verification_output: verificationArtifact,
    verification_exit_codes: state.last_verify_result.exit_codes
  };

  // Approval requires this evidence to exist
  const decision = invokeReviewer(reviewInput);
  // ...
}
```

**Assessment**: Built-in. Claims rejected without evidence.

---

## 3. Stop Taxonomy

**The question**: When execution stops, how is the reason classified?

### LangGraph

Uses Python exceptions. Can add custom error types.

```python
from langgraph.errors import GraphRecursionError

try:
    result = app.invoke(input)
except GraphRecursionError:
    # Too many iterations
    pass
except Exception as e:
    # Generic catch-all
    print(f"Failed: {e}")
```

**Assessment**: Standard exceptions. Not classified by recovery path.

### Google ADK

Returns status in response. Generic success/failure.

```python
response = agent.run("task")

if response.status == "completed":
    # Success
elif response.status == "failed":
    # Generic failure - no classification
    print(response.error_message)
```

**Assessment**: Binary success/failure. No taxonomy.

### CrewAI

Task results indicate success/failure. Crew can handle failures.

```python
result = crew.kickoff()

if result.success:
    print(result.output)
else:
    # Failed - reason is in result.error but not classified
    print(f"Crew failed: {result.error}")
```

**Assessment**: Success/failure. Error message but no classification.

### This System

11 classified stop reasons with semantic meaning.

```typescript
// src/types/schemas.ts
type StopReason =
  // Success
  | 'complete'

  // Parse errors - check worker config
  | 'plan_parse_failed'
  | 'implement_parse_failed'

  // Policy violations - update scope
  | 'plan_scope_violation'
  | 'guard_violation'

  // Logic errors - manual fix needed
  | 'verification_failed_max_retries'
  | 'implement_blocked'

  // Loop detection - review fingerprint
  | 'review_loop_detected'

  // Infrastructure - auto-resumable
  | 'stalled_timeout'
  | 'worker_call_timeout'

  // Resource limits - resume with budget
  | 'time_budget_exceeded';

// Each reason has recovery metadata
const STOP_METADATA: Record<StopReason, StopMeta> = {
  'complete': {
    category: 'success',
    auto_resume: false,
    recovery: 'None needed'
  },
  'verification_failed_max_retries': {
    category: 'logic_error',
    auto_resume: false,
    recovery: 'Manual fix needed. See handoffs/stop.md for failure details.'
  },
  'stalled_timeout': {
    category: 'infrastructure',
    auto_resume: true,  // Can automatically retry
    recovery: 'Check worker health. Will auto-resume.'
  },
  // ...
};
```

**Assessment**: Classified taxonomy. Each reason maps to recovery path.

---

## 4. Scope Guards

**The question**: Can the agent modify files outside the intended scope?

### LangGraph

No built-in scope restriction. Developer must implement.

```python
def implement_step(state):
    # Agent can modify any file
    # No built-in restriction
    files_modified = agent.modify_files(state["plan"])
    return {"files": files_modified}

# To add scope guards, developer must wrap the tool:
def safe_write_file(path, content):
    if not is_in_scope(path):
        raise ValueError(f"Cannot modify {path}: outside scope")
    write_file(path, content)
```

**Assessment**: Not built-in. Must be implemented per-tool.

### Google ADK

Tools can be restricted, but no declarative scope system.

```python
@tool
def write_file(path: str, content: str):
    """Write content to a file."""
    # Developer must add validation
    if "../" in path:
        raise ValueError("Path traversal not allowed")
    # But no declarative allowlist/denylist
```

**Assessment**: Not built-in. Per-tool validation only.

### CrewAI

Agents have goals but no file-level scope restriction.

```python
developer = Agent(
    role="Developer",
    goal="Implement features in the src/ directory",
    # This is a prompt instruction, not an enforcement
)
```

**Assessment**: Not built-in. Goal is advisory only.

### This System

Declarative scope with two enforcement points.

```typescript
// runr.config.json
{
  "scope": {
    "allowlist": ["src/**", "tests/**", "*.config.js"],
    "denylist": ["node_modules/**", "dist/**", ".env*"],
    "lockfiles": ["package-lock.json", "pnpm-lock.yaml"]
  }
}
```

```typescript
// src/supervisor/scope-guard.ts
import { picomatch } from 'picomatch';

export function validateScope(
  files: string[],
  scope: ScopeConfig
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const file of files) {
    // Must match at least one allowlist pattern
    const matchesAllowlist = scope.allowlist.some(pattern =>
      picomatch(pattern)(file)
    );

    // Must NOT match any denylist pattern
    const matchesDenylist = scope.denylist.some(pattern =>
      picomatch(pattern)(file)
    );

    // Lockfiles are unconditionally protected
    const isLockfile = scope.lockfiles.includes(file);

    if (!matchesAllowlist || matchesDenylist || isLockfile) {
      violations.push(file);
    }
  }

  return { valid: violations.length === 0, violations };
}
```

```typescript
// Enforcement point 1: After PLAN phase
function handlePlan(state: RunState): RunState {
  const plan = invokePlanner(state);

  // Validate all files_expected are within scope
  for (const milestone of plan.milestones) {
    const { valid, violations } = validateScope(
      milestone.files_expected || [],
      state.scope_lock
    );

    if (!valid) {
      return stopWithReason(state, 'plan_scope_violation', {
        violations,
        milestone: milestone.goal
      });
    }
  }
  // ...
}

// Enforcement point 2: After IMPLEMENT phase
function handleImplement(state: RunState): RunState {
  invokeImplementer(state);

  // Detect actual changed files via git
  const changedFiles = getChangedFiles();
  const { valid, violations } = validateScope(changedFiles, state.scope_lock);

  if (!valid) {
    return stopWithReason(state, 'guard_violation', { violations });
  }
  // ...
}
```

**Assessment**: Built-in. Declarative config. Two enforcement points. Violations stop the run.

---

## 5. Retry Limits

**The question**: How many times will the system retry before giving up?

### LangGraph

Configurable recursion limit. No context passing on retry.

```python
app = workflow.compile()

# Set recursion limit
result = app.invoke(
    input,
    config={"recursion_limit": 10}  # Max 10 iterations
)

# But on retry, no structured context about what failed
```

**Assessment**: Configurable limit. No structured retry context.

### Google ADK

Configurable retries at tool level. No cross-retry context.

```python
@tool(retries=3)
def run_tests():
    """Run tests with retries."""
    # Will retry up to 3 times on failure
    # But each retry starts fresh - no context
```

**Assessment**: Configurable. Retries are independent.

### CrewAI

Max iterations per task. Retry logic is implicit.

```python
task = Task(
    description="Implement feature",
    max_iterations=5  # Try up to 5 times
)
```

**Assessment**: Configurable. Implicit retry without structured context.

### This System

3 retries with cumulative context.

```typescript
// src/supervisor/runner.ts
const MAX_MILESTONE_RETRIES = 3;

function handleVerify(state: RunState): RunState {
  const result = runVerification(state);

  if (!result.passed) {
    if (state.milestone_retries >= MAX_MILESTONE_RETRIES) {
      // No more retries - stop with classified reason
      return stopWithReason(state, 'verification_failed_max_retries', {
        attempts: state.milestone_retries,
        last_failure: result.failure
      });
    }

    // Build cumulative fix instructions
    const fixInstructions: FixInstructions = {
      failedCommand: result.failure.command,
      errorOutput: result.failure.output,
      changedFiles: getChangedFiles(),
      attemptNumber: state.milestone_retries + 1,

      // Include history from previous attempts
      previousAttempts: state.retry_history || []
    };

    // Store this attempt for next retry
    const updatedHistory = [
      ...(state.retry_history || []),
      { attempt: state.milestone_retries + 1, failure: result.failure }
    ];

    return {
      ...state,
      phase: 'IMPLEMENT',
      milestone_retries: state.milestone_retries + 1,
      last_verify_failure: result.failure,
      fix_instructions: fixInstructions,
      retry_history: updatedHistory
    };
  }

  // Passed - move to review
  return updatePhase(state, 'REVIEW');
}
```

**Assessment**: Hard limit (3). Cumulative context. Classified stop after exhaustion.

---

## 6. Resume from Checkpoint

**The question**: Can execution resume after failure without starting over?

### LangGraph

State persistence enables resume from checkpoints.

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
app = workflow.compile(checkpointer=checkpointer)

# Resume from specific thread
result = app.invoke(
    None,
    config={"configurable": {"thread_id": "run-123"}}
)
```

**Assessment**: Built-in with checkpointer. Developer must configure.

### Google ADK

Session state can be persisted. Custom resume logic.

```python
from google.adk import Session

session = Session.load("session-123")  # If persisted
response = agent.run("continue", session=session)
```

**Assessment**: Session-based. Resume is possible but not structured.

### CrewAI

No built-in resume. Tasks run to completion or failure.

```python
# No native resume capability
# Must restart the crew
result = crew.kickoff()
```

**Assessment**: Not built-in. Must restart.

### This System

Automatic resume with environment fingerprint validation.

```typescript
// src/commands/resume.ts
async function resumeRun(runId: string): Promise<void> {
  const store = RunStore.init(runId);
  const state = store.readState();

  // Validate environment hasn't changed
  const savedFingerprint = store.readFingerprint();
  const currentFingerprint = captureFingerprint();

  const diffs = compareFingerprints(savedFingerprint, currentFingerprint);
  if (diffs.length > 0) {
    console.warn('Environment changed since last run:');
    diffs.forEach(d => console.warn(`  ${d.field}: ${d.old} → ${d.new}`));
    // Warn but allow resume
  }

  // Compute resume point based on last successful phase
  const resumePhase = computeResumePhase(state);

  console.log(`Resuming from ${resumePhase}`);

  // Continue supervisor loop
  await runSupervisorLoop({
    ...state,
    phase: resumePhase
  }, store);
}
```

```typescript
// src/env/fingerprint.ts
interface EnvFingerprint {
  node_version: string;
  package_manager: string | null;
  lockfile_hash: string | null;  // SHA256 prefix
  worker_versions: Record<string, string | null>;
  created_at: string;
}

function captureFingerprint(): EnvFingerprint {
  return {
    node_version: process.version,
    package_manager: detectPackageManager(),
    lockfile_hash: hashLockfile(),
    worker_versions: {
      claude: getWorkerVersion('claude'),
      codex: getWorkerVersion('codex')
    },
    created_at: new Date().toISOString()
  };
}
```

**Assessment**: Built-in. Automatic resume point. Environment validation.

---

## 7. Summary Table

| Primitive | LangGraph | ADK | CrewAI | This System |
|-----------|-----------|-----|--------|-------------|
| **Phase gates** | Optional graph nodes | Implicit | Task ordering | Mandatory state machine |
| **Evidence gates** | Not built-in | Not built-in | Not built-in | Built-in, required |
| **Stop taxonomy** | Python exceptions | Binary status | Success/failure | 11 classified reasons |
| **Scope guards** | Not built-in | Not built-in | Not built-in | Allowlist/denylist |
| **Retry limits** | Configurable, no context | Configurable, no context | Configurable, implicit | 3 max, cumulative context |
| **Resume checkpoint** | With checkpointer | Session-based | Not built-in | Automatic + fingerprint |

---

## 8. When to Use Each

### LangGraph
- Building complex multi-step workflows with custom branching
- Need fine-grained control over state and transitions
- Human-in-the-loop at arbitrary points
- Integration with LangChain ecosystem

### Google ADK
- Enterprise agent applications
- Tight integration with Google Cloud
- Multi-agent systems with tool sharing
- Software engineering-style agent development

### CrewAI
- Role-based collaborative workflows
- Multiple specialized agents working together
- Creative or research tasks
- Simulation of team dynamics

### This System
- Unattended execution (overnight, CI/CD)
- High-stakes code modifications
- Compliance or audit requirements
- When failure must be recoverable by someone who wasn't watching

---

## 9. The Core Difference

The other frameworks optimize for **flexibility**: build any agent architecture you can imagine.

This system optimizes for **unattended reliability**: prove what happened, recover from failure, let humans sleep.

Both are valid. They solve different problems.

If you need a human nearby, use the flexible frameworks.

If you need to walk away, use governance primitives.
