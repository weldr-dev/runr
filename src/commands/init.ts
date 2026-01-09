import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { AgentConfig, getWorkflowProfileDefaults } from '../config/schema.js';
import { loadPackByName } from '../packs/loader.js';
import { executeActions, ActionContext } from '../packs/actions.js';
import { formatVerificationCommands, TemplateContext } from '../packs/renderer.js';

export interface InitOptions {
  repo: string;
  interactive?: boolean;
  print?: boolean;
  force?: boolean;
  workflow?: 'solo' | 'pr' | 'trunk';
  pack?: string;
  about?: string;
  withClaude?: boolean;
  dryRun?: boolean;
  demo?: boolean;
  demoDir?: string;
}

interface DetectedVerification {
  tier0: string[];
  tier1: string[];
  tier2: string[];
}

interface DetectionResult {
  verification: DetectedVerification;
  presets: string[];
  source: 'package.json' | 'python' | 'heuristic' | 'none';
}

/**
 * Detect Python project verification commands
 */
function detectPythonVerification(repoPath: string): DetectionResult | null {
  const hasPyprojectToml = fs.existsSync(path.join(repoPath, 'pyproject.toml'));
  const hasPytestIni = fs.existsSync(path.join(repoPath, 'pytest.ini'));
  const hasPoetryLock = fs.existsSync(path.join(repoPath, 'poetry.lock'));

  // If no Python markers, return null
  if (!hasPyprojectToml && !hasPytestIni && !hasPoetryLock) {
    return null;
  }

  const verification: DetectedVerification = {
    tier0: [],
    tier1: [],
    tier2: []
  };

  const presets: string[] = [];

  // Parse pyproject.toml if it exists
  let pyprojectContent: any = null;
  if (hasPyprojectToml) {
    try {
      const pyprojectPath = path.join(repoPath, 'pyproject.toml');
      const content = fs.readFileSync(pyprojectPath, 'utf-8');

      // Simple TOML parsing for common sections
      // Look for [tool.poetry], [tool.pytest], etc.
      if (content.includes('[tool.poetry]') || hasPoetryLock) {
        presets.push('poetry');
        // Tier 1: Poetry install/check
        verification.tier1.push('poetry check');
      }

      if (content.includes('[tool.pytest]') || hasPytestIni) {
        presets.push('pytest');
        // Tier 2: Run tests
        verification.tier2.push('pytest');
      }

      // Check for mypy, black, ruff, etc.
      if (content.includes('[tool.mypy]') || content.includes('mypy')) {
        verification.tier0.push('mypy .');
      }

      if (content.includes('[tool.black]') || content.includes('black')) {
        verification.tier0.push('black --check .');
      }

      if (content.includes('[tool.ruff]') || content.includes('ruff')) {
        verification.tier0.push('ruff check .');
      }

    } catch {
      // If parsing fails, continue with basic detection
    }
  }

  // If pytest.ini exists but not already detected
  if (hasPytestIni && !verification.tier2.includes('pytest')) {
    presets.push('pytest');
    verification.tier2.push('pytest');
  }

  // If nothing was detected, return null
  if (verification.tier0.length === 0 && verification.tier1.length === 0 && verification.tier2.length === 0) {
    return null;
  }

  return {
    verification,
    presets,
    source: 'python'
  };
}

/**
 * Detect verification commands from package.json scripts
 */
