# Architecture

Status: Implemented
Source: `src/cli.ts`, `src/commands/*.ts`, `src/supervisor/*.ts`, `src/workers/*.ts`, `src/verification/*.ts`, `src/store/*.ts`, `src/repo/*.ts`, `src/config/*.ts`

## High-level Overview

The Dual-LLM Orchestrator is an AI-driven code generation framework that choreographs two LLM workers (Claude and Codex) to collaboratively implement software development tasks. The system executes a structured phase-based workflow with automated verification, scope enforcement, and risk-based testing.

### Core Thesis

By combining the complementary strengths of different LLM workers—Claude for high-level planning and code review, Codex for implementation—the system achieves more reliable and higher-quality code generation than a single model approach. The phase-based architecture with explicit state machine transitions provides observability, recoverability, and auditability throughout multi-hour autonomous coding sessions.

### System Purpose

The orchestrator takes high-level software tasks and produces production-ready code changes through a phase-based pipeline:

```
INIT → PLAN → MILESTONE_START → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
```

Key capabilities:
- **Autonomous execution**: Runs without human intervention until completion or explicit stop conditions
- **Scope enforcement**: Prevents accidental changes outside allowed file patterns
- **Risk-based verification**: Adapts testing intensity based on changed files and risk triggers
- **Worker fallback**: Automatically switches workers on infrastructure failures
- **Checkpoint recovery**: Commits progress after each milestone for rollback capability
- **Comprehensive auditability**: Records all events, artifacts, and worker outputs

---

## Component Map

The system consists of 7 major modules, each with distinct responsibilities:

### 1. Supervisor (`src/supervisor/`)

**Purpose**: Orchestrates the entire execution pipeline and manages state transitions.

**Key Files**:
- `runner.ts` - Main supervisor loop, phase handlers, worker orchestration
- `state-machine.ts` - Phase transitions, initial state creation, stop conditions
- `verification-policy.ts` - Risk tier selection based on file changes
- `scope-guard.ts` - Validates file scope and lockfile constraints

**Responsibilities**:
- Runs the main supervisor loop with configurable tick/time budgets
- Implements the 7-phase workflow with explicit state machine transitions
- Coordinates worker fallback when primary worker fails
- Retries failed verification (up to 3 times per milestone) with fix instructions
- Handles scope violations and guard breaches
- Implements watchdog timeout detection for stalled runs
- Tracks worker statistics and completion metrics

**Key Interfaces**:
```typescript
// State machine transitions
type Phase = 'INIT' | 'PLAN' | 'IMPLEMENT' | 'VERIFY' | 'REVIEW' | 'CHECKPOINT' | 'FINALIZE';

// Supervisor loop control
interface RunState {
  phase: Phase;
  milestones: Milestone[];
  currentMilestoneIndex: number;
  verifyAttempts: number;
  workerStats: WorkerStats;
}
```

---

### 2. Workers (`src/workers/`)

**Purpose**: Interfaces with external LLM CLI tools (Claude and Codex).

**Key Files**:
- `claude.ts` - Claude CLI wrapper, JSON output parsing, health checks
- `codex.ts` - Codex CLI wrapper, JSONL streaming output parsing
- `prompts.ts` - Builds prompts for planner, implementer, and reviewer phases
- `schemas.ts` - Zod validation schemas for worker outputs
- `json.ts` - JSON extraction between BEGIN_JSON/END_JSON markers

**Responsibilities**:
- Executes prompts against Claude or Codex CLIs via subprocess spawning
- Parses worker outputs in different formats (text, JSON, JSONL)
- Implements retry logic with jitter (250ms, 1s delays) for transient failures
- Provides health checks (ping) for worker availability
- Classifies errors (auth, network, rate limit, unknown)
- Extracts structured data from text responses

**Worker Configuration**:
```typescript
interface WorkerConfig {
  bin: string;      // CLI command (e.g., "claude", "codex")
  args: string[];   // Additional arguments
  output: 'json' | 'jsonl' | 'text';
}
```

