# Workflow v1 - Codebase Patterns Reference

**Purpose:** This document captures the reconnaissance results and codebase patterns used to create the bundle/submit command skeletons.

**Status:** Complete (2026-01-05)

---

## Reconnaissance Results

### 1. Command Registration (src/cli.ts)

**Pattern:** Uses `commander` library

```typescript
import { Command } from 'commander';
import { commandName } from './commands/command-name.js';

const program = new Command();

program
  .command('command-name')
  .description('Command description')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--other <value>', 'Other option')
  .action(async (options) => {
    await commandName({
      repo: options.repo,
      other: options.other
    });
  });
```

**Key observations:**
- Each option has: flag, description, default value (optional)
- `.action()` receives `options` object with camelCase keys
- Command function is called with options object

---

### 2. Command Structure (src/commands/resume.ts as example)

**Pattern:** Options interface + async function + RunStore

```typescript
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';

export interface CommandOptions {
  repo: string;
  runId: string;
  otherOption: string;
}

export async function commandName(options: CommandOptions): Promise<void> {
  // 1. Initialize RunStore
  const runStore = RunStore.init(options.runId, options.repo);

  // 2. Read state (with error handling)
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    console.error(`Error: run state not found for ${options.runId}`);
    process.exitCode = 1;
    return;
  }

  // 3. Load config if needed
  const config = loadConfig(resolveConfigPath(options.repo, options.config));

  // 4. Do work...

  // 5. Append events
  runStore.appendEvent({
    type: 'event_type',
    source: 'cli',
    payload: {
      // event data
    }
  });
}
```

**Key observations:**
- **No throws** - Set `process.exitCode = 1` and return early
- **Early returns** - Exit immediately on error
- **RunStore.init(runId, repo)** - Creates store instance
- **runStore.readState()** - Gets current state
- **runStore.appendEvent()** - Appends to timeline

---

### 3. RunStore Usage

**Initialization:**
```typescript
const runStore = RunStore.init(runId, repo);
```

**Reading state:**
```typescript
const state = runStore.readState();
```

**Accessing run directory:**
```typescript
runStore.path  // Returns: /path/to/repo/.runr/runs/<run_id>
```

**Appending events:**
```typescript
runStore.appendEvent({
  type: 'event_type',
  source: 'submit' | 'cli' | 'supervisor',
  payload: {
    // event-specific data
  }
});
```

---

### 4. RunState Schema (src/types/schemas.ts)

**Relevant fields for bundle/submit:**
```typescript
interface RunState {
  run_id: string;
  started_at?: string;
  repo_path?: string;
  phase?: string;
  stop_reason?: string | null;
  milestone_index?: number;
  milestones?: Array<{ goal: string }>;
  checkpoint_commit_sha?: string;  // <-- critical for submit
  last_verification_evidence?: VerificationEvidence | null;
  // ... other fields
}

interface VerificationEvidence {
  tiers_run?: string[];
  commands_run?: Array<{ command: string }>;
  // ... other fields
}
```

---

### 5. Config Schema (src/config/schema.ts)

**Current schema:**
```typescript
export const agentConfigSchema = z.object({
  agent: agentSchema,
  repo: repoSchema.default({}),
  scope: scopeSchema,
  verification: verificationSchema,
  workers: workersSchema.default({}),
  phases: phasesSchema.default({}),
  resilience: resilienceSchema.default({})
});
```

**What M0 will add:**
```typescript
const workflowConfigSchema = z.object({
  profile: z.enum(['solo', 'pr', 'trunk']).default('solo'),
  integration_branch: z.string(),
  submit_strategy: z.literal('cherry-pick').default('cherry-pick'),
  require_clean_tree: z.boolean().default(true),
  require_verification: z.boolean().default(true)
});

export const agentConfigSchema = z.object({
  // ... existing fields
  workflow: workflowConfigSchema.optional()  // <-- add this
});
```

---

### 6. Config Loading

**Pattern:**
```typescript
import { loadConfig, resolveConfigPath } from '../config/load.js';

const config = loadConfig(resolveConfigPath(repo, options.config));
```

**Access workflow config (after M0):**
```typescript
const workflow = config.workflow ?? {
  // defaults if workflow config missing
  integration_branch: 'dev',
  require_clean_tree: true,
  require_verification: true,
  submit_strategy: 'cherry-pick' as const
};
```

