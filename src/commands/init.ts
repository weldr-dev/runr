import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig } from '../config/schema.js';

export interface InitOptions {
  repo: string;
  interactive?: boolean;
  print?: boolean;
  force?: boolean;
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
function buildConfig(repoPath: string, detection: DetectionResult): AgentConfig {
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

  return {
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
    }
  };
}

/**
 * Create example task files
 */
function createExampleTasks(runrDir: string): void {
  const tasksDir = path.join(runrDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });

  const exampleBugfix = `# Fix Bug: [Description]

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

  const exampleFeature = `# Add Feature: [Description]

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

  const exampleDocs = `# Update Documentation

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

  fs.writeFileSync(path.join(tasksDir, 'example-bugfix.md'), exampleBugfix);
  fs.writeFileSync(path.join(tasksDir, 'example-feature.md'), exampleFeature);
  fs.writeFileSync(path.join(tasksDir, 'example-docs.md'), exampleDocs);
}

/**
 * Initialize Runr configuration for a repository
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const runrDir = path.join(repoPath, '.runr');
  const configPath = path.join(runrDir, 'runr.config.json');

  // Check if config already exists
  if (fs.existsSync(configPath) && !options.force) {
    console.error('Error: .runr/runr.config.json already exists');
    console.error('Use --force to overwrite');
    process.exit(1);
  }

  // Detect verification commands - try Python first, then package.json, then default
  const detection = detectPythonVerification(repoPath) ||
                    detectFromPackageJson(repoPath) ||
                    generateDefaultConfig(repoPath);

  // Build config
  const config = buildConfig(repoPath, detection);

  // If --print mode, just output and exit
  if (options.print) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Create .runr directory
  fs.mkdirSync(runrDir, { recursive: true });

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  // Create example tasks
  createExampleTasks(runrDir);

  // Report results
  console.log('✅ Runr initialized successfully!\n');
  console.log(`Config written to: ${configPath}`);
  console.log(`Example tasks created in: ${path.join(runrDir, 'tasks')}/\n`);

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