**Default Phase Mapping**:
- **Plan phase**: Claude (high-level reasoning)
- **Implement phase**: Codex (code generation)
- **Review phase**: Claude (code review)

---

### 3. Verification (`src/verification/`)

**Purpose**: Executes verification/testing commands with configurable tiers.

**Key Files**:
- `engine.ts` - Command execution with timeout and output capture

**Responsibilities**:
- Runs shell commands (tests, lints, builds) with configurable timeouts
- Captures command output and exit codes for debugging
- Supports 3-tier verification strategy:
  - **Tier 0**: Always runs after implementation (fast checks)
  - **Tier 1**: Runs on risk triggers or high-risk milestones (moderate tests)
  - **Tier 2**: Runs at run end (comprehensive test suite)
- Returns pass/fail results with timing metrics

**Tier Selection Logic**:
- File pattern matching against `risk_triggers` in configuration
- Milestone risk level (low/medium/high)
- Milestone boundaries and run finalization
- Time budget constraints (default 600s per milestone)

---

### 4. Store (`src/store/`)

**Purpose**: Persists run state, timeline events, and artifacts to disk.

**Key Files**:
- `run-store.ts` - File I/O for state, artifacts, timeline, and memos

**Responsibilities**:
- Creates and manages run directories (`.runr/.runr/runs/{runId}/`)
- Writes/reads JSON state (`state.json`) after each phase
- Appends JSONL timeline events (`timeline.jsonl`) for observability
- Stores artifacts (test logs, diffs, raw worker outputs)
- Stores handoff memos between phases
- Manages environment fingerprints for resume validation

**Run Directory Structure**:
```
.runr/.runr/runs/{runId}/
├── state.json              # Current run state (phase, milestones, stats)
├── timeline.jsonl          # Event log (JSONL format)
├── plan.md                 # Generated milestones from plan phase
├── summary.md              # Final summary from finalize phase
├── env.fingerprint.json    # Environment snapshot for resume validation
├── artifacts/              # Test logs, diffs, raw worker outputs
└── handoffs/               # Memos passed between phases
```

---

### 5. Repo (`src/repo/`)

**Purpose**: Manages git operations and repository context.

**Key Files**:
- `git.ts` - Thin wrapper around git commands via subprocess
- `context.ts` - Git state introspection (branches, changed files)
- `worktree.ts` - Creates isolated git worktrees for safe experimentation

**Responsibilities**:
- Executes git commands (status, checkout, commit, diff, branch)
- Detects changed files via `git status --porcelain`
- Determines default branch from remote tracking
- Creates isolated git worktrees for sandboxed execution
- Builds run branches with timestamp/slug naming convention
- Extracts touched packages for monorepo support
- Captures repository context for phase decisions

**Git Integration**:
- Creates run branches: `agent/{timestamp}/{slug}`
- Commits checkpoints after successful review
- Detects scope violations via file change analysis
- Generates diffs for review phase context

---

### 6. Config (`src/config/`)

**Purpose**: Defines, validates, and loads agent configuration.

**Key Files**:
- `schema.ts` - Zod schemas for all configuration sections
- `load.ts` - File reading and schema validation

**Responsibilities**:
- Validates configuration schema with comprehensive Zod schemas
- Loads `runr.config.json` from repository root or custom path
- Provides sensible defaults for all configuration options
- Enforces required fields (scope allowlist, verification tiers)

**Configuration Structure**:
```json
{
  "agent": { "name": "string", "version": "string" },
  "repo": { "default_branch": "main" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**"],
    "lockfiles": ["package-lock.json"]
  },
  "verification": {
    "tier0": ["npm run lint"],
    "tier1": ["npm run test:unit"],
    "tier2": ["npm run test"],
    "risk_triggers": ["src/auth/**", "src/db/**"],
    "max_verify_time_per_milestone": 600
  },
  "workers": {
    "claude": { "bin": "claude", "args": [], "output": "json" },
    "codex": { "bin": "codex", "args": [], "output": "jsonl" }
  },
  "phases": {
    "plan": "claude",
    "implement": "codex",
    "review": "claude"
  }
}
```