function detectFromPackageJson(repoPath: string): DetectionResult | null {
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};

    const verification: DetectedVerification = {
      tier0: [],
      tier1: [],
      tier2: []
    };

    const presets: string[] = [];

    // Tier 0: fast checks (lint, typecheck)
    if (scripts.typecheck) {
      verification.tier0.push('npm run typecheck');
    } else if (scripts.tsc || scripts['type-check']) {
      verification.tier0.push(`npm run ${scripts.tsc ? 'tsc' : 'type-check'}`);
    }

    if (scripts.lint) {
      verification.tier0.push('npm run lint');
    } else if (scripts.eslint) {
      verification.tier0.push('npm run eslint');
    }

    // Tier 1: build (slower, but catches integration issues)
    if (scripts.build) {
      verification.tier1.push('npm run build');
    } else if (scripts.compile) {
      verification.tier1.push('npm run compile');
    }

    // Tier 2: tests (slowest, most comprehensive)
    if (scripts.test) {
      verification.tier2.push('npm run test');
    } else if (scripts.jest || scripts.vitest) {
      verification.tier2.push(`npm run ${scripts.jest ? 'jest' : 'vitest'}`);
    }

    // Detect presets from dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    if (allDeps.typescript) presets.push('typescript');
    if (allDeps.vitest) presets.push('vitest');
    if (allDeps.jest) presets.push('jest');
    if (allDeps.next) presets.push('nextjs');
    if (allDeps.react && !allDeps.next) presets.push('react');
    if (allDeps.drizzle) presets.push('drizzle');
    if (allDeps.prisma || allDeps['@prisma/client']) presets.push('prisma');
    if (allDeps.playwright || allDeps['@playwright/test']) presets.push('playwright');
    if (allDeps.tailwindcss) presets.push('tailwind');
    if (allDeps.eslint) presets.push('eslint');

    // If nothing detected, return null
    if (verification.tier0.length === 0 && verification.tier1.length === 0 && verification.tier2.length === 0) {
      return null;
    }

    return {
      verification,
      presets,
      source: 'package.json'
    };
  } catch {
    return null;
  }
}

/**
 * Generate default config when auto-detection fails
 */
function generateDefaultConfig(repoPath: string): DetectionResult & { reason?: string } {
  const hasSrc = fs.existsSync(path.join(repoPath, 'src'));
  const hasTests = fs.existsSync(path.join(repoPath, 'tests')) ||
                   fs.existsSync(path.join(repoPath, 'test'));

  const presets: string[] = [];

  // Check for common config files
  if (fs.existsSync(path.join(repoPath, 'tsconfig.json'))) {
    presets.push('typescript');
  }

  // Determine why we couldn't detect verification
  let reason = 'no-package-json';
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.scripts && Object.keys(packageJson.scripts).length > 0) {
        reason = 'no-matching-scripts';
      } else {
        reason = 'empty-scripts';
      }
    } catch {
      reason = 'invalid-package-json';
    }
  }

  return {
    verification: {
      tier0: [],
      tier1: [],
      tier2: []
    },
    presets,
    source: 'none',
    reason
  };
}

/**
 * Build config object from detection results
 */
function buildConfig(repoPath: string, detection: DetectionResult, workflowProfile?: 'solo' | 'pr' | 'trunk'): AgentConfig {
  const hasSrc = fs.existsSync(path.join(repoPath, 'src'));
  const hasTests = fs.existsSync(path.join(repoPath, 'tests')) ||
                   fs.existsSync(path.join(repoPath, 'test'));

  // Build allowlist based on directory structure
  const allowlist: string[] = [];
  if (hasSrc) allowlist.push('src/**');
  if (hasTests) {
    allowlist.push('tests/**');
    allowlist.push('test/**');
  }
  if (allowlist.length === 0) {
    // Default: allow everything except common excludes
    allowlist.push('**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx');
  }

  const config: AgentConfig = {
    agent: {
      name: path.basename(repoPath),
      version: '1'
    },
    scope: {
      allowlist,
      denylist: ['node_modules/**', '.env'],
      lockfiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
      presets: detection.presets,
      env_allowlist: [
        'node_modules',
        'node_modules/**',
        '.next/**',
        'dist/**',
        'build/**',
        '.turbo/**',
        '.eslintcache',
        'coverage/**'
      ]
    },
    verification: {
      tier0: detection.verification.tier0,
      tier1: detection.verification.tier1,
      tier2: detection.verification.tier2,
      risk_triggers: [],
      max_verify_time_per_milestone: 600
    },
    repo: {},
    workers: {
      codex: {
        bin: 'codex',
        args: ['exec', '--full-auto', '--json'],
        output: 'jsonl'
      },
      claude: {
        bin: 'claude',
        args: ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
        output: 'json'
      }
    },
    phases: {
      plan: 'claude',
      implement: 'codex',
      review: 'claude'
    },
    resilience: {
      auto_resume: false,
      max_auto_resumes: 1,
      auto_resume_delays_ms: [30000, 120000, 300000],
      max_worker_call_minutes: 45,
      max_review_rounds: 2
    },
    receipts: {
      redact: true,
      capture_cmd_output: 'truncated',
      max_output_bytes: 10240
    }
  };

  // Add workflow config if profile specified
  if (workflowProfile) {
    config.workflow = getWorkflowProfileDefaults(workflowProfile) as any;
  }

  return config;
}

