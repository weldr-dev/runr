import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs';
import { WorkerConfig, AgentConfig } from '../config/schema.js';
import { resolveConfigPath, loadConfig } from '../config/load.js';
import { getRunrPaths } from '../store/runs-root.js';

export interface DoctorOptions {
  repo?: string;
  config?: string;
}

// ==========================================
// Worker health checks (used by run command)
// ==========================================

export interface WorkerCheck {
  name: string;
  bin: string;
  version: string | null;
  headless: boolean;
  error: string | null;
}

async function checkWorker(
  name: string,
  worker: WorkerConfig,
  repoPath: string
): Promise<WorkerCheck> {
  const result: WorkerCheck = {
    name,
    bin: worker.bin,
    version: null,
    headless: false,
    error: null
  };

  // Check version
  try {
    const versionResult = await execa(worker.bin, ['--version'], {
      timeout: 5000,
      reject: false
    });
    if (versionResult.exitCode === 0) {
      result.version = versionResult.stdout.trim().split('\n')[0];
    } else {
      result.error = `Version check failed: ${versionResult.stderr || 'unknown error'}`;
      return result;
    }
  } catch (err) {
    result.error = `Command not found: ${worker.bin}`;
    return result;
  }

  // Check headless mode with a simple ping
  try {
    const testPrompt = 'Respond with exactly: PING_OK';
    let testArgs: string[];

    if (name === 'codex') {
      testArgs = ['exec', '--full-auto', '--json', '-C', repoPath];
    } else {
      testArgs = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
    }

    const headlessResult = await execa(worker.bin, testArgs, {
      input: testPrompt,
      timeout: 30000,
      reject: false,
      cwd: repoPath
    });

    if (headlessResult.exitCode === 0) {
      result.headless = true;
    } else {
      const stderr = headlessResult.stderr || '';
      if (stderr.includes('stdin is not a terminal')) {
        result.error = 'Headless mode not supported (stdin is not a terminal)';
      } else {
        result.error = `Headless test failed: ${stderr.slice(0, 100)}`;
      }
    }
  } catch (err) {
    result.error = `Headless test error: ${(err as Error).message}`;
  }

  return result;
}

/**
 * Run worker health checks (used by run command)
 */
export async function runDoctorChecks(config: AgentConfig, repoPath: string): Promise<WorkerCheck[]> {
  const checks: WorkerCheck[] = [];
  for (const [name, workerConfig] of Object.entries(config.workers)) {
    const check = await checkWorker(name, workerConfig as WorkerConfig, repoPath);
    checks.push(check);
  }
  return checks;
}

// ==========================================
// Repository diagnostics (user-facing command)
// ==========================================

/**
 * Check if the given path is inside a git repository
 */
async function checkGitRepository(repoPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await execa('git', ['rev-parse', '--git-dir'], {
      cwd: repoPath,
      reject: false
    });

    if (result.exitCode === 0) {
      return { ok: true };
    } else {
      return { ok: false, error: 'not a git repository' };
    }
  } catch (err) {
    return { ok: false, error: `Git check failed: ${(err as Error).message}` };
  }
}

/**
 * Check working tree status
 */
async function checkWorkingTree(repoPath: string): Promise<{
  ok: boolean;
  clean: boolean;
  uncommittedCount?: number;
  ignoredCount?: number;
  error?: string;
}> {
  try {
    // Check for uncommitted changes
    const statusResult = await execa('git', ['status', '--porcelain'], {
      cwd: repoPath,
      reject: false
    });

    if (statusResult.exitCode !== 0) {
      return { ok: false, clean: false, error: 'git status failed' };
    }

    const uncommittedLines = statusResult.stdout.trim().split('\n').filter(line => line.length > 0);
    const uncommittedCount = uncommittedLines.length;
    const isClean = uncommittedCount === 0;

    // Check for ignored noise
    const ignoredResult = await execa(
      'git',
      ['status', '--porcelain', '--ignored', '--', '.runr/', '.agent/', '.runr-worktrees/', '.agent-worktrees/'],
      { cwd: repoPath, reject: false }
    );

    const ignoredLines = ignoredResult.exitCode === 0
      ? ignoredResult.stdout.trim().split('\n').filter(line => line.startsWith('!!')).length
      : 0;

    return {
      ok: true,
      clean: isClean,
      uncommittedCount,
      ignoredCount: ignoredLines
    };
  } catch (err) {
    return { ok: false, clean: false, error: `Working tree check failed: ${(err as Error).message}` };
  }
}