---

### 7. Commands (`src/commands/`)

**Purpose**: CLI command handlers for user-facing operations.

**Key Files**:
- `run.ts` - Orchestrates full run workflow with preflight checks
- `resume.ts` - Handles resuming from checkpoints with env validation
- `preflight.ts` - Pre-execution validation (repo, scope, workers)
- `report.ts` - Timeline visualization and KPI extraction
- `follow.ts` - Real-time event tailing
- `doctor.ts` - Worker health diagnostics

**Available Commands**:
| Command | Purpose |
|---------|---------|
| `run` | Start a new task execution with preflight checks |
| `resume` | Resume interrupted runs with environment fingerprint validation |
| `status` | Display current run status and phase |
| `report` | Show run timeline with KPI summary |
| `compare` | Compare metrics between two runs |
| `follow` | Tail run timeline in real-time |
| `doctor` | Check worker CLI availability and health |
| `tools guard` | Validate task scope without executing agent |
| `preflight` | Validate repo state, config, scope, and workers |

**Preflight Checks**:
- Git repository cleanliness (no uncommitted changes)
- Scope allowlist/denylist pattern validation
- Lockfile constraint verification
- Worker binary availability in PATH
- Worker connectivity via ping

---

## Module Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Entry Point                          │
│                          (src/cli.ts)                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Commands Module                             │
│              (run, resume, report, follow, doctor)               │
└────────┬───────────────┬────────────────┬───────────────────────┘
         │               │                │
         ▼               ▼                ▼
┌────────────────┐ ┌───────────┐ ┌─────────────────┐
│ Config Module  │ │   Repo    │ │  Store Module   │
│ (load config)  │ │  Module   │ │ (persist state) │
└────────┬───────┘ └─────┬─────┘ └────────┬────────┘
         │               │                │
         └───────────────┼────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supervisor Module                            │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│    │ State Machine│  │  Scope Guard │  │ Verify Policy    │     │