---

### 7. Error Handling

**Pattern: No throws, set exitCode and return**

```typescript
// ❌ DON'T DO THIS
throw new Error('Something failed');

// ✅ DO THIS
console.error('Error: Something failed');
process.exitCode = 1;
return;
```

**Timeline event on error:**
```typescript
runStore.appendEvent({
  type: 'submit_validation_failed',
  source: 'submit',
  payload: {
    run_id: options.runId,
    reason: 'no_checkpoint',
    details: 'Run has no checkpoint_commit_sha in state.json'
  }
});
console.error('Submit blocked: no_checkpoint');
console.error('Run has no checkpoint_commit_sha in state.json');
process.exitCode = 1;
return;
```

---

### 8. Git Operations

**Pattern: Use execa directly**

```typescript
import { execa } from 'execa';

// Execute git command
const result = await execa('git', ['status', '--porcelain'], { cwd: repoPath });
const output = result.stdout.trim();

// Best-effort (don't fail on error)
try {
  await execa('git', ['checkout', branch], { cwd: repoPath });
} catch {
  // Ignore errors
}
```

**Common git commands:**
```typescript
// Check if object exists
await execa('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd });

// Check if branch exists
await execa('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd });

// Get current branch
const result = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
const branch = result.stdout.trim();

// Get conflicted files
const result = await execa('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
const files = result.stdout.split('\n').filter(Boolean).sort();

// Git show stat (deterministic)
const result = await execa('git', ['show', '--stat', '--oneline', '--no-color', sha], { cwd });
const diffstat = result.stdout.trim();
```

---

## Skeleton Implementation Details

### Bundle Command (src/commands/bundle.ts)

**What it does:**
- Reads run state from `.runr/runs/<run_id>/state.json`
- Generates deterministic markdown packet
- Outputs to stdout or `--output` file

**Deterministic requirements met:**
- No absolute paths in output (only relative paths like `.runr/runs/<run_id>/...`)
- Timeline events sorted alphabetically by type
- Git diffstat is stable for a given SHA
- All milestones rendered in order

**Key functions:**
- `getVerificationStatus(state)` - Formats verification evidence
- `renderMilestones(state)` - Creates checklist with completion status
- `getCheckpointDiffstat(repo, sha)` - Gets git show --stat output
- `getTimelineSummary(runDir)` - Counts events, sorts alphabetically

---

### Submit Command (src/commands/submit.ts)

**What it does:**
- Validates run state + config requirements
- Cherry-picks checkpoint to integration branch
- Handles conflicts by aborting and restoring branch
- Optionally pushes to origin

**Validation chain (fail-fast):**
1. Checkpoint SHA exists in state → `no_checkpoint`
2. Checkpoint SHA exists as git object → `run_not_ready`
3. Verification evidence present (if required) → `verification_missing`
4. Working tree clean (if required) → `dirty_tree`
5. Target branch exists → `target_branch_missing`

**Safety features:**
- Captures starting branch before checkout
- Restores starting branch in `finally` block (best-effort)
- Aborts cherry-pick on conflict
- Sorts conflicted files alphabetically (deterministic)
- Dry-run mode doesn't write events or make changes

**Timeline events:**
- `run_submitted` - Success
- `submit_conflict` - Cherry-pick conflict
- `submit_validation_failed` - Validation blocked submit

---

## Workflow Config (M0 Will Add)

**Location:** `src/config/schema.ts`

**Schema:**
```typescript
const workflowConfigSchema = z.object({
  profile: z.enum(['solo', 'pr', 'trunk']).default('solo'),
  integration_branch: z.string(),
  submit_strategy: z.literal('cherry-pick').default('cherry-pick'),
  require_clean_tree: z.boolean().default(true),
  require_verification: z.boolean().default(true)
});
```

**Profile presets (M0 will implement):**
```typescript
function getProfileDefaults(profile: 'solo' | 'pr' | 'trunk'): Partial<WorkflowConfig> {
  switch (profile) {
    case 'solo':
      return { integration_branch: 'dev', require_verification: true };
    case 'pr':
      return { integration_branch: 'main', require_verification: false };
    case 'trunk':
      return { integration_branch: 'main', require_verification: true };
  }
}
```

