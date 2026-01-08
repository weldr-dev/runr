# Migration Guide

## Migrating from agent-runner to Runr (v0.3.0+)

If you're upgrading from `agent-runner` (v0.2.x or earlier) to `@weldr/runr` (v0.3.0+), this guide will help you migrate smoothly.

### Overview

Version 0.3.0 renamed the project from `agent-runner` to `@weldr/runr`. The CLI, directory structure, and config file names have changed. **The old paths still work** during the transition period, but you'll see deprecation warnings.

### What Changed

| Old (v0.2.x) | New (v0.3.0+) |
|--------------|---------------|
| Package: `agent-runner` | Package: `@weldr/runr` |
| CLI: `agent` | CLI: `runr` |
| Directory: `.agent/` | Directory: `.runr/` |
| Config: `agent.config.json` | Config: `runr.config.json` |
| Worktrees: `.agent-worktrees/` | Worktrees: `.runr-worktrees/` |
| Env var: `AGENT_WORKTREES_DIR` | Env var: `RUNR_WORKTREES_DIR` |

### Migration Steps

#### 1. Install New Package

```bash
# Uninstall old package
npm uninstall -g agent-runner

# Install new package
npm install -g @weldr/runr

# Verify installation
runr --version
```

#### 2. Rename Directory

```bash
# In your project root
mv .agent .runr
```

#### 3. Rename Config File

```bash
# Inside .runr/ directory
mv .runr/agent.config.json .runr/runr.config.json
```

#### 4. Update .gitignore (if applicable)

If you have `.agent/` in your `.gitignore`:

```bash
# Replace this line:
.agent/

# With:
.runr/runs/
.runr-worktrees/
.runr/orchestrations/
```

**Note**: As of v0.5.0, we recommend **not** ignoring the entire `.runr/` directory. Instead, ignore only runtime artifacts:
- `.runr/runs/` — Runtime state
- `.runr-worktrees/` — Isolated worktrees
- `.runr/orchestrations/` — Orchestration artifacts

**Keep these tracked:**
- `.runr/runr.config.json` — Configuration
- `.runr/tasks/*.md` — Task definitions

#### 5. Update Scripts (if applicable)

If you have shell scripts or CI config that reference `agent` commands:

```bash
# Old
agent run --task .agent/tasks/my-task.md

# New
runr run --task .runr/tasks/my-task.md
```

#### 6. Update Environment Variables (if applicable)

If you set `AGENT_WORKTREES_DIR`:

```bash
# Old
export AGENT_WORKTREES_DIR=/custom/path

# New
export RUNR_WORKTREES_DIR=/custom/path
```

### Backwards Compatibility

During the transition period, both old and new paths work:

- `agent` CLI still works (with deprecation warning)
- `.agent/` directory still works (with deprecation warning)
- `agent.config.json` still works (with deprecation warning)

However, we recommend migrating soon. Support for legacy paths may be removed in a future major version.

### Verification

After migrating, verify everything works:

```bash
# Check CLI works
runr --version

# Check config is valid
runr doctor

# Check paths are correct
runr paths

# Run a simple task (if you have one)
runr run --task .runr/tasks/example-task.md --worktree
```

### What's New in v0.5.0

Since you're upgrading, you might want to take advantage of new features in v0.5.0:

#### Workflow System

- `runr bundle <run_id>` — Generate deterministic evidence packet
- `runr submit <run_id> --to <branch>` — Submit verified checkpoint to branch

#### Workflow Packs

- `runr init --pack solo` — Initialize with solo workflow (dev → main)
- `runr init --pack trunk` — Initialize with trunk-based workflow
- `runr packs` — List available packs

#### Auto .gitignore

Packs now automatically add `.runr/runs/`, `.runr-worktrees/`, and `.runr/orchestrations/` to your `.gitignore`.

See [CHANGELOG.md](CHANGELOG.md) for complete release notes.

### What's New in v0.7.x

Version 0.7.x introduces several major features:

#### Hybrid Workflow (Flow/Ledger Modes)

Switch between productivity-first and audit-first modes:

```bash
# View current mode
runr config mode

# Switch to flow mode (warns on gaps, doesn't block)
runr config mode flow

# Switch to ledger mode (blocks commits without attribution)
runr config mode ledger
```

#### Git Hooks for Provenance

```bash
# Install commit-msg hook
runr hooks install

# Check hook status
runr hooks status
```

Hooks enforce provenance tracking based on your workflow mode.

#### Demo Project

Try Runr in 2 minutes with the new `--demo` flag:

```bash
runr init --demo
cd runr-demo
npm install
runr run --task .runr/tasks/00-success.md
```

#### New Commands

- `runr continue` — Smart recovery, does the next obvious thing
- `runr meta` — Launch meta-agent mode with Claude Code
- `runr watch` — Monitor runs with auto-resume
- `runr intervene` — Record manual work for provenance
- `runr audit` — View provenance coverage

See [CHANGELOG.md](CHANGELOG.md) for complete v0.7.x release notes.

## Migrating to Workflow Packs (Optional)

If you want to use the new workflow packs (v0.5.0+), you can reinitialize your project:

### Option 1: Keep Existing Config

Your existing `.runr/runr.config.json` will continue to work. No changes needed.

### Option 2: Migrate to Solo Pack

If you want the full solo workflow experience (bundle + submit):

1. **Backup your current config:**
   ```bash
   cp .runr/runr.config.json .runr/runr.config.json.backup
   ```

2. **Reinitialize with solo pack:**
   ```bash
   runr init --pack solo --force
   ```

   This will:
   - Create `AGENTS.md` (agent guidelines)
   - Create `CLAUDE.md` (Claude Code integration)
   - Add `.runr/runs/`, `.runr-worktrees/`, `.runr/orchestrations/` to `.gitignore`
   - Set workflow config (integration_branch: dev, require_verification: true)

3. **Merge your custom config:**
   - Open `.runr/runr.config.json` and `.runr/runr.config.json.backup`
   - Copy over any custom verification commands, scope patterns, or worker settings

4. **Create dev branch (solo workflow requirement):**
   ```bash
   git checkout -b dev
   ```

5. **Commit the changes:**
   ```bash
   git add .
   git commit -m "chore: migrate to Runr solo workflow pack"
   ```

### Option 3: Migrate to Trunk Pack

If you work directly on main (no dev branch):

```bash
runr init --pack trunk --force
```

This sets `integration_branch: main` and works with a single branch.

## Need Help?

- **Documentation**: See [docs/](docs/) for complete guides
- **Solo Workflow**: See [docs/examples/solo-workflow.md](docs/examples/solo-workflow.md) for canonical reference
- **Issues**: Report bugs at https://github.com/anthropics/agent-framework/issues
