import { execa } from 'execa';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { WorkerConfig, AgentConfig } from '../config/schema.js';

export interface DoctorOptions {
  config?: string;
  repo?: string;
}

export interface WorkerCheck {
  name: string;
  bin: string;
  version: string | null;
  headless: boolean;
  error: string | null;
}

export interface DoctorResult {
  configPath: string;
  repoPath: string;
  checks: WorkerCheck[];
  allPassed: boolean;
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

export async function runDoctorChecks(config: AgentConfig, repoPath: string): Promise<WorkerCheck[]> {
  const checks: WorkerCheck[] = [];
  for (const [name, workerConfig] of Object.entries(config.workers)) {
    const check = await checkWorker(name, workerConfig as WorkerConfig, repoPath);
    checks.push(check);
  }
  return checks;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const repoPath = path.resolve(options.repo || '.');
  const configPath = resolveConfigPath(repoPath, options.config);

  console.log('Doctor Check');
  console.log('============\n');

  let config;
  try {
    config = loadConfig(configPath);
    console.log(`Config: ${configPath}`);
    console.log(`Repo: ${repoPath}\n`);
  } catch (err) {
    console.log(`Config: FAIL - ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const checks = await runDoctorChecks(config, repoPath);

  console.log('Workers\n-------');

  for (const check of checks) {

    const status = check.error ? 'FAIL' : 'PASS';
    const version = check.version || 'unknown';
    const headless = check.headless ? 'headless OK' : 'headless FAIL';

    console.log(`${check.name}: ${status}`);
    console.log(`  bin: ${check.bin}`);
    console.log(`  version: ${version}`);
    console.log(`  ${headless}`);
    if (check.error) {
      console.log(`  error: ${check.error}`);
    }
    console.log('');
  }

  // Show phase configuration
  console.log('Phases\n------');
  console.log(`  plan: ${config.phases.plan}`);
  console.log(`  implement: ${config.phases.implement}`);
  console.log(`  review: ${config.phases.review}`);
  console.log('');

  // Check that configured phase workers are available
  const phaseWorkers = new Set([config.phases.plan, config.phases.implement, config.phases.review]);
  const failedWorkers = checks.filter((c) => c.error).map((c) => c.name);
  const usedButFailed = [...phaseWorkers].filter((w) => failedWorkers.includes(w));

  const failed = checks.filter((c) => c.error);
  if (failed.length > 0) {
    console.log(`\nResult: ${failed.length} worker(s) failed`);
    if (usedButFailed.length > 0) {
      console.log(`Warning: Phase(s) configured to use failed worker(s): ${usedButFailed.join(', ')}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nResult: All workers OK');
  }
}