**Usage in submit command (after M0):**
```typescript
const config = loadConfig(resolveConfigPath(repo, options.config));
const workflow = config.workflow ?? {
  integration_branch: 'dev',
  require_clean_tree: true,
  require_verification: true,
  submit_strategy: 'cherry-pick' as const
};
```

---

## CLI Registration (M0 Will Add)

**Location:** `src/cli.ts`

**Bundle command:**
```typescript
program
  .command('bundle')
  .description('Generate evidence packet for a run')
  .requiredOption('--run-id <id>', 'Run ID to bundle')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--output <path>', 'Output file path (default: stdout)')
  .action(async (options) => {
    await bundleCommand({
      repo: options.repo,
      runId: options.runId,
      output: options.output
    });
  });
```

**Submit command:**
```typescript
program
  .command('submit')
  .description('Submit verified checkpoint to integration branch')
  .requiredOption('--run-id <id>', 'Run ID to submit')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--to <branch>', 'Target branch (default: from config)')
  .option('--dry-run', 'Preview without making changes', false)
  .option('--push', 'Push to origin after cherry-pick', false)
  .option('--config <path>', 'Path to runr.config.json')
  .action(async (options) => {
    await submitCommand({
      repo: options.repo,
      runId: options.runId,
      to: options.to,
      dryRun: options.dryRun,
      push: options.push,
      config: options.config
    });
  });
```

---

## Testing Patterns

**Unit tests (tests/commands/bundle.test.ts):**
```typescript
import { describe, it, expect } from 'vitest';
import { bundleCommand } from '../src/commands/bundle.js';

describe('bundle command', () => {
  it('generates deterministic markdown', async () => {
    // Create fixture run
    // Call bundleCommand()
    // Assert output format
  });

  it('handles missing checkpoint gracefully', async () => {
    // Create run with no checkpoint
    // Call bundleCommand()
    // Assert shows "none"
  });
});
```

**Integration tests (create sandbox repos):**
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

async function createSandboxRepo(tempDir: string) {
  await execa('git', ['init'], { cwd: tempDir });
  await execa('git', ['commit', '--allow-empty', '-m', 'initial'], { cwd: tempDir });
  // Create fake run structure
  const runDir = path.join(tempDir, '.runr', 'runs', 'test-run');
  await fs.promises.mkdir(runDir, { recursive: true });
  // Write state.json, timeline.jsonl, etc.
}
```

---

## Determinism Checklist

**Bundle output:**
- ✅ No absolute file paths (only relative: `.runr/runs/<run_id>/...`)
- ✅ Timeline events sorted alphabetically by type
- ✅ Milestones rendered in order (no randomness)
- ✅ Artifacts list in fixed order
- ✅ Git diffstat is stable for given SHA

**Submit conflict detection:**
- ✅ Conflicted files sorted alphabetically (`git diff --name-only --diff-filter=U | sort`)
- ✅ Event payload has deterministic structure

**Timeline events:**
- ✅ All events have: type, source, payload
- ✅ Timestamps use ISO 8601 format
- ✅ All fields have consistent types

---

## Next Steps (Milestone Execution)

**M0: Workflow Config**
1. Add `workflowConfigSchema` to `src/config/schema.ts`
2. Add profile defaults function
3. Update `src/commands/init.ts` to write workflow config
4. Test: `runr init --workflow solo` writes correct config

**M1: Bundle Command**
1. Register command in `src/cli.ts`
2. Skeleton already matches patterns (no changes needed)
3. Test on real runs: `runr bundle <run_id>`
4. Verify determinism: run twice, compare output

**M2: Submit Command**
1. Register command in `src/cli.ts`
2. Update skeleton to use `config.workflow` (after M0)
3. Test in sandbox repos first
4. Test validation paths (missing checkpoint, dirty tree, etc.)
5. Test dry-run mode
6. Test conflict detection

**M3: Polish & Dogfood**
1. Update doctor to show workflow config
2. Update docs with examples
3. Dogfood bundle (safe, read-only)
4. Dogfood submit dry-run (safe, no changes)
5. Dogfood submit to throwaway branch
6. Dogfood submit to dev (after proven safe)

---

## References

- Command examples: `src/commands/resume.ts`, `src/commands/run.ts`
- Schema: `src/config/schema.ts`, `src/types/schemas.ts`
- RunStore: `src/store/run-store.ts`
- CLI registration: `src/cli.ts`
- Task file: `.runr/tasks/workflow-v1-implementation.md`
