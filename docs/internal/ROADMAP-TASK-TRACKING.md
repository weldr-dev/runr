# Roadmap: Task Status Tracking

**Status:** Proposed
**Date:** 2026-01-08
**Source:** Agent feedback from microcourses integration

---

## Problem Statement

Runr currently has no way to know which tasks are completed. When an agent or user looks at a task directory, there's no indication of:
- Which tasks have been run
- Which succeeded vs failed
- When they were completed
- What commit/run completed them

This makes it hard to:
- Track progress across a project
- Know what's left to do
- Understand task history

---

## Proposed Solutions

### 1. `runr status` Command Enhancement

Add task-centric view to status command:

```bash
runr status --tasks

Tasks in .runr/tasks/:
  ✓ 00-setup.md         completed  2025-01-08  run:20250108-143022
  ✓ 01-basic-engine.md  completed  2025-01-08  run:20250108-144530
  ○ 02-advanced-ai.md   pending
  ✗ 03-networking.md    failed     2025-01-08  run:20250108-150122
```

**Implementation:**
- Scan `.runr/runs/*/state.json` for task paths
- Match against `.runr/tasks/*.md`
- Show most recent run status per task

### 2. Status Frontmatter in Task Files

Allow tasks to declare/track status:

```markdown
---
status: completed
completed_at: 2025-01-08
completed_by: run:20250108-143022
completed_commit: 1388d65
---

# Task Title

Task content...
```

**Pros:**
- Self-documenting
- Version controlled
- Human readable

**Cons:**
- Modifies task files (may not want this)
- Needs update mechanism

### 3. Central Status File

Create `.runr/task-status.json`:

```json
{
  "schema_version": 1,
  "tasks": {
    ".runr/tasks/00-setup.md": {
      "status": "completed",
      "last_run_id": "20250108-143022",
      "completed_at": "2025-01-08T14:35:22Z",
      "checkpoint_sha": "abc1234"
    },
    ".runr/tasks/01-basic-engine.md": {
      "status": "completed",
      "last_run_id": "20250108-144530",
      "completed_at": "2025-01-08T14:52:15Z",
      "checkpoint_sha": "def5678"
    }
  }
}
```

**Pros:**
- Doesn't modify task files
- Easy to query programmatically
- Single source of truth

**Cons:**
- Another file to track
- Could get out of sync

### 4. Auto-Detect from Git

Infer completion from git history:

```bash
runr status --infer-from-git

# Checks if files in task's scope have commits
# with Runr-Run-Id trailers matching the task
```

**Pros:**
- No extra files needed
- Git is source of truth

**Cons:**
- Slower (git log queries)
- May miss manual completions

---

## Related Feature Requests

### Task Dependencies

Express sequencing requirements:

```markdown
---
depends_on:
  - 00-setup.md
  - 01-basic-engine.md
---

# Task that requires previous tasks
```

Or in orchestration config:

```yaml
tracks:
  - name: sequential
    steps:
      - task: 00-setup.md
      - task: 01-basic.md      # Implicit: after 00
      - task: 02-advanced.md   # Implicit: after 01
```

**Use cases:**
- Ensure foundation tasks complete first
- Block tasks until dependencies ready
- Visualize task graph

### Task Types

Distinguish manual vs automatable:

```markdown
---
type: automated      # runr can run this
# or
type: manual         # requires human action
# or
type: hybrid         # agent + human collaboration
---
```

**Use cases:**
- `runr run --auto-only` - Only run automated tasks
- Status shows what needs human attention
- Orchestrator skips manual tasks

### Claude Code Integration

Tighter integration with Claude Code:

```bash
# Option A: Runr dispatches to Claude Code
runr run --task foo.md --worker claude-code

# Option B: Claude Code invokes Runr
# In Claude Code session:
/runr run --task foo.md
```

**Current state:**
- Runr can use `claude` CLI as a worker
- But no deep integration with Claude Code sessions
- Users run Claude Code directly, bypassing Runr tracking

**Desired state:**
- Runr as "skill" in Claude Code
- Or Claude Code as first-class Runr worker
- Provenance tracking either way

---

## Recommended Implementation Order

1. **Central status file** (`.runr/task-status.json`)
   - Low risk, high value
   - Update on run completion
   - Query with `runr status --tasks`

2. **Task dependencies** (in orchestration config)
   - Already partially supported via steps
   - Add explicit `depends_on` for cross-track deps

3. **Task types**
   - Simple frontmatter addition
   - Filter in `runr run` and orchestrator

4. **Claude Code integration**
   - Requires coordination with Claude Code team
   - Skill-based approach most promising

---

## Open Questions

1. Should task status be in git or gitignored?
   - In git: Shared across team, but noisy commits
   - Gitignored: Local only, but no history

2. How to handle task modifications after completion?
   - Re-run required?
   - Mark as "stale"?

3. Cross-repo task tracking?
   - Orchestration across multiple repos
   - Shared status dashboard

---

## References

- Original feedback from microcourses agent (2026-01-08)
- [Orchestration docs](../orchestration.md)
- [Run Store](../run-store.md)
