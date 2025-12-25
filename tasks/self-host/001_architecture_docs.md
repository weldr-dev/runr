# Task: Generate Framework Architecture Documentation

Analyze the agent-framework codebase and generate comprehensive architecture documentation.

## Deliverables

Create or update the following files:

### 1. `docs/ARCHITECTURE.md`

Document the system architecture including:

- **High-level overview**: What this system does, its core thesis
- **Component map**: Major modules and their responsibilities
  - `src/supervisor/` - orchestration loop
  - `src/workers/` - LLM worker abstraction
  - `src/verification/` - test/lint execution
  - `src/store/` - run persistence
  - `src/repo/` - git operations, worktrees
  - `src/config/` - configuration loading
  - `src/commands/` - CLI commands
- **Data flow**: How a run progresses from CLI invocation to completion
- **Phase lifecycle**: INIT → PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → FINALIZE
- **Key abstractions**: RunState, RunStore, WorkerConfig, AgentConfig

### 2. `docs/RUNBOOK.md`

Operational guide including:

- **Starting a run**: Common CLI invocations with examples
- **Monitoring a run**: Using `follow`, `report`, `status` commands
- **Resuming a failed run**: When and how to use `resume`
- **Troubleshooting guide**:
  - Guard violations
  - Verification failures
  - Worker timeouts/stalls
  - Worktree issues
- **Configuration reference**: Key fields in `agent.config.json`

## Constraints

- Read the source files to understand the system; do not guess
- Use clear, concise technical writing
- Include code references where helpful (e.g., "see `src/supervisor/runner.ts:111`")
- Do not modify any source code files
- Only create/update files in `docs/`

## Verification

- Files must be valid Markdown
- No broken internal links
- Documentation accurately reflects current implementation

## Non-requirements

- No diagrams (text-only for now)
- No API reference (focus on concepts)
- No changelog or history
