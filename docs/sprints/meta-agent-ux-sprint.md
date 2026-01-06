# Meta-Agent UX Sprint

**Status:** In Progress
**Sprint Goal:** Make Runr "native" in Claude Code/Codex with zero ceremony — no prompt paste, one command to start

## Context

Currently, users must manually copy/paste agent prompts or read AGENTS.md/CLAUDE.md themselves. We want agents (Claude Code, Codex) to **discover and follow** repo workflow rules automatically.

## What the ecosystem gives us (native affordances)

### Claude Code
- **Skills** (`.claude/skills/<name>/SKILL.md`) - Auto-discovered, confirmation-gated playbooks
- **Commands** (`.claude/commands/*.md`) - Slash commands shown in `/help`
- **Settings** (`.claude/settings.json`) - Project configuration
- CLAUDE.md is read as supplemental project context

### Codex CLI
- **AGENTS.md is first-class** - Codex reads it before doing work
- No skill/command system (yet)

## Sprint Deliverables

### 1. `runr meta` Command

**Purpose:** One-command entrypoint to launch meta-agent with proper safety checks and context.

**Spec:**

```bash
runr meta [--tool auto|claude|codex] [--allow-dirty]
```

**Behavior:**

1. **Detect tool** (unless overridden):
   - Check for `claude` binary (Claude Code)
   - Check for `codex` binary (Codex CLI)
   - Error if neither found

2. **Safety checks** (CRITICAL - prevents data loss):
   - `git status --porcelain`:
     - Default: **BLOCK** if dirty with loud warning:
       ```
       ⛔ BLOCKED: Working tree has uncommitted changes

       Running agents on uncommitted work risks data loss.

       Fix with:
         git commit -am "WIP: save before agent"
         # OR
         git stash

       To override (not recommended):
         runr meta --allow-dirty
       ```
     - `--allow-dirty`: Allow but print skull-level warning

3. **Verify repo setup:**
   - `.runr/config` exists (else suggest `runr init --pack solo`)
   - `.gitignore` contains `.runr/**` entries
   - `AGENTS.md` exists

4. **Claude-specific checks** (if tool is Claude):
   - Ensure `.claude/` directory exists
   - If pack has `--with-claude` support, ensure `.claude/skills/` and `.claude/commands/` are populated
   - Offer to install if missing: `runr init --pack solo --with-claude` (non-destructive, only adds .claude files)

5. **Launch tool:**
   - `claude` (or `codex`) with no system prompt injection
   - Relies on native discovery (AGENTS.md, skills, commands)
   - Prints brief context:
     ```
     Launching Claude Code with Runr workflow...

     Agent will follow rules from:
     - AGENTS.md (workflow guide)
     - .claude/skills/runr-workflow (safety playbook)

     Exit with Ctrl+C
     ```

**Exit codes:**
- `0` - Launched successfully
- `1` - Safety check failed (dirty tree, missing setup)
- `2` - Tool not found

---

### 2. Claude Code Integration Templates

**What:** Template files added to packs that scaffold `.claude/skills/` and `.claude/commands/`

**Triggered by:** `runr init --pack solo --with-claude`

**Files to create:**

#### `.claude/skills/runr-workflow/SKILL.md`

**Purpose:** Auto-discovered playbook that teaches agents the Runr loop + safety rules