/**
 * Check if .runr/ is properly gitignored
 * Uses git check-ignore if available, falls back to .gitignore parsing
 */
async function checkGitignore(repoPath: string): Promise<{
  ok: boolean;
  message: string;
}> {
  // Preferred method: use git check-ignore
  try {
    const result = await execa('git', ['check-ignore', '-q', '.runr/'], {
      cwd: repoPath,
      reject: false
    });

    // Exit code 0 means the path is ignored
    if (result.exitCode === 0) {
      return { ok: true, message: '.runr/ is gitignored ✓' };
    }

    // Exit code 1 means the path is not ignored
    if (result.exitCode === 1) {
      return {
        ok: false,
        message: '.runr/ is NOT gitignored - will cause dirty tree warnings\n' +
                 '  Add ".runr/" to .gitignore or run "runr init" to update'
      };
    }
  } catch {
    // Git not available or other error, fall back to .gitignore parsing
  }

  // Fallback method: parse .gitignore file
  const gitignorePath = path.join(repoPath, '.gitignore');
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());
    const hasEntry = lines.some(line =>
      line === '.runr/' ||
      line === '.runr' ||
      line.startsWith('.runr/')
    );

    if (hasEntry) {
      return { ok: true, message: '.runr/ is gitignored ✓' };
    } else {
      return {
        ok: false,
        message: '.runr/ is NOT gitignored - will cause dirty tree warnings\n' +
                 '  Add ".runr/" to .gitignore or run "runr init" to update'
      };
    }
  } catch {
    return {
      ok: false,
      message: 'No .gitignore found - create one with ".runr/" entry'
    };
  }
}

/**
 * Get version from package.json
 */
