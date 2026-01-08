# Tutorial

*Hands-on exercises to learn Runr. Takes about 30 minutes.*

> **Prerequisites**: Complete the [Quickstart](quickstart.md) first. You should have `runr doctor` passing.

---

## Exercise 1: Your First Run

Let's start with a trivial task to see the full lifecycle.

### Step 1: Create a test project

```bash
mkdir ~/runr-tutorial
cd ~/runr-tutorial
git init
npm init -y
mkdir -p src .runr/tasks
```

### Step 2: Create a minimal config

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "tutorial", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "*.md"]
  },
  "verification": {
    "tier0": ["echo 'No tests yet'"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

### Step 3: Create a simple task

Create `.runr/tasks/hello.md`:

```markdown
# Add a greeting module

Create `src/greet.js` that exports a function `greet(name)` which returns "Hello, {name}!".

## Requirements
- Single function export
- Handle missing name by returning "Hello, world!"

## Success Criteria
- File exists at src/greet.js
- Function handles both cases
```

### Step 4: Run it

```bash
runr run --task .runr/tasks/hello.md --time 5
```

### Step 5: Watch what happens

In another terminal:

```bash
runr follow latest
```

You'll see:
- PLAN phase: Creates milestones
- IMPLEMENT phase: Writes the code
- VERIFY phase: Runs your tier0 command
- REVIEW phase: Checks if it meets the goal
- CHECKPOINT phase: Commits the change

### Step 6: Check the results

```bash
# See the report
runr report latest

# Look at what was created
cat src/greet.js

# Check the git log
git log --oneline
```

---

## Exercise 2: Watching a Failure

Let's intentionally cause a failure to see how the agent handles it.

### Step 1: Add real verification

Update `.runr/runr.config.json`:

```json
{
  "agent": { "name": "tutorial", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "*.md"]
  },
  "verification": {
    "tier0": ["node src/greet.js"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

### Step 2: Create a task that will struggle

Create `.runr/tasks/add-test.md`:

```markdown
# Add a self-test to greet.js

Modify `src/greet.js` to run a self-test when executed directly.

When you run `node src/greet.js`, it should:
1. Call greet("Alice") and log the result
2. Call greet() and log the result
3. Exit with code 0 if both work

## Success Criteria
- Running `node src/greet.js` prints two greetings
- Exit code is 0
```

### Step 3: Run and observe

```bash
runr run --task .runr/tasks/add-test.md --time 5
```

Watch the run. You might see:
- VERIFY fails (syntax error, wrong output)
- Agent retries with the error message
- Eventually succeeds or stops after 3 attempts

### Step 4: If it stopped, check why

```bash
runr report latest

# Read the stop memo
cat .runr/runs/*/handoffs/stop.md
```

The stop memo tells you exactly what went wrong and what to try next.

---

## Exercise 3: Using Worktree Isolation

So far, changes went directly into your repo. Let's use worktree isolation.

### Step 1: Make sure your repo is clean

```bash
git add -A
git commit -m "checkpoint before worktree test"
```

### Step 2: Run with --worktree

Create `.runr/tasks/add-export.md`:

```markdown
# Add named export

Add a named export `farewell(name)` to `src/greet.js` that returns "Goodbye, {name}!".
```

Run with worktree:

```bash
runr run --task .runr/tasks/add-export.md --worktree --time 5
```

### Step 3: Notice the difference

```bash
# Your working directory is unchanged!
cat src/greet.js  # Still the old version

# The changes are in the worktree
cat .runr-worktrees/*/src/greet.js  # New version

# Check the branch
cd .runr-worktrees/*
git log --oneline -3
cd -
```

### Step 4: Merge when ready

If you like the changes:

```bash
# Get the branch name from the run
runr status latest

# Merge it
git merge runr/<run_id>/<slug>
```

---

## Exercise 4: Scope Guards in Action

Let's see what happens when a task tries to touch forbidden files.

### Step 1: Create a forbidden zone

```bash
mkdir -p config
echo "SECRET=abc123" > config/secrets.txt
git add config && git commit -m "add config"
```

### Step 2: Update config to forbid it

Update `.runr/runr.config.json`:

```json
{
  "agent": { "name": "tutorial", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "*.md"],
    "denylist": ["config/**"]
  },
  "verification": {
    "tier0": ["node src/greet.js"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

### Step 3: Try to break the rules

Create `.runr/tasks/bad-task.md`:

```markdown
# Update configuration

Add a new secret to `config/secrets.txt`.
```

Run it:

```bash
runr run --task .runr/tasks/bad-task.md --time 5
```

### Step 4: Watch it get blocked

The run will stop with `plan_scope_violation` because the planner proposed modifying `config/secrets.txt`, which is in the denylist.

```bash
runr report latest
```

This is the scope guard protecting you.

---

## Exercise 5: Resuming a Stopped Run

### Step 1: Create a task that will time out

Create `.runr/tasks/slow-task.md`:

```markdown
# Add comprehensive documentation

Create a README.md with:
- Project overview
- Installation instructions
- API documentation for all functions
- Examples
- Contributing guidelines
```

### Step 2: Run with a very short time limit

```bash
runr run --task .runr/tasks/slow-task.md --time 1 --worktree
```

It will likely stop with `time_budget_exceeded`.

### Step 3: Resume it

```bash
# Get the run ID
runr status --all

# Resume with more time
runr resume <run_id> --time 10
```

The run continues from where it left off, not from the beginning.

---

## Useful Commands to Explore

```bash
# See all runs
runr status --all

# Compare two runs
runr compare <run_id_1> <run_id_2>

# Clean up old worktrees
runr gc --dry-run
runr gc --older-than 1

# See where things are stored
runr paths

# Get aggregated metrics
runr metrics
```

---

## What to Try Next

1. **Real project**: Try it on a real codebase with actual tests
2. **Scope presets**: Add `"presets": ["typescript", "vitest"]` to your config
3. **Risk triggers**: Add tier1 tests that run only when certain files change
4. **Multi-track**: Try `runr orchestrate` for parallel task execution

---

## Troubleshooting

### "Worker not found"

```bash
runr doctor
```

Make sure Claude CLI is installed and authenticated.

### Run seems stuck

```bash
runr follow <run_id>
```

Check if it's waiting for a worker response. Workers can take a few minutes.

### Want to start over

```bash
# Delete a run's artifacts
rm -rf .runr/runs/<run_id>

# Delete the worktree (if used)
rm -rf .runr-worktrees/<run_id>

# Or clean all old runs
runr gc --older-than 0
```

---

## Next Steps

- [Configuration](configuration.md) - Full config options
- [CLI Reference](cli.md) - All commands
- [Troubleshooting](troubleshooting.md) - Common issues