**Content structure:**
```markdown
---
name: runr-workflow
description: Safe, checkpointed Runr workflow - always verify and bundle before finish
---

# Runr Workflow Skill

You are working in a repository using **Runr** for safe, verified agent work.

## The Runr Loop (Always Follow)

1. **Plan** → understand task requirements
2. **Milestone** → break into incremental steps
3. **Verify** → run tests after each milestone
4. **Checkpoint** → create verified checkpoint
5. **Repeat** until done
6. **Bundle + Dry-run** → always finish with evidence

## Commands You'll Use

- `runr run --task .runr/tasks/<name>.md --worktree` - Start task
- `runr status <run_id>` - Check progress
- `runr resume <run_id>` - Continue from checkpoint
- `runr bundle <run_id>` - Generate evidence packet
- `runr submit <run_id> --to <branch> --dry-run` - Preview submit
- `runr submit <run_id> --to <branch>` - Submit verified work

## Safety Rules (CRITICAL - Never Violate)

### Rule 1: Never delete on dirty tree
- Before any file deletion, run: `git status --porcelain`
- If output is non-empty: **REFUSE** with message:
  "Working tree has uncommitted changes. Commit or stash before deletion."

### Rule 2: Never delete outside `.runr/` without explicit file list
- If asked to "clean up" or "remove files", respond:
  "I can only safely delete files within `.runr/` directory.
   For project files, provide explicit file list."
- **Never assume** what "cleanup" means

### Rule 3: Must end with bundle + dry-run
Every task must end with:
```bash
runr bundle <run_id> --output /tmp/bundle.md
runr submit <run_id> --to dev --dry-run
# Review dry-run output
runr submit <run_id> --to dev
```

### Rule 4: Trust verification, not promises
- Verification passed = trustable change
- No verification = not trustable
- Never claim "tests passed" without evidence

## When Things Go Wrong

### Verification fails
1. Read the error output carefully
2. Fix the specific issue
3. Re-verify
4. Don't move to next milestone until verification passes

### Scope violation
1. Stop immediately
2. Run `runr bundle <run_id>`
3. Explain what file was outside scope
4. Ask user to adjust scope or task

### Submit conflict
1. Expect `submit_conflict` event
2. Check timeline.jsonl for conflicted files
3. Inform user - they must resolve manually

## Evidence Discipline

- Always paste command outputs, don't paraphrase
- If verification fails, show the error in full
- Bundle contains the audit trail - use it

**Violation of any safety rule = stop and ask user for clarification.**
```

#### `.claude/commands/runr-bundle.md`

```markdown
---
description: Generate Runr evidence bundle for review
---

# Bundle Evidence

Generates a deterministic Markdown evidence packet for a Runr run.

## Usage

```bash
runr bundle <run_id> --output /tmp/bundle-<run_id>.md
```

## What's in the bundle?

- Checkpoint metadata
- Milestone progression
- Verification evidence
- Diff statistics
- Timeline summary

## When to use

- Before submitting verified work
- When debugging why verification failed
- When providing audit trail to team
```

#### `.claude/commands/runr-submit.md`

```markdown
---
description: Submit verified checkpoint to integration branch
---

# Submit Verified Checkpoint

Cherry-picks a verified checkpoint to the integration branch.

## Usage

**Always dry-run first:**
```bash
runr submit <run_id> --to dev --dry-run
```

**Then submit:**
```bash
runr submit <run_id> --to dev
```

**Optional: push to origin:**
```bash
runr submit <run_id> --to dev --push
```

## Requirements

- Checkpoint must exist
- Verification evidence must be present
- Working tree must be clean
- Target branch must exist

## If it fails

Check the error:
- `dirty_tree` → commit or stash changes
- `verification_missing` → run wasn't verified
- `submit_conflict` → manual resolution needed
```

#### `.claude/commands/runr-resume.md`

```markdown
---
description: Resume Runr run from last checkpoint
---

# Resume from Checkpoint

Continues a stopped run from its last verified checkpoint.

## Usage

```bash
runr resume <run_id>
```

## Options

- `--plan` - Show resume plan without executing
- `--force` - Resume despite environment fingerprint mismatch
- `--auto-stash` - Automatically stash uncommitted changes

## When to use

- Verification failed and you fixed the issue
- Run hit time budget
- Run stopped due to scope violation
```

---

### 3. Enhanced `runr doctor` Safety Checks

**Add these checks to `doctorCommand()`:**

#### Check 1: Dirty tree warning (meta-agent safety)
```typescript
// After existing working tree check
if (!treeCheck.clean && treeCheck.uncommittedCount > 0) {
  console.log('\n⚠️  Meta-Agent Safety Warning:');
  console.log('   Never run agents on uncommitted work - you risk data loss.');
  console.log('   Commit or stash before using `runr meta` or `runr run`.');
}
```

#### Check 2: Claude Code integration status
```typescript
// New check
const claudeCheck = checkClaudeIntegration(repoPath);
if (claudeCheck.claudeDetected) {
  if (claudeCheck.skillsPresent) {
    console.log('Claude Code integration: OK (.claude/skills/ present)');
  } else {
    console.log('Claude Code integration: PARTIAL');
    console.log('  .claude/skills/ missing - run "runr init --pack solo --with-claude"');
  }
}
```

