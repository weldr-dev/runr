# Hello World - 90-Second Runr Demo

**Goal**: See Runr's checkpoint workflow in under 2 minutes.

## What You'll Do

1. Initialize Runr with solo workflow
2. Run a simple task (add a new function)
3. See verified checkpoints
4. Submit to dev branch

## Prerequisites

```bash
npm install -g @weldr/runr
```

## Setup (30 seconds)

```bash
# Clone or create this project
cd hello-world

# Install dependencies
npm install

# Commit initial state (REQUIRED - Runr needs clean tree)
git add .
git commit -m "Initial commit"

# Create dev branch (solo workflow uses dev → main)
git checkout -b dev
```

## Run the Demo (60 seconds)

```bash
# 1. Initialize Runr (creates .runr/runr.config.json, .runr/tasks/, AGENTS.md)
runr init --pack solo

# 2. Commit Runr config
git add .
git commit -m "chore: initialize Runr solo workflow"

# 3. Run the example task
runr run --task .runr/tasks/add-farewell.md --worktree

# 4. Bundle the results (generates deterministic evidence packet)
runr bundle <run_id> --output /tmp/bundle.md

# 5. Preview integration (dry-run - changes nothing)
runr submit <run_id> --to dev --dry-run

# 6. Submit verified checkpoint to dev
runr submit <run_id> --to dev

# 7. Push (Git owns push)
git push origin dev
```

## What Just Happened?

1. **Runr created a worktree** - Your code was protected, changes happened in isolation
2. **Claude planned and implemented** - Following the task requirements
3. **Verification ran automatically** - Tests, typecheck, build (tier0/tier1/tier2)
4. **Checkpoint created** - Only after verification passed
5. **Evidence bundled** - Deterministic proof packet (same run_id → identical output)
6. **Submitted to dev** - Cherry-picked verified commit to your dev branch

## The Task File

`.runr/tasks/add-farewell.md`:

```markdown
# Add farewell function

## Goal
Add a farewell(name: string) function that returns "Goodbye, {name}!"

## Requirements
- Export farewell function from src/index.ts
- Add test in src/index.test.ts
- Follow same pattern as greet()

## Success Criteria
- Function returns correct string
- Test passes
- TypeScript compiles
```

## Key Commands

| Command | What it does |
|---------|-------------|
| `runr init --pack solo` | Initialize with solo workflow pack |
| `runr run --task <file> --worktree` | Run task in isolated worktree |
| `runr bundle <run_id>` | Generate evidence packet |
| `runr submit <run_id> --to dev` | Submit verified checkpoint to dev |
| `runr status` | Show run state |
| `runr follow` | Tail run progress |

## What's Tracked vs Ignored

**Tracked (committed):**
- `.runr/runr.config.json` - Configuration
- `.runr/tasks/*.md` - Task definitions
- `AGENTS.md` - Agent guidelines

**Ignored (not committed):**
- `.runr/runs/` - Runtime state/logs
- `.runr-worktrees/` - Isolated worktrees
- `.runr/orchestrations/` - Orchestration artifacts

## Next Steps

- Edit `.runr/runr.config.json` to customize verification commands
- Create your own task files in `.runr/tasks/`
- Run `runr --help` to see all commands
- Read [Solo Workflow Example](../../docs/examples/solo-workflow.md) for complete reference