function getRunrVersion(): string {
  try {
    // Navigate up from dist/commands/doctor.js to find package.json
    const packagePath = path.resolve(new URL(import.meta.url).pathname, '../../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check for config file and validate if present
 */
function checkConfig(repoPath: string, configPath?: string): {
  ok: boolean;
  found: boolean;
  path?: string;
  valid?: boolean;
  error?: string;
} {
  try {
    const resolvedPath = resolveConfigPath(repoPath, configPath);

    if (!fs.existsSync(resolvedPath)) {
      return { ok: true, found: false };
    }

    // Try to load and validate config
    try {
      loadConfig(resolvedPath);
      return { ok: true, found: true, path: resolvedPath, valid: true };
    } catch (err) {
      return {
        ok: false,
        found: true,
        path: resolvedPath,
        valid: false,
        error: `Invalid config: ${(err as Error).message}`
      };
    }
  } catch (err) {
    return { ok: false, found: false, error: `Config check failed: ${(err as Error).message}` };
  }
}

/**
 * Check .runr/ directory write access
 */
async function checkRunrDirectory(repoPath: string): Promise<{
  ok: boolean;
  exists: boolean;
  writable?: boolean;
  runCount?: number;
  error?: string;
}> {
  try {
    const paths = getRunrPaths(repoPath);
    const runrRoot = paths.runr_root;

    if (!fs.existsSync(runrRoot)) {
      return { ok: true, exists: false };
    }

    // Test write access
    const testFile = path.join(runrRoot, '.doctor-test-write');
    try {
      fs.writeFileSync(testFile, 'test', 'utf-8');
      fs.unlinkSync(testFile);
    } catch (err) {
      return {
        ok: false,
        exists: true,
        writable: false,
        error: `Not writable: ${(err as Error).message}`
      };
    }

    // Count runs if runs directory exists
    let runCount = 0;
    if (fs.existsSync(paths.runs_dir)) {
      try {
        const entries = fs.readdirSync(paths.runs_dir);
        runCount = entries.filter(entry => {
          const fullPath = path.join(paths.runs_dir, entry);
          return fs.statSync(fullPath).isDirectory();
        }).length;
      } catch {
        // Ignore error counting runs
      }
    }

    return { ok: true, exists: true, writable: true, runCount };
  } catch (err) {
    return { ok: false, exists: false, error: `Directory check failed: ${(err as Error).message}` };
  }
}

/**
 * Check if AGENTS.md exists (for meta-agent workflows)
 */
function checkAgentsMd(repoPath: string): {
  exists: boolean;
  path?: string;
} {
  const agentsMdPath = path.join(repoPath, 'AGENTS.md');
  return {
    exists: fs.existsSync(agentsMdPath),
    path: agentsMdPath
  };
}

/**
 * Check Claude Code integration status
 */
function checkClaudeIntegration(repoPath: string): {
  claudeDetected: boolean;
  skillsPresent: boolean;
  commandsPresent: boolean;
  missingFiles?: string[];
} {
  const claudeDir = path.join(repoPath, '.claude');
  const skillPath = path.join(repoPath, '.claude/skills/runr-workflow/SKILL.md');
  const commandPaths = [
    path.join(repoPath, '.claude/commands/runr-bundle.md'),
    path.join(repoPath, '.claude/commands/runr-submit.md'),
    path.join(repoPath, '.claude/commands/runr-resume.md')
  ];

  const claudeDetected = fs.existsSync(claudeDir);
  const skillsPresent = fs.existsSync(skillPath);
  const commandsPresent = commandPaths.every(p => fs.existsSync(p));

  const missingFiles: string[] = [];
  if (claudeDetected) {
    if (!skillsPresent) missingFiles.push('.claude/skills/runr-workflow/SKILL.md');
    commandPaths.forEach(p => {
      if (!fs.existsSync(p)) {
        missingFiles.push(path.relative(repoPath, p));
      }
    });
  }

  return {
    claudeDetected,
    skillsPresent,
    commandsPresent,
    missingFiles: missingFiles.length > 0 ? missingFiles : undefined
  };
}

/**
 * Check worktree sanity
 */
async function checkWorktrees(repoPath: string): Promise<{
  ok: boolean;
  worktreesUsed: boolean;
  totalWorktrees?: number;
  orphanedWorktrees?: number;
  error?: string;
}> {
  try {
    const paths = getRunrPaths(repoPath);
    const worktreesDir = paths.worktrees_dir;

    if (!fs.existsSync(worktreesDir)) {
      return { ok: true, worktreesUsed: false };
    }

    // List all worktree directories
    const entries = fs.readdirSync(worktreesDir);
    const worktreeDirs = entries.filter(entry => {
      const fullPath = path.join(worktreesDir, entry);
      return fs.statSync(fullPath).isDirectory();
    });

    if (worktreeDirs.length === 0) {
      return { ok: true, worktreesUsed: false };
    }

    // Check which worktrees are still valid git worktrees
    let orphanedCount = 0;
    for (const dir of worktreeDirs) {
      const worktreePath = path.join(worktreesDir, dir);

      // Check if it's a valid git worktree
      // A worktree must have .git file (not directory) pointing to parent repo
      const gitPath = path.join(worktreePath, '.git');
      const isValidWorktree = fs.existsSync(gitPath) && fs.statSync(gitPath).isFile();

      if (!isValidWorktree) {
        orphanedCount++;
        continue;
      }

      // Double-check with git command
      try {
        const result = await execa('git', ['rev-parse', '--git-dir'], {
          cwd: worktreePath,
          reject: false
        });
        if (result.exitCode !== 0) {
          orphanedCount++;
        }
      } catch {
        orphanedCount++;
      }
    }

    return {
      ok: orphanedCount === 0,
      worktreesUsed: true,
      totalWorktrees: worktreeDirs.length,
      orphanedWorktrees: orphanedCount
    };
  } catch (err) {
    return { ok: false, worktreesUsed: false, error: `Worktree check failed: ${(err as Error).message}` };
  }
}

/**
 * Run diagnostic checks on the repository
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const repoPath = path.resolve(options.repo || '.');

  console.log('Runr Doctor');
  console.log('===========\n');

  let hasErrors = false;

  // Check 1: Runr version
  const version = getRunrVersion();
  console.log(`Runr version: ${version}`);

  // Check 2: Git repository
  const gitCheck = await checkGitRepository(repoPath);
  if (gitCheck.ok) {
    console.log('Git repository: OK');
  } else {
    console.log(`Git repository: FAIL - ${gitCheck.error}`);
    hasErrors = true;
  }

  // Check 3: Working tree status
  const treeCheck = await checkWorkingTree(repoPath);
  if (treeCheck.ok) {
    if (treeCheck.clean) {
      console.log('Working tree: clean');
    } else {
      console.log(`Working tree: dirty (${treeCheck.uncommittedCount} uncommitted files)`);
      if (treeCheck.ignoredCount && treeCheck.ignoredCount > 0) {
        console.log(`  Ignored noise: ${treeCheck.ignoredCount} files in .runr/`);
      }
      console.log('\n⚠️  Meta-Agent Safety Warning:');
      console.log('   Never run agents on uncommitted work - you risk data loss.');
      console.log('   Commit or stash before using `runr meta` or `runr run`.');
    }
  } else {
    console.log(`Working tree: FAIL - ${treeCheck.error}`);
    hasErrors = true;
  }

  // Check 4: .gitignore
  const gitignoreCheck = await checkGitignore(repoPath);
  if (gitignoreCheck.ok) {
    console.log(gitignoreCheck.message);
  } else {
    console.log(`⚠ ${gitignoreCheck.message}`);
  }

  // Check 5: Config file
  const configCheck = checkConfig(repoPath, options.config);
  if (configCheck.found) {
    if (configCheck.valid) {
      console.log(`Config: ${configCheck.path}`);
    } else {
      console.log(`Config: FAIL - ${configCheck.error}`);
      hasErrors = true;
    }
  } else {
    console.log('Config: no config file (using defaults)');
  }

  // Check 6: .runr/ directory
  const dirCheck = await checkRunrDirectory(repoPath);
  if (dirCheck.exists) {
    if (dirCheck.writable) {
      const runInfo = dirCheck.runCount !== undefined ? ` (${dirCheck.runCount} runs)` : '';
      console.log(`.runr/ directory: OK${runInfo}`);
    } else {
      console.log(`.runr/ directory: FAIL - ${dirCheck.error}`);
      hasErrors = true;
    }
  } else {
    console.log('.runr/ directory: not yet created');
  }

  // Check 7: Worktrees
  const worktreeCheck = await checkWorktrees(repoPath);
  if (worktreeCheck.worktreesUsed) {
    if (worktreeCheck.ok) {
      console.log(`Worktrees: OK (${worktreeCheck.totalWorktrees} worktrees)`);
    } else {
      console.log(`Worktrees: WARNING - ${worktreeCheck.orphanedWorktrees} orphaned worktrees`);
      console.log('  Run "runr gc" to clean up orphaned worktrees');
      // Note: This is a warning, not an error - don't set hasErrors
    }
  } else {
    console.log('Worktrees: not used');
  }

  // Check 8: AGENTS.md (for meta-agent workflows)
  const agentsCheck = checkAgentsMd(repoPath);
  if (agentsCheck.exists) {
    console.log('AGENTS.md: present ✓');
  } else {
    console.log('⚠️  AGENTS.md: missing');
    console.log('   Run "runr init --pack solo" to create workflow documentation');
  }

  // Check 9: Claude Code integration (if .claude/ exists)
  const claudeCheck = checkClaudeIntegration(repoPath);
  if (claudeCheck.claudeDetected) {
    if (claudeCheck.skillsPresent && claudeCheck.commandsPresent) {
      console.log('Claude Code integration: complete ✓');
    } else {
      console.log('Claude Code integration: incomplete');
      if (claudeCheck.missingFiles) {
        console.log('  Missing:');
        claudeCheck.missingFiles.forEach(file => console.log(`    - ${file}`));
        console.log('  Run "runr init --pack solo --with-claude" to complete setup');
      }
    }
  } else {
    console.log('Claude Code integration: not configured');
    console.log('  (optional) Run "runr init --pack solo --with-claude" to add Claude Code support');
  }

  // Exit with appropriate code
  console.log();
  if (hasErrors) {
    console.log('Result: Some checks failed');
    process.exitCode = 1;
  } else {
    console.log('Result: All checks passed');
    process.exitCode = 0;
  }
}