/**
 * Create example task files
 */
function createExampleTasks(runrDir: string): void {
  const tasksDir = path.join(runrDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });

  // Automated task with owns declaration
  const exampleBugfix = `---
type: automated
owns:
  - src/[module]/**
---

# Fix Bug: [Description]

## Goal
Fix [specific bug] in [component/module]

## Requirements
- Identify root cause
- Implement fix
- Add test to prevent regression

## Success Criteria
- Bug is fixed (verified manually or with specific test)
- All existing tests still pass
- New test added covering the bug scenario
`;

  // Automated task with dependency on bugfix
  const exampleFeature = `---
type: automated
owns:
  - src/[feature]/**
  - tests/[feature]/**
depends_on:
  - .runr/tasks/example-bugfix.md
---

# Add Feature: [Description]

## Goal
Implement [feature] that allows users to [action]

## Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

## Success Criteria
- Feature works as described
- Tests added covering main use cases
- All verification checks pass (lint, typecheck, build, tests)
`;

  // Task that depends on feature being complete
  const exampleDocs = `---
type: automated
owns:
  - docs/**
  - README.md
depends_on:
  - .runr/tasks/example-feature.md
---

# Update Documentation

## Goal
Update documentation for [topic/module]

## Requirements
- Document new features/changes
- Update code examples if needed
- Fix any outdated information

## Success Criteria
- Documentation is accurate and clear
- Examples run without errors
- All verification checks pass
`;

  // Manual task example - for things that require human action
  const exampleManual = `---
type: manual
---

# Manual Setup: [Description]

## Goal
Complete these manual steps that cannot be automated.

## Steps
1. [ ] Step 1: [Description of manual action]
2. [ ] Step 2: [Another manual action]
3. [ ] Step 3: [Final verification]

## When Complete
After completing all steps above, mark this task as done:

\`\`\`bash
runr tasks mark-complete example-manual.md
\`\`\`
`;

  fs.writeFileSync(path.join(tasksDir, 'example-bugfix.md'), exampleBugfix);
  fs.writeFileSync(path.join(tasksDir, 'example-feature.md'), exampleFeature);
  fs.writeFileSync(path.join(tasksDir, 'example-docs.md'), exampleDocs);
  fs.writeFileSync(path.join(tasksDir, 'example-manual.md'), exampleManual);
}

/**
 * Ensure .gitignore contains the specified entry.
 * Returns true if entry was added, false if already present.
 */
async function ensureGitignoreEntry(repoPath: string, entry: string): Promise<boolean> {
  const gitignorePath = path.join(repoPath, '.gitignore');

  let content = '';
  try {
    content = await fsPromises.readFile(gitignorePath, 'utf-8');
  } catch {
    // No .gitignore exists, will create one
  }

  // Check if entry already exists
  const lines = content.split('\n');
  const hasEntry = lines.some(line => line.trim() === entry.trim());

  if (!hasEntry) {
    const newContent = content.endsWith('\n') || content === ''
      ? `${content}${entry}\n`
      : `${content}\n${entry}\n`;
    await fsPromises.writeFile(gitignorePath, newContent);
    return true; // Added
  }

  return false; // Already present
}

