#!/usr/bin/env npx tsx
/**
 * Golden Scenarios test runner.
 *
 * Usage:
 *   npx tsx test/golden/harness/run-golden.ts --all
 *   npx tsx test/golden/harness/run-golden.ts --scenario 01-happy-path
 *   npx tsx test/golden/harness/run-golden.ts --scenario 01-happy-path --keep-tmp --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SCENARIOS_DIR, getScenarioPaths } from './paths.js';
import { createTestRepo, cleanupTestRepo, getLatestOrchestrationId, readOrchestrationState } from './repo.js';
import { runAgent, spawnAgent, killProcess, waitForState } from './proc.js';
import { loadExpectations, runAssertions, AssertionResult } from './assert.js';

interface ScenarioResult {
  id: string;
  passed: boolean;
  exitCode: number;
  duration: number;
  errors: string[];
}

interface ScenarioHooks {
  kill_after_state?: {
    predicate: 'active_runs_non_empty' | 'status_running';
  };
}

/**
 * Run a single scenario.
 */
async function runScenario(
  scenarioId: string,
  options: { keepTmp: boolean; verbose: boolean }
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioPaths = getScenarioPaths(scenarioId);
  let repoPath: string | null = null;

  try {
    // Validate scenario exists
    if (!fs.existsSync(scenarioPaths.tracks)) {
      throw new Error(`Scenario tracks.yaml not found: ${scenarioPaths.tracks}`);
    }

    // Create test repo
    if (options.verbose) console.log(`  Creating test repo...`);
    repoPath = await createTestRepo(scenarioId);
    if (options.verbose) console.log(`  Repo: ${repoPath}`);

    // Load hooks if present
    const hooks: ScenarioHooks = fs.existsSync(scenarioPaths.hooks)
      ? JSON.parse(fs.readFileSync(scenarioPaths.hooks, 'utf-8'))
      : {};

    let finalExitCode = 0;

    // Special handling for crash-resume scenario
    if (hooks.kill_after_state) {
      finalExitCode = await runCrashResumeScenario(repoPath, hooks, options);
    } else {
      // Standard scenario: run orchestrate and wait
      finalExitCode = await runStandardScenario(repoPath, options);
    }

    // Load expectations and run assertions
    const expectations = loadExpectations(scenarioPaths.expect);
    expectations.exit_code = expectations.exit_code ?? 0; // Default to expecting success

    const assertionResult = runAssertions(expectations, repoPath, finalExitCode);

    const duration = Date.now() - startTime;

    return {
      id: scenarioId,
      passed: assertionResult.passed,
      exitCode: finalExitCode,
      duration,
      errors: assertionResult.errors.map(e => e.message)
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    return {
      id: scenarioId,
      passed: false,
      exitCode: 1,
      duration,
      errors: [err instanceof Error ? err.message : String(err)]
    };
  } finally {
    if (repoPath && !options.keepTmp) {
      cleanupTestRepo(repoPath);
    } else if (repoPath && options.keepTmp) {
      console.log(`  Kept temp repo: ${repoPath}`);
    }
  }
}

/**
 * Run a standard (non-crash) scenario.
 */
async function runStandardScenario(
  repoPath: string,
  options: { verbose: boolean }
): Promise<number> {
  // Run orchestrate with --fast to skip PLAN/REVIEW phases (works with mock workers)
  if (options.verbose) console.log(`  Running orchestrate...`);
  const orchestrateResult = await runAgent(
    ['orchestrate', 'run', '--config', 'tracks.yaml', '--repo', '.', '--time', '5', '--max-ticks', '10', '--fast'],
    repoPath,
    { timeout: 120000 }
  );

  if (options.verbose) {
    console.log(`  Orchestrate exit: ${orchestrateResult.exitCode}`);
    if (orchestrateResult.stderr) {
      console.log(`  Stderr: ${orchestrateResult.stderr.slice(0, 200)}`);
    }
  }

  return orchestrateResult.exitCode;
}

/**
 * Run a crash-resume scenario.
 */
async function runCrashResumeScenario(
  repoPath: string,
  hooks: ScenarioHooks,
  options: { verbose: boolean }
): Promise<number> {
  if (options.verbose) console.log(`  Running crash-resume scenario...`);

  // Spawn orchestrator as background process with --fast
  const proc = spawnAgent(
    ['orchestrate', 'run', '--config', 'tracks.yaml', '--repo', '.', '--time', '5', '--max-ticks', '10', '--fast'],
    repoPath
  );

  // Wait for state predicate
  const predicate = hooks.kill_after_state?.predicate ?? 'active_runs_non_empty';

  if (options.verbose) console.log(`  Waiting for state: ${predicate}`);

  const stateReached = await waitForState(
    () => {
      const orchId = getLatestOrchestrationId(repoPath);
      if (!orchId) return null;
      return readOrchestrationState(repoPath, orchId) as { active_runs?: Record<string, string>; status?: string } | null;
    },
    (state) => {
      if (predicate === 'active_runs_non_empty') {
        return Object.keys(state.active_runs ?? {}).length > 0;
      }
      if (predicate === 'status_running') {
        return state.status === 'running';
      }
      return false;
    },
    30000,
    100
  );

  if (!stateReached) {
    killProcess(proc);
    throw new Error(`State predicate never reached: ${predicate}`);
  }

  if (options.verbose) console.log(`  State reached, killing orchestrator...`);

  // Kill the orchestrator
  killProcess(proc);

  // Wait a moment for cleanup
  await new Promise(r => setTimeout(r, 500));

  // Resume orchestration
  if (options.verbose) console.log(`  Resuming orchestration...`);
  const resumeResult = await runAgent(
    ['orchestrate', 'resume', 'latest', '--repo', '.'],
    repoPath,
    { timeout: 120000 }
  );

  if (options.verbose) {
    console.log(`  Resume exit: ${resumeResult.exitCode}`);
  }

  return resumeResult.exitCode;
}

/**
 * List available scenarios.
 */
function listScenarios(): string[] {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    return [];
  }

  return fs.readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

/**
 * Main entry point.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      scenario: { type: 'string', short: 's' },
      all: { type: 'boolean', short: 'a' },
      'keep-tmp': { type: 'boolean', short: 'k' },
      verbose: { type: 'boolean', short: 'v' },
      list: { type: 'boolean', short: 'l' }
    }
  });

  if (values.list) {
    console.log('Available scenarios:');
    for (const s of listScenarios()) {
      console.log(`  ${s}`);
    }
    return;
  }

  const scenarios = values.all
    ? listScenarios()
    : values.scenario
      ? [values.scenario]
      : [];

  if (scenarios.length === 0) {
    console.error('Usage: run-golden.ts --scenario <id> | --all');
    console.error('       run-golden.ts --list');
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('GOLDEN SCENARIOS');
  console.log('='.repeat(60));
  console.log('');

  const results: ScenarioResult[] = [];

  for (const scenarioId of scenarios) {
    console.log(`Running: ${scenarioId}`);
    const result = await runScenario(scenarioId, {
      keepTmp: values['keep-tmp'] ?? false,
      verbose: values.verbose ?? false
    });
    results.push(result);

    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} (${result.duration}ms, exit ${result.exitCode})`);

    if (!result.passed) {
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
    console.log('');
  }

  // Print summary table
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log('| Scenario                     | Status | Duration | Exit |');
  console.log('|------------------------------|--------|----------|------|');

  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const duration = `${r.duration}ms`.padStart(7);
    console.log(`| ${r.id.padEnd(28)} | ${status.padEnd(6)} | ${duration} | ${String(r.exitCode).padStart(4)} |`);
  }

  console.log('');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
