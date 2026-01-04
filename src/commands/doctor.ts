import { execa } from 'execa';
import path from 'node:path';
import { WorkerConfig, AgentConfig } from '../config/schema.js';

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
 * Run diagnostic checks on the repository
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const repoPath = path.resolve(options.repo || '.');

  console.log('Runr Doctor');
  console.log('===========\n');

  let hasErrors = false;

  // Check 1: Git repository
  const gitCheck = await checkGitRepository(repoPath);
  if (gitCheck.ok) {
    console.log('Git repository: OK');
  } else {
    console.log(`Git repository: FAIL - ${gitCheck.error}`);
    hasErrors = true;
  }

  // Exit with appropriate code
  if (hasErrors) {
    console.log('\nResult: Some checks failed');
    process.exitCode = 1;
  } else {
    console.log('\nResult: All checks passed');
    process.exitCode = 0;
  }
}