│    └──────────────┘  └──────────────┘  └──────────────────┘     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌─────────────────┐ ┌────────────────────────┐
│  Workers Module  │ │ Verification    │ │    Store Module        │
│  (Claude/Codex)  │ │    Module       │ │ (events & artifacts)   │
└──────────────────┘ └─────────────────┘ └────────────────────────┘
```

---

## Data Flow

This section explains the complete journey of a run from CLI invocation to completion.

### Run Progression Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLI Invocation                                  │
│            runr run --task .runr/tasks/task.md                         │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Preflight Checks                                  │
│  • Git repo cleanliness    • Config validation    • Worker availability  │
│  • Scope pattern validation    • Lockfile constraints                    │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        RunStore Initialization                           │
│  • Create run directory (.runr/.runr/runs/{runId}/)                           │
│  • Initialize state.json with INIT phase                                 │
│  • Create timeline.jsonl for event logging                               │
│  • Capture environment fingerprint                                       │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Supervisor Loop                                   │
│                    (src/supervisor/runner.ts:111)                        │
│                                                                           │
│  for each tick (up to maxTicks):                                         │
│    1. Check stop conditions (STOPPED phase, time budget, stall timeout)  │
│    2. Record progress timestamp                                          │
│    3. Dispatch to phase handler based on current state.phase             │
│    4. Persist updated state to state.json                                │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Phase Execution                                    │
│                                                                           │
│  INIT ──► PLAN ──► IMPLEMENT ──► VERIFY ──► REVIEW ──► CHECKPOINT        │
│                        │            │          │            │             │
│                        │            │          │            │             │
│                        ▼            ▼          ▼            ▼             │
│                   (loops back on retry)  (more milestones? → IMPLEMENT)  │
│                                                                           │
│                                          (no more milestones? → FINALIZE)│
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           Finalization                                    │
│  • Write summary.md with worker stats                                    │
│  • Emit final worker_stats event                                         │
│  • Write stop.md memo                                                    │
│  • Transition to STOPPED phase                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Artifacts Produced

| Artifact | Location | Description |
|----------|----------|-------------|
| Run state | `.runr/.runr/runs/{runId}/state.json` | Current phase, milestones, worker stats |
| Timeline | `.runr/.runr/runs/{runId}/timeline.jsonl` | Event log for observability |
| Plan | `.runr/.runr/runs/{runId}/plan.md` | Generated milestones from PLAN phase |
| Summary | `.runr/.runr/runs/{runId}/summary.md` | Final summary from FINALIZE |
| Handoffs | `.runr/.runr/runs/{runId}/handoffs/*.md` | Memos passed between phases |
| Test logs | `.runr/.runr/runs/{runId}/artifacts/tests_*.log` | Verification command outputs |
| Stop memo | `.runr/.runr/runs/{runId}/handoffs/stop.md` | Context for resumption or debugging |

---

## Phase Lifecycle

Each phase in the 7-phase pipeline has specific responsibilities, entry conditions, and exit conditions. The state machine is implemented in `src/supervisor/state-machine.ts` and phase handlers are in `src/supervisor/runner.ts`.

### Phase State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                INIT                      │
                    │   (src/supervisor/state-machine.ts:12)   │
                    │   Creates initial state with milestones  │
                    └────────────────────┬────────────────────┘
                                         │ automatic
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │                PLAN                      │
                    │    (src/supervisor/runner.ts:241)        │
                    │  • Invoke planner worker (Claude)        │
                    │  • Generate milestones from task         │
                    │  • Validate files_expected vs allowlist  │
                    └────────────────────┬────────────────────┘
                                         │ on success
                                         ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │                           IMPLEMENT                                │
    │                  (src/supervisor/runner.ts:336)                    │
    │  • Invoke implementer worker (Codex)                               │
    │  • Include fix instructions if retrying                            │
    │  • Validate scope and lockfile guards post-implementation          │
    │  • Write handoff memo                                              │
    └───────────────────────────────┬───────────────────────────────────┘
                                    │ on success
                                    ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │                           VERIFY                                   │
    │                  (src/supervisor/runner.ts:492)                    │
    │  • Select verification tiers based on risk policy                  │
    │  • Run tier0/tier1/tier2 commands with time budget                 │
    │  • Capture test logs as artifacts                                  │
    └───────────────────────────────┬───────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼ on success                    ▼ on failure
    ┌───────────────────────────┐   ┌───────────────────────────────────┐
    │         REVIEW            │   │        RETRY LOGIC                 │
    │ (src/supervisor/runner.ts │   │  • milestone_retries < 3?          │
    │         :618)             │   │    → Back to IMPLEMENT with        │
    │ • Invoke reviewer (Claude)│   │      fix instructions              │
    │ • Evaluate diff + tests   │   │  • milestone_retries >= 3?         │
    │ • Approve or request      │   │    → STOP (max retries exceeded)   │
    │   changes                 │   └───────────────────────────────────┘
    └───────────────┬───────────┘                   │
                    │                               │
        ┌───────────┴───────────┐                   │
        │                       │                   │
        ▼ approve               ▼ request_changes   │
    ┌───────────────┐   ┌───────────────────────────┤
    │  CHECKPOINT   │   │  Back to IMPLEMENT        │
    │ (runner.ts    │   │  with review comments     │
    │     :718)     │   └───────────────────────────┘
    │ • git add -A  │
    │ • git commit  │
    │ • Advance     │
    │   milestone   │
    └───────┬───────┘
            │
    ┌───────┴───────────────────┐
    │                           │
    ▼ more milestones           ▼ no more milestones
┌───────────────┐       ┌───────────────────────────┐
│ Back to       │       │        FINALIZE           │
│ IMPLEMENT     │       │   (src/supervisor/runner  │
│ (next         │       │          .ts:762)         │
│ milestone)    │       │ • Write summary.md        │
└───────────────┘       │ • Emit worker_stats       │
                        │ • Transition to STOPPED   │
                        └───────────────────────────┘
```

### Phase Details

#### INIT

**Entry**: Run created via CLI or resume
**Exit**: Automatic transition to PLAN
**Handler**: `src/supervisor/runner.ts:229-231`

Creates the initial `RunState` with:
- Empty milestones array (populated by PLAN)
- Scope lock from config (allowlist, denylist)
- Initial worker stats (all zeros)
- Timestamps for tracking

```typescript
// src/supervisor/state-machine.ts:12-43
export function createInitialState(input: InitStateInput): RunState {
  return {
    run_id: input.run_id,
    phase: 'INIT',
    milestone_index: 0,
    milestones: [],
    scope_lock: { allowlist, denylist },
    worker_stats: { claude: 0, codex: 0, by_phase: {...} }
  };
}
```

#### PLAN

**Entry**: From INIT
**Exit**: To IMPLEMENT (success) or STOPPED (parse failure, scope violation)
**Handler**: `src/supervisor/runner.ts:241-328`

1. Builds planner prompt with task text and scope constraints
2. Invokes configured planner worker (default: Claude)
3. Parses structured JSON output with milestones
4. Validates all `files_expected` are within scope allowlist
5. Writes `plan.md` artifact

**Stop Conditions**:
- `plan_parse_failed`: Worker output not parseable as JSON
- `plan_scope_violation`: Planned files outside allowlist

#### IMPLEMENT

**Entry**: From PLAN, VERIFY (retry), REVIEW (changes requested), CHECKPOINT (next milestone)
**Exit**: To VERIFY (success) or STOPPED (blocked, guard violation)
**Handler**: `src/supervisor/runner.ts:336-484`

1. Builds implementer prompt with current milestone
2. Includes `fixInstructions` if retrying after verification failure
3. Invokes configured implementer worker (default: Codex)
4. Validates changed files against scope guards
5. Validates lockfile constraints
6. Writes handoff memo

**Fix Instructions Context** (on retry):
```typescript
{
  failedCommand: string;    // The command that failed
  errorOutput: string;      // Captured error output
  changedFiles: string[];   // Files modified so far
  attemptNumber: number;    // Current retry (1-3)
}
```

#### VERIFY

**Entry**: From IMPLEMENT
**Exit**: To REVIEW (pass), IMPLEMENT (fail + retry), STOPPED (max retries)
**Handler**: `src/supervisor/runner.ts:492-611`

1. Selects verification tiers based on `verification-policy.ts`
2. Runs commands for each tier with time budget enforcement
3. Captures output to `tests_tier{N}.log` artifacts
4. On failure, checks retry count

**Retry Logic** (`MAX_MILESTONE_RETRIES = 3`):
```typescript
// src/supervisor/runner.ts:34
const MAX_MILESTONE_RETRIES = 3;

// On verification failure:
if (state.milestone_retries >= MAX_MILESTONE_RETRIES) {
  return stopWithError(state, 'verification_failed_max_retries');
}
// Otherwise: increment milestone_retries, store failure context, → IMPLEMENT
```

#### REVIEW

**Entry**: From VERIFY (all tiers passed)
**Exit**: To CHECKPOINT (approve), IMPLEMENT (request_changes/reject)
**Handler**: `src/supervisor/runner.ts:618-711`

1. Generates diff summary via `git diff --stat` and `git diff`
2. Reads verification output from artifacts
3. Invokes configured reviewer worker (default: Claude)
4. Parses review decision: `approve`, `request_changes`, or `reject`

**Review Outcomes**:
- `approve` → CHECKPOINT
- `request_changes` → IMPLEMENT (with review comments in memo)
- `reject` → IMPLEMENT (with rejection reason)

#### CHECKPOINT

**Entry**: From REVIEW (approved)
**Exit**: To IMPLEMENT (more milestones) or FINALIZE (last milestone)
**Handler**: `src/supervisor/runner.ts:718-756`

1. Stages all changes: `git add -A`
2. Creates commit: `chore(agent): checkpoint milestone {N}`
3. Records commit SHA in state
4. Advances `milestone_index`
5. Resets `milestone_retries` to 0

**Transition Decision**:
```typescript
if (nextIndex >= updated.milestones.length) {
  return updatePhase(updated, 'FINALIZE');
}
return updatePhase(updated, 'IMPLEMENT');
```

#### FINALIZE

**Entry**: From CHECKPOINT (all milestones complete)
**Exit**: To STOPPED
**Handler**: `src/supervisor/runner.ts:762-794`

1. Generates summary with worker statistics
2. Writes `summary.md` artifact
3. Emits `worker_stats` event
4. Writes `stop.md` memo
5. Transitions to STOPPED with reason `complete`

### Phase Transition Rules

| From | To | Trigger |
|------|----|---------|
| INIT | PLAN | Automatic |
| PLAN | IMPLEMENT | Milestones generated and validated |
| PLAN | STOPPED | Parse failure or scope violation |
| IMPLEMENT | VERIFY | Implementation complete, guards passed |
| IMPLEMENT | STOPPED | Worker blocked, guard violation |
| VERIFY | REVIEW | All verification tiers passed |
| VERIFY | IMPLEMENT | Verification failed, retries remaining |
| VERIFY | STOPPED | Max retries exceeded (3) |
| REVIEW | CHECKPOINT | Reviewer approved |
| REVIEW | IMPLEMENT | Reviewer requested changes |
| CHECKPOINT | IMPLEMENT | More milestones to process |
| CHECKPOINT | FINALIZE | All milestones complete |
| FINALIZE | STOPPED | Summary written |

### Stop Conditions

The supervisor loop can stop for various reasons, recorded in `stop_reason`:

| Reason | Trigger | Recovery |
|--------|---------|----------|
| `complete` | All milestones finished | None needed |
| `time_budget_exceeded` | Run exceeded `timeBudgetMinutes` | Resume with more time |
| `stalled_timeout` | No progress for 15+ minutes | Check worker health |
| `plan_parse_failed` | Planner output not parseable | Check worker config |
| `plan_scope_violation` | Planned files outside allowlist | Update scope config |
| `implement_parse_failed` | Implementer output not parseable | Check worker config |
| `implement_blocked` | Implementer returned blocked status | Check handoff memo |
| `guard_violation` | Changed files outside scope/lockfiles | Review scope config |
| `ownership_violation` | Task modified files outside declared `owns:` paths | Update task ownership or expand owns patterns |
| `verification_failed_max_retries` | 3 failed verify attempts | Manual fix needed |
| `review_parse_failed` | Reviewer output not parseable | Check worker config |
| `milestone_missing` | No milestone at current index | Check state consistency |

---

## Key Abstractions

This section documents the core data structures that drive the orchestrator. These types are the foundation for state management, worker coordination, and configuration.

### RunState

**Source**: `src/types/schemas.ts:42-70`

`RunState` is the central state object persisted to `state.json`. It captures the complete execution context of a run, enabling resumption and observability.

```typescript
interface RunState {
  // Identity
  run_id: string;               // Unique run identifier (timestamp-based)
  repo_path: string;            // Absolute path to the repository

  // Execution state
  phase: Phase;                 // Current phase in the pipeline
  milestone_index: number;      // Index of current milestone (0-based)
  milestones: Milestone[];      // Array of milestones from PLAN phase

  // Scope enforcement
  scope_lock: {
    allowlist: string[];        // Glob patterns for allowed file paths
    denylist: string[];         // Glob patterns for denied file paths
  };

  // Git context
  current_branch?: string;      // Active git branch
  planned_run_branch?: string;  // Branch created for this run
  checkpoint_commit_sha?: string; // SHA of last checkpoint commit

  // Retry and failure tracking
  risk_score: number;           // Cumulative risk score
  last_error?: string;          // Most recent error message
  retries: number;              // Total retry count across run
  milestone_retries: number;    // Retries for current milestone (0-3)
  last_verify_failure?: VerifyFailure; // Details of last verification failure
  tier_reasons?: string[];      // Reasons for tier selection

  // Recovery support
  last_successful_phase?: Phase; // Last phase that completed successfully
  resume_token?: string;        // Token for resumption validation

  // Timestamps
  phase_started_at: string;     // ISO timestamp when current phase began
  phase_attempt: number;        // Attempt number within current phase
  started_at: string;           // ISO timestamp when run started
  updated_at: string;           // ISO timestamp of last state update
  last_progress_at?: string;    // ISO timestamp of last forward progress

  // Termination
  stop_reason?: string;         // Why the run stopped (if stopped)
  worker_stats: WorkerStats;    // Invocation counts per worker/phase
}
```

**Key Relationships**:
- Written/read by `RunStore` to `.runr/runs/{runId}/state.json`
- Updated after every phase transition by the supervisor
- Contains embedded `Milestone[]` populated during PLAN phase
- `scope_lock` derived from `AgentConfig.scope` at run creation

---

### RunStore

**Source**: `src/store/run-store.ts:13-127`

`RunStore` is the persistence layer for all run artifacts. It manages the run directory structure and provides methods for reading/writing state, events, and artifacts.

```typescript
class RunStore {
  // Directory paths
  private runDir: string;       // Base directory: .runr/runs/{runId}/
  private timelinePath: string; // Path to timeline.jsonl
  private seqPath: string;      // Path to seq.txt (event sequence counter)

  // In-memory cache
  private lastEvent: Event | null;
  private lastWorkerCall: WorkerCallInfo | null;

  // Factory method
  static init(runId: string, rootDir?: string): RunStore;

  // Core operations
  writeState(state: RunState): void;      // Persist state to state.json
  readState(): RunState;                  // Load state from state.json
  appendEvent(event: Omit<Event, 'seq' | 'timestamp'>): Event;  // Add timeline event

  // Artifact operations
  writeArtifact(name: string, content: string): void;  // Write to artifacts/
  writeMemo(name: string, content: string): void;      // Write to handoffs/
  writePlan(content: string): void;       // Write plan.md
  writeSummary(content: string): void;    // Write summary.md
  writeConfigSnapshot(config: unknown): void;  // Write config.snapshot.json

  // Environment tracking
  writeFingerprint(fingerprint: EnvFingerprint): void;
  readFingerprint(): EnvFingerprint | null;

  // Worker tracking
  recordWorkerCall(info: WorkerCallInfo): void;
  getLastWorkerCall(): WorkerCallInfo | null;
}
```

**Directory Structure Created**:
```
.runr/.runr/runs/{runId}/
├── state.json           # RunState persistence
├── timeline.jsonl       # Event log (JSONL)
├── seq.txt              # Event sequence counter
├── plan.md              # Generated milestones
├── summary.md           # Final run summary
├── config.snapshot.json # Config at run start
├── env.fingerprint.json # Environment state for resume
├── artifacts/           # Test logs, diffs, worker outputs
└── handoffs/            # Phase-to-phase memos
```

---

### WorkerConfig

**Source**: `src/config/schema.ts:35-39`

`WorkerConfig` defines how to invoke an external LLM CLI tool. Each worker (Claude, Codex) has its own configuration.

```typescript
interface WorkerConfig {
  bin: string;                        // CLI binary name (e.g., "claude", "codex")
  args: string[];                     // Command-line arguments to pass
  output: 'text' | 'json' | 'jsonl';  // Expected output format
}
```

**Default Configurations**:

| Worker | bin | args | output |
|--------|-----|------|--------|
| Claude | `claude` | `["-p", "--output-format", "json", "--dangerously-skip-permissions"]` | `json` |
| Codex | `codex` | `["exec", "--full-auto", "--json"]` | `jsonl` |

**Usage Context**:
- Referenced by `src/workers/claude.ts` and `src/workers/codex.ts`
- The `bin` value must be available in PATH
- The `args` array is spread when spawning the subprocess
- The `output` format determines how responses are parsed

---

### AgentConfig

**Source**: `src/config/schema.ts:61-68`

`AgentConfig` is the top-level configuration schema loaded from `runr.config.json`. It defines all operational parameters for a run.

```typescript
interface AgentConfig {
  // Metadata
  agent: {
    name: string;     // Agent name (default: "dual-llm-orchestrator")
    version: string;  // Config version (default: "1")
  };

  // Repository settings
  repo: {
    default_branch?: string;  // Main branch name (auto-detected if omitted)
  };

  // Scope enforcement
  scope: {
    allowlist: string[];      // Glob patterns for allowed files
    denylist: string[];       // Glob patterns for denied files
    lockfiles: string[];      // Files that cannot be modified
                              // Default: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
  };

  // Verification configuration
  verification: {
    cwd?: string;                       // Working directory for commands
    tier0: string[];                    // Always-run commands
    tier1: string[];                    // Risk-triggered commands
    tier2: string[];                    // End-of-run commands
    risk_triggers: Array<{              // Patterns that trigger higher tiers
      name: string;
      patterns: string[];
      tier: 'tier0' | 'tier1' | 'tier2';
    }>;
    max_verify_time_per_milestone: number;  // Timeout in seconds (default: 600)
  };

  // Worker definitions
  workers: {
    claude: WorkerConfig;
    codex: WorkerConfig;
  };

  // Phase-to-worker mapping
  phases: {
    plan: 'claude' | 'codex';      // Default: 'claude'
    implement: 'claude' | 'codex'; // Default: 'codex'
    review: 'claude' | 'codex';    // Default: 'claude'
  };
}
```

**Loading Process**:
1. `src/config/load.ts` reads `runr.config.json` from repo root
2. Zod schema validates and applies defaults
3. Config snapshot written to run directory for auditability

**Configuration Example**:
```json
{
  "agent": { "name": "my-agent", "version": "1" },
  "repo": { "default_branch": "main" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**", "dist/**"],
    "lockfiles": ["package-lock.json"]
  },
  "verification": {
    "tier0": ["npm run lint"],
    "tier1": ["npm run test:unit"],
    "tier2": ["npm run test"],
    "risk_triggers": [
      { "name": "auth", "patterns": ["src/auth/**"], "tier": "tier1" }
    ],
    "max_verify_time_per_milestone": 300
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

### Supporting Types

These additional types are referenced by the key abstractions:

#### Milestone

**Source**: `src/types/schemas.ts:18-23`

```typescript
interface Milestone {
  goal: string;              // Description of what to accomplish
  files_expected?: string[]; // Files expected to be modified
  done_checks: string[];     // Criteria for completion
  risk_level: RiskLevel;     // 'low' | 'medium' | 'high'
}
```

#### WorkerStats

**Source**: `src/types/schemas.ts:32-40`

```typescript
interface WorkerStats {
  claude: number;            // Total Claude invocations
  codex: number;             // Total Codex invocations
  by_phase: {
    plan: { claude: number; codex: number };
    implement: { claude: number; codex: number };
    review: { claude: number; codex: number };
  };
}
```

#### VerifyFailure

**Source**: `src/types/schemas.ts:25-30`

```typescript
interface VerifyFailure {
  failedCommand: string;     // Command that failed
  errorOutput: string;       // Captured stderr/stdout
  changedFiles: string[];    // Files modified before failure
  tier: VerificationTier;    // Which tier failed
}
```

#### Phase

**Source**: `src/types/schemas.ts:1-12`

```typescript
type Phase =
  | 'INIT'
  | 'PLAN'
  | 'MILESTONE_START'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'CHECKPOINT'
  | 'FINALIZE'
  | 'STOPPED'
  | 'BLOCKED'
  | 'ESCALATED';
```

---

## See Also

- [Run Lifecycle](run-lifecycle.md) - Detailed phase flow and transitions
- [Workers](workers.md) - Worker adapter implementation details
- [Guards and Scope](guards-and-scope.md) - Scope enforcement mechanisms
- [Verification](verification.md) - Tier selection and execution logic
- [Configuration](configuration.md) - Full configuration reference
- [Glossary](glossary.md) - Term definitions
