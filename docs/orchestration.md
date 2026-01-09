Status: Implemented
Source: src/commands/orchestrate.ts, src/orchestrator/state-machine.ts

# Orchestration (Parallel Tasks)

Runr supports parallel task execution through orchestration. Multiple independent task "tracks" run simultaneously with automatic collision detection.

## Quick Start

```bash
# Create orchestration config
cat > tracks.yaml << 'EOF'
tracks:
  - name: "API Track"
    steps:
      - task: .runr/tasks/api-auth.md
        allowlist: [src/api/**]

  - name: "UI Track"
    steps:
      - task: .runr/tasks/ui-components.md
        allowlist: [src/ui/**]
EOF

# Run with worktree isolation (recommended)
runr orchestrate run --config tracks.yaml --worktree
```

## Concepts

### Tracks and Steps

- **Tracks** = Parallel pipelines (run concurrently)
- **Steps** = Sequential tasks within a track (run one after another)

```yaml
tracks:
  - name: "Feature A"      # Track 1 ─┐
    steps:                             │ Run in
      - task: tasks/a1.md              │ parallel
      - task: tasks/a2.md  # After a1  │
                                       │
  - name: "Feature B"      # Track 2 ─┘
    steps:
      - task: tasks/b1.md
```

### Allowlist

Each step can declare which files it will modify:

```yaml
steps:
  - task: tasks/api.md
    allowlist:
      - src/api/**
      - src/shared/types.ts
```

Used for collision detection when tracks might overlap.

## Isolation Strategies

### Option 1: Worktree Isolation (Recommended)

```bash
runr orchestrate run --config tracks.yaml --worktree
```

Each track gets:
- Own working directory: `.runr-worktrees/<run_id>/`
- Own git branch: `runr/<run_id>/<task_name>`
- Symlinked `node_modules` (fast startup)

**Best for:** Most parallel workloads. Full isolation, no conflicts possible.

### Option 2: Ownership Declarations

Without worktrees, tasks must declare ownership in frontmatter:

```markdown
---
owns:
  - src/courses/git-basics/
  - docs/git-basics/
---

# Create Git Basics Course

Build a comprehensive course...
```

The orchestrator:
1. Reserves ownership before launch
2. Blocks conflicting tracks
3. Releases claims on completion

**Best for:** Cleanly separated directories (courses, modules, apps).

## Collision Policies

Control what happens when tracks might conflict:

```bash
# Wait for conflicting track to finish (default, safe)
runr orchestrate run --config tracks.yaml --collision-policy serialize

# Launch anyway, risk merge conflicts (fast)
runr orchestrate run --config tracks.yaml --collision-policy force

# Stop orchestration on conflict (strict)
runr orchestrate run --config tracks.yaml --collision-policy fail
```

## Commands

### Start Orchestration

```bash
runr orchestrate run --config tracks.yaml [options]

Options:
  --worktree              Create worktree per run (recommended)
  --collision-policy      serialize | force | fail
  --time <minutes>        Time budget per run
  --fast                  Skip PLAN/REVIEW phases
  --dry-run               Plan without executing
```

### Resume After Interruption

```bash
runr orchestrate resume latest
runr orchestrate resume <orchestrator_id>
```

### Wait for Completion

```bash
runr orchestrate wait latest --for complete
runr orchestrate wait latest --for terminal  # complete or stopped
```

### View Results

```bash
runr orchestrate receipt latest --json
```

## Scheduling Algorithm

```
┌─────────────────────────────────────────┐
│            MAIN LOOP                     │
├─────────────────────────────────────────┤
│ 1. Find next launchable track           │
│    - Not already running/complete       │
│    - No ownership conflicts             │
│    - No allowlist collisions            │
│                                          │
│ 2. Take action:                          │
│    launch  → Start track run             │
│    wait    → Promise.race active runs    │
│    done    → All tracks complete         │
│    blocked → Unrecoverable conflict      │
│                                          │
│ 3. Persist state, loop                   │
└─────────────────────────────────────────┘
```

## Example: 10 Parallel Courses

From our microcourses stress test:

```yaml
tracks:
  - name: git-basics
    steps:
      - task: tasks/git-basics.md
        allowlist: [courses/git-basics/**]

  - name: typescript-generics
    steps:
      - task: tasks/typescript-generics.md
        allowlist: [courses/typescript-generics/**]

  - name: react-hooks
    steps:
      - task: tasks/react-hooks.md
        allowlist: [courses/react-hooks/**]

  - name: api-design
    steps:
      - task: tasks/api-design.md
        allowlist: [courses/api-design/**]

  # ... more tracks
```

Run all in parallel:

```bash
runr orchestrate run --config plan.yaml --worktree
```

## State & Recovery

Orchestration state persists to disk after each action:

```
.runr/orchestrations/<orchestrator_id>/
  state.json          # Full state (tracks, claims, active runs)
  handoffs/
    complete.json     # Terminal artifact on success
    stop.json         # Terminal artifact on failure
```

This enables:
- Resume after crash or interruption
- Audit trail of scheduling decisions
- Manager dashboard via `receipt` command

## Ownership Claim Lifecycle

For non-worktree parallel runs:

```
1. Task declares: owns: [src/api/**]
2. Orchestrator normalizes: src/api/**
3. Before launch: Reserve claim, check conflicts
4. During run: Claim held
5. On complete: Release claim
6. Next track: Can now use src/api/**
```

Conflict detection uses glob pattern overlap:
- `src/api/**` vs `src/api/**` → Conflict
- `src/api/**` vs `src/api/auth/**` → Conflict (nested)
- `src/api/**` vs `src/ui/**` → No conflict

## Limitations

1. **Worktrees share node_modules** - Can't add new dependencies during run
2. **No cross-track dependencies** - Tracks are independent (use steps for sequencing)
3. **Pattern overlap is conservative** - May report false conflicts

## When to Use What

| Scenario | Recommendation |
|----------|----------------|
| Multiple independent features | `--worktree` |
| Isolated directories (courses, apps) | Either works |
| Shared code between tasks | Serial or careful ownership |
| CI/CD automation | `--worktree` + `serialize` |

## See Also

- [Run Lifecycle](run-lifecycle.md) - How individual runs work
- [Worktrees](worktrees.md) - Worktree isolation details
- [CLI Reference](cli.md) - Full command options