/**
 * Generate the demo project
 */
async function generateDemoProject(demoDir: string): Promise<void> {
  fs.mkdirSync(demoDir, { recursive: true });
  fs.mkdirSync(path.join(demoDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(demoDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(demoDir, '.runr', 'tasks'), { recursive: true });

  const packageJson = {
    name: 'runr-demo',
    version: '1.0.0',
    type: 'module',
    scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
    devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' }
  };
  fs.writeFileSync(path.join(demoDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'node',
      strict: true, esModuleInterop: true, skipLibCheck: true, outDir: 'dist'
    },
    include: ['src/**/*', 'tests/**/*']
  };
  fs.writeFileSync(path.join(demoDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

  fs.writeFileSync(path.join(demoDir, 'src', 'math.ts'), `/**
 * Simple math functions for demo
 */
export function add(a: number, b: number): number { return a + b; }
export function subtract(a: number, b: number): number { return a - b; }
export function divide(a: number, b: number): number { return a / b; }
// TODO: implement multiply
`);

  fs.writeFileSync(path.join(demoDir, 'tests', 'math.test.ts'), `import { describe, it, expect } from 'vitest';
import { add, subtract, divide } from '../src/math.js';

describe('math', () => {
  it('adds two numbers', () => { expect(add(2, 3)).toBe(5); });
  it('subtracts two numbers', () => { expect(subtract(5, 3)).toBe(2); });
  // INTENTIONAL BUG: expects 999 but divide(10, 2) returns 5
  // Task 01 will fix this by changing 999 to 5
  it('divides two numbers', () => { expect(divide(10, 2)).toBe(999); });
});
`);

  const runrConfig = {
    agent: { name: 'runr-demo', version: '1' },
    scope: {
      allowlist: ['src/**', 'tests/**', '.runr/**'],
      denylist: ['node_modules/**', 'README.md'],
      lockfiles: ['package-lock.json'],
      presets: ['typescript', 'vitest']
    },
    verification: { tier0: ['npm run typecheck'], tier1: ['npm test'] },
    workers: { claude: { bin: 'claude', args: ['-p', '--output-format', 'json', '--dangerously-skip-permissions'], output: 'json' } },
    phases: { plan: 'claude', implement: 'claude', review: 'claude' },
    workflow: { profile: 'solo', mode: 'flow', integration_branch: 'main', require_verification: true, require_clean_tree: true }
  };
  fs.writeFileSync(path.join(demoDir, '.runr', 'runr.config.json'), JSON.stringify(runrConfig, null, 2) + '\n');

  fs.writeFileSync(path.join(demoDir, '.runr', 'tasks', '00-success.md'), `---
type: automated
owns:
  - src/math.ts
  - tests/math.test.ts
---

# Implement multiply function

## Goal
Add a multiply function to src/math.ts and add a test for it.

## Requirements
- Add \`multiply(a: number, b: number): number\` to src/math.ts
- Add a test in tests/math.test.ts

## Success Criteria
- npm run typecheck passes
- npm test passes
`);

  fs.writeFileSync(path.join(demoDir, '.runr', 'tasks', '01-fix-failing-test.md'), `---
type: automated
owns:
  - tests/math.test.ts
---

# Fix the failing divide test

## Goal
The divide test is currently failing. Fix it.

## Context
Run \`npm test\` to see the failure. The test expects the wrong value.

## Requirements
- Fix the failing test in tests/math.test.ts
- The divide(10, 2) test should expect 5, not 999

## Success Criteria
- npm run typecheck passes
- npm test passes

## Note
This task demonstrates the autofix flow. When verification fails,
run \`runr\` to see safe commands, then \`runr continue\` to auto-fix.
`);

  fs.writeFileSync(path.join(demoDir, '.runr', 'tasks', '02-scope-violation.md'), `---
type: automated
owns:
  - README.md
---

# Update README (will be blocked)

## Goal
Update README.md to describe this math library.

## Requirements
- Add a description of the available functions
- Add usage examples

## Success Criteria
- README.md contains function documentation

## Expected Behavior
This task WILL be blocked by the scope guard.
README.md is in the denylist (see .runr/runr.config.json).

This demonstrates Runr's safety guardrails working correctly.
Run \`runr report latest\` to see the guard violation details.
`);

  // Add a manual task to the demo
  fs.writeFileSync(path.join(demoDir, '.runr', 'tasks', '03-manual-review.md'), `---
type: manual
---

# Manual Code Review

## Goal
Review the changes made by previous tasks before shipping.

## Steps
1. [ ] Run \`git log --oneline -5\` to see recent commits
2. [ ] Run \`git diff main\` to review all changes
3. [ ] Verify the code follows project conventions
4. [ ] Check for any security concerns

## When Complete
After reviewing the changes:

\`\`\`bash
runr tasks mark-complete 03-manual-review.md
\`\`\`

## Note
This is a **manual task**. Runr will show you these instructions
and exit without spawning a worker. Manual tasks are for steps
that require human judgment or action.
`);

  fs.writeFileSync(path.join(demoDir, 'README.md'), `# Runr Demo

Try Runr in 2 minutes.

## Setup

\`\`\`bash
npm install
\`\`\`

---

## Task 1: Success (the happy path)

\`\`\`bash
runr run --task .runr/tasks/00-success.md
\`\`\`

**What happens:** Agent adds a multiply function, tests pass, checkpoint created.

\`\`\`bash
runr report latest   # See the run details
\`\`\`

---

## Task 2: Autofix (the "wow" moment)

This task has a **failing test** (intentional). Watch Runr detect it and offer safe commands.

\`\`\`bash
runr run --task .runr/tasks/01-fix-failing-test.md
\`\`\`

**What happens:** Verification fails (npm test fails). Run stops.

\`\`\`bash
runr                 # Shows STOPPED + 3 next actions
\`\`\`

You'll see safe commands like \`npm test\`. Now auto-fix:

\`\`\`bash
runr continue        # Runs safe commands, then resumes
\`\`\`

\`\`\`bash
runr report latest   # See what was fixed
\`\`\`

---

## Task 3: Guard (safety demo)

This task tries to modify README.md, which is in the denylist.

\`\`\`bash
runr run --task .runr/tasks/02-scope-violation.md
\`\`\`

**What happens:** STOPPED immediately. Scope guard blocks the change.

\`\`\`bash
runr                 # Shows BLOCKED headline + manual recipe
runr report latest   # See the guard violation details
\`\`\`

This is the safety layer working correctly. No \`--force\` can bypass scope.

---

## Task 4: Manual Task (human-in-the-loop)

Some tasks require human judgment. Runr supports **manual tasks** that print instructions and exit cleanly.

\`\`\`bash
runr run --task .runr/tasks/03-manual-review.md
\`\`\`

**What happens:** Runr prints the task instructions and exits (no worker spawned).

When you're done with manual steps:

\`\`\`bash
runr tasks mark-complete 03-manual-review.md
\`\`\`

---

## Bonus: Task Dashboard

See all tasks and their status:

\`\`\`bash
runr tasks
\`\`\`

---

## The Point

Runr stops with receipts and 3 actions you can trust:

1. **continue** — run safe commands, then resume
2. **report** — inspect the run: diffs, logs, timeline
3. **intervene** — record manual fixes for provenance

Every stop has a headline. Every headline maps to a fix.
`);

  fs.writeFileSync(path.join(demoDir, '.gitignore'), 'node_modules/\ndist/\n.runr/runs/\n.runr/task-status.json\n');

  // Initialize git repo - runr requires a git repository
  const { execSync } = await import('node:child_process');
  execSync('git init', { cwd: demoDir, stdio: 'pipe' });
  execSync('git config user.email "demo@runr.dev"', { cwd: demoDir, stdio: 'pipe' });
  execSync('git config user.name "Runr Demo"', { cwd: demoDir, stdio: 'pipe' });
  execSync('git add .', { cwd: demoDir, stdio: 'pipe' });
  execSync('git commit -m "Initial demo setup"', { cwd: demoDir, stdio: 'pipe' });
}

/**
 * Initialize Runr configuration for a repository
 */
export async function initCommand(options: InitOptions): Promise<void> {
  // Handle --demo flag
  if (options.demo) {
    const demoDir = path.resolve(options.demoDir || 'runr-demo');
    if (fs.existsSync(demoDir)) {
      if (!options.force) {
        console.error(`Error: ${demoDir} already exists. Use --force to overwrite.`);
        process.exit(1);
      }
      fs.rmSync(demoDir, { recursive: true, force: true });
    }
    console.log('Creating demo project...\n');
    await generateDemoProject(demoDir);
    console.log(`✅ Demo created at ${demoDir}\n`);
    console.log('Next steps:');
    console.log(`  cd ${path.basename(demoDir)}`);
    console.log('  npm install');
    console.log('  runr run --task .runr/tasks/00-success.md');
    console.log('');
    console.log('See README.md in the demo for the full walkthrough.');
    return;
  }

  const repoPath = path.resolve(options.repo);
  const runrDir = path.join(repoPath, '.runr');
  const configPath = path.join(runrDir, 'runr.config.json');

  // Handle --interactive flag
  if (options.interactive) {
    console.log('🚧 Interactive setup is planned for a future release');
    console.log('');
    console.log('For now, use `runr init` without --interactive to generate config automatically,');
    console.log('then edit .runr/runr.config.json to customize verification commands.');
    process.exit(0);
  }

  // Check if config already exists
  if (fs.existsSync(configPath) && !options.force && !options.dryRun) {
    console.error('Error: .runr/runr.config.json already exists');
    console.error('Use --force to overwrite');
    process.exit(1);
  }

  // Load pack if specified
  let pack = null;
  if (options.pack) {
    pack = loadPackByName(options.pack);
    if (!pack) {
      console.error(`Error: Pack "${options.pack}" not found`);
      console.error('Run "runr tools packs" to see available packs');
      process.exit(1);
    }
    if (!pack.validation.valid) {
      console.error(`Error: Pack "${options.pack}" is invalid:`);
      for (const error of pack.validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  }

  // Detect verification commands - try Python first, then package.json, then default
  const detection = detectPythonVerification(repoPath) ||
                    detectFromPackageJson(repoPath) ||
                    generateDefaultConfig(repoPath);

  // Determine workflow profile (pack defaults override --workflow flag)
  let workflowProfile = options.workflow;
  if (pack?.manifest.defaults?.profile) {
    workflowProfile = pack.manifest.defaults.profile;
  }

  // Build config
  const config = buildConfig(repoPath, detection, workflowProfile);

  // Apply pack defaults to config if pack is loaded
  if (pack?.manifest.defaults) {
    const packDefaults = pack.manifest.defaults;

    // Ensure workflow config exists
    if (!config.workflow) {
      config.workflow = {
        profile: packDefaults.profile || 'solo',
        mode: packDefaults.mode || 'flow',
        integration_branch: packDefaults.integration_branch || 'main',
        submit_strategy: 'cherry-pick',
        require_clean_tree: packDefaults.require_clean_tree ?? true,
        require_verification: packDefaults.require_verification ?? true
      };
    } else {
      // Apply pack defaults to existing workflow config
      if (packDefaults.profile) config.workflow.profile = packDefaults.profile;
      if (packDefaults.integration_branch) config.workflow.integration_branch = packDefaults.integration_branch;
      if (packDefaults.submit_strategy) config.workflow.submit_strategy = packDefaults.submit_strategy;
      if (packDefaults.require_clean_tree !== undefined) config.workflow.require_clean_tree = packDefaults.require_clean_tree;
      if (packDefaults.require_verification !== undefined) config.workflow.require_verification = packDefaults.require_verification;
    }
  }

  // If --print mode, just output and exit
  if (options.print) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Handle --dry-run mode (pack actions only)
  if (options.dryRun && pack) {
    console.log('[DRY RUN] Pack-based initialization plan:\n');
    console.log(`Pack: ${pack.manifest.display_name}`);
    console.log(`Description: ${pack.manifest.description}\n`);
    console.log('Config changes:');
    console.log(`  - Workflow profile: ${config.workflow?.profile || 'none'}`);
    console.log(`  - Integration branch: ${config.workflow?.integration_branch || 'none'}`);
    console.log(`  - Require verification: ${config.workflow?.require_verification}`);
    console.log(`  - Require clean tree: ${config.workflow?.require_clean_tree}\n`);

    if (pack.manifest.init_actions && pack.manifest.init_actions.length > 0) {
      console.log('Init actions:');
      const templateContext: TemplateContext = {
        project_name: options.about || path.basename(repoPath),
        project_about: options.about || `Project: ${path.basename(repoPath)}`,
        verification_commands: formatVerificationCommands(config.verification),
        integration_branch: config.workflow?.integration_branch || 'main',
        release_branch: pack.manifest.defaults?.release_branch || 'main',
        pack_name: pack.manifest.name
      };

      const actionContext: ActionContext = {
        repoPath,
        packDir: pack.packDir,
        templates: pack.manifest.templates || {},
        templateContext,
        flags: {
          with_claude: options.withClaude || false
        },
        dryRun: true
      };

      const results = await executeActions(pack.manifest.init_actions, actionContext);
      for (const result of results) {
        console.log(`  ${result.message}`);
      }
    }
    return;
  }

  // Create .runr directory
  if (!options.dryRun) {
    fs.mkdirSync(runrDir, { recursive: true });
  }

  // Execute pack actions if pack is loaded
  if (pack?.manifest.init_actions) {
    const templateContext: TemplateContext = {
      project_name: options.about || path.basename(repoPath),
      project_about: options.about || `Project: ${path.basename(repoPath)}`,
      verification_commands: formatVerificationCommands(config.verification),
      integration_branch: config.workflow?.integration_branch || 'main',
      release_branch: pack.manifest.defaults?.release_branch || 'main',
      pack_name: pack.manifest.name
    };

    const actionContext: ActionContext = {
      repoPath,
      packDir: pack.packDir,
      templates: pack.manifest.templates || {},
      templateContext,
      flags: {
        with_claude: options.withClaude || false
      },
      dryRun: false
    };

    const results = await executeActions(pack.manifest.init_actions, actionContext);
    for (const result of results) {
      if (result.error) {
        console.log(`❌ ${result.message}: ${result.error}`);
      } else if (result.executed) {
        console.log(`✅ ${result.message}`);
      } else {
        console.log(`✓ ${result.message}`);
      }
    }
  } else {
    // Legacy path: ensure .runr/ and task-status.json are gitignored if no pack actions
    const added = await ensureGitignoreEntry(repoPath, '.runr/');
    if (added) {
      console.log('✅ Added .runr/ to .gitignore');
    } else {
      console.log('✓ .runr/ already in .gitignore');
    }
    // Also ensure task-status.json is gitignored
    await ensureGitignoreEntry(repoPath, '.runr/task-status.json');
    console.log('');
    console.log('💡 Tip: runr init --pack solo --dry-run to preview workflow scaffolding');
    console.log('');
  }

  // Write config
  if (!options.dryRun) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  // Create example tasks (only if no pack is loaded)
  if (!pack && !options.dryRun) {
    createExampleTasks(runrDir);
  }

  // Report results
  console.log('✅ Runr initialized successfully!\n');
  console.log(`Config written to: ${configPath}`);
  console.log(`Example tasks created in: ${path.join(runrDir, 'tasks')}/\n`);

  // Report workflow config if set
  if (options.workflow && config.workflow) {
    console.log('Workflow configuration:');
    console.log(`  profile: ${config.workflow.profile}`);
    console.log(`  integration_branch: ${config.workflow.integration_branch}`);
    console.log(`  require_verification: ${config.workflow.require_verification}`);
    console.log(`  require_clean_tree: ${config.workflow.require_clean_tree}`);
    console.log('');
  }

  if (detection.source === 'package.json') {
    console.log('Detected from package.json:');
    if (detection.verification.tier0.length > 0) {
      console.log(`  tier0 (fast): ${detection.verification.tier0.join(', ')}`);
    }
    if (detection.verification.tier1.length > 0) {
      console.log(`  tier1 (build): ${detection.verification.tier1.join(', ')}`);
    }
    if (detection.verification.tier2.length > 0) {
      console.log(`  tier2 (tests): ${detection.verification.tier2.join(', ')}`);
    }
    if (detection.presets.length > 0) {
      console.log(`  presets: ${detection.presets.join(', ')}`);
    }
    console.log('');
  } else if (detection.source === 'python') {
    console.log('Detected Python project:');
    if (detection.verification.tier0.length > 0) {
      console.log(`  tier0 (fast): ${detection.verification.tier0.join(', ')}`);
    }
    if (detection.verification.tier1.length > 0) {
      console.log(`  tier1 (build): ${detection.verification.tier1.join(', ')}`);
    }
    if (detection.verification.tier2.length > 0) {
      console.log(`  tier2 (tests): ${detection.verification.tier2.join(', ')}`);
    }
    if (detection.presets.length > 0) {
      console.log(`  presets: ${detection.presets.join(', ')}`);
    }
    console.log('');
  } else {
    // No verification detected - provide detailed guidance
    console.log('⚠️  No verification commands detected\n');

    // Explain why based on the reason
    const reason = (detection as any).reason;
    if (reason === 'no-package-json') {
      console.log('No package.json found in this repository.');
      console.log('For JavaScript/TypeScript projects, add a package.json with npm scripts.');
    } else if (reason === 'empty-scripts') {
      console.log('Found package.json but it has no scripts defined.');
      console.log('Add verification scripts like "test", "build", "lint", or "typecheck".');
    } else if (reason === 'no-matching-scripts') {
      console.log('Found package.json with scripts, but none match common verification patterns.');
      console.log('Expected scripts: test, build, lint, typecheck, tsc, eslint, jest, vitest.');
    } else if (reason === 'invalid-package-json') {
      console.log('Found package.json but could not parse it (invalid JSON).');
    }

    console.log('');
    console.log('📝 Next steps:');
    console.log('');
    console.log('Option 1: Manual configuration');
    console.log(`  • Edit: ${configPath}`);
    console.log('  • Add verification commands to tier0/tier1/tier2 arrays');
    console.log('  • Example tier0: ["npm run lint", "npm run typecheck"]');
    console.log('  • Example tier1: ["npm run build"]');
    console.log('  • Example tier2: ["npm run test"]');
    console.log('');
    console.log('Option 2: Interactive setup');
    console.log('  • Run: runr init --interactive --force');
    console.log('  • Follow prompts to configure verification');
    console.log('');
  }

  if (detection.source !== 'none') {
    console.log('Next steps:');
    console.log('  1. Review/edit .runr/runr.config.json');
    console.log('  2. Create a task file in .runr/tasks/');
    console.log('  3. Run: runr run --task .runr/tasks/your-task.md --worktree');
  } else {
    console.log('After configuring verification:');
    console.log('  1. Create a task file in .runr/tasks/');
    console.log('  2. Run: runr run --task .runr/tasks/your-task.md --worktree');
  }
}