#### Check 3: AGENTS.md presence
```typescript
const agentsCheck = checkAgentsMd(repoPath);
if (!agentsCheck.exists) {
  console.log('⚠️  AGENTS.md missing');
  console.log('   Run "runr init --pack solo" to create workflow documentation');
}
```

---

### 4. Pack Template Updates

**Update `packs/solo/pack.json`:**

Add `.claude/` templates:

```json
{
  "templates": {
    "AGENTS.md": "templates/AGENTS.md.tmpl",
    "CLAUDE.md": "templates/CLAUDE.md.tmpl",
    "bundle.md": "templates/bundle.md.tmpl",
    "claude-skill": "templates/claude-skill.md.tmpl",
    "claude-cmd-bundle": "templates/claude-cmd-bundle.md.tmpl",
    "claude-cmd-submit": "templates/claude-cmd-submit.md.tmpl",
    "claude-cmd-resume": "templates/claude-cmd-resume.md.tmpl"
  },
  "init_actions": [
    // ... existing gitignore actions ...
    {
      "type": "create_file_if_missing",
      "path": ".claude/skills/runr-workflow/SKILL.md",
      "template": "claude-skill",
      "mode": "0644",
      "when": { "flag": "with_claude" }
    },
    {
      "type": "create_file_if_missing",
      "path": ".claude/commands/runr-bundle.md",
      "template": "claude-cmd-bundle",
      "mode": "0644",
      "when": { "flag": "with_claude" }
    },
    {
      "type": "create_file_if_missing",
      "path": ".claude/commands/runr-submit.md",
      "template": "claude-cmd-submit",
      "mode": "0644",
      "when": { "flag": "with_claude" }
    },
    {
      "type": "create_file_if_missing",
      "path": ".claude/commands/runr-resume.md",
      "template": "claude-cmd-resume",
      "mode": "0644",
      "when": { "flag": "with_claude" }
    }
  ]
}
```

---

## Implementation Order

1. ✅ **Review design** (this document)
2. Create Claude Code template files in `packs/solo/templates/`
3. Update `packs/solo/pack.json` with new actions
4. Implement `runr meta` command in `src/commands/meta.ts`
5. Register command in `src/cli.ts`
6. Enhance `runr doctor` with new checks
7. Test with `runr init --pack solo --with-claude`
8. Update README with "one command" quick start

---

## Design Decisions (Locked In)

1. **No wrapper prompt injection** - Runr stays boring, agents discover via native mechanisms
2. **AGENTS.md = constitution** (cross-tool), CLAUDE.md = supplemental
3. **Skills = playbooks** (auto-applied), Commands = muscle memory
4. **Packs distribute everything** - no separate configuration system
5. **Dirty tree blocks by default** - prevents data loss (user must opt-in with `--allow-dirty`)
6. **`runr meta` is thin** - just safety checks + launch, no magic

---

## Testing Plan

### Manual testing
```bash
# Test 1: Fresh repo
cd /tmp/test-repo
git init
runr init --pack solo --with-claude
ls -la .claude/skills/runr-workflow/
ls -la .claude/commands/

# Test 2: Meta command (clean tree)
git add .
git commit -m "init"
runr meta
# Should launch Claude Code

# Test 3: Meta command (dirty tree)
echo "test" > foo.txt
runr meta
# Should BLOCK with safety message

# Test 4: Allow dirty
runr meta --allow-dirty
# Should show warning but launch

# Test 5: Doctor checks
runr doctor
# Should show Claude integration status
```

### Automated testing
- Unit tests for `executeAction` with `.claude/` paths
- Integration test for `runr init --with-claude` (verify files created)
- Doctor command tests (check Claude integration detection)

---

## Success Criteria

- [ ] `runr init --pack solo --with-claude` creates `.claude/skills/` and `.claude/commands/`
- [ ] `runr meta` blocks on dirty tree by default
- [ ] `runr meta` launches Claude Code successfully when clean
- [ ] `runr doctor` shows Claude integration status
- [ ] Skills/commands show up in Claude Code UI
- [ ] Zero manual prompt pasting required

---

## Out of Scope (Future)

- Codex-specific commands (no command system yet)
- Auto-upgrade existing repos (manual `runr init --with-claude` is fine for v1)
- Wrapper scripts for submit (user repos can add if needed, not Runr core)
- Multi-tool detection (pick one at a time for v1)
