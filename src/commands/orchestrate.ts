/**
 * agent orchestrate - Run multiple tracks of tasks in parallel with collision-aware scheduling.
 *
 * Usage:
 *   agent orchestrate --config tracks.yaml --repo .
 *
 * The orchestrator:
 * 1. Loads track configuration
 * 2. Launches tracks in parallel (subject to collision policy)
 * 3. Waits for runs to complete
 * 4. Advances tracks to next step
 * 5. Repeats until all tracks complete or fail
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  OrchestrateOptions,
  OrchestratorState,
  CollisionPolicy,
  StepResult
} from '../orchestrator/types.js';
import {
  loadOrchestrationConfig,
  createInitialOrchestratorState,
  makeScheduleDecision,
  startTrackRun,
  completeTrackStep,
  failTrack,
  getOrchestratorSummary
} from '../orchestrator/state-machine.js';
import { getRunsRoot } from '../store/runs-root.js';
import { RunJsonOutput } from './run.js';
import { WaitResult } from './wait.js';

const POLL_INTERVAL_MS = 2000;

/**
 * Run a shell command and capture output.
 */
function runAgentCommand(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['agent', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1
      });
    });

    proc.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1
      });
    });
  });
}

/**
 * Launch a run for a track step.
 */
async function launchRun(
  taskPath: string,
  repoPath: string,
  options: {
    time: number;
    maxTicks: number;
    allowDeps: boolean;
    worktree: boolean;
    fast: boolean;
    forceParallel: boolean;
  }
): Promise<{ runId: string; runDir: string } | { error: string }> {
  const args = [
    'run',
    '--task', taskPath,
    '--repo', repoPath,
    '--time', String(options.time),
    '--max-ticks', String(options.maxTicks),
    '--json'
  ];

  if (options.allowDeps) args.push('--allow-deps');
  if (options.worktree) args.push('--worktree');
  if (options.fast) args.push('--fast');
  if (options.forceParallel) args.push('--force-parallel');

  const result = await runAgentCommand(args, repoPath);

  if (result.exitCode !== 0 && !result.stdout.includes('"run_id"')) {
    return { error: result.stderr || `Exit code ${result.exitCode}` };
  }

  try {
    // Find the JSON line in output
    const lines = result.stdout.split('\n');
    const jsonLine = lines.find((line) => line.startsWith('{'));
    if (!jsonLine) {
      return { error: 'No JSON output from agent run' };
    }

    const output: RunJsonOutput = JSON.parse(jsonLine);
    return {
      runId: output.run_id,
      runDir: output.run_dir
    };
  } catch (err) {
    return { error: `Failed to parse run output: ${err}` };
  }
}

/**
 * Wait for a run to complete.
 */
async function waitForRun(
  runId: string,
  repoPath: string
): Promise<StepResult> {
  const args = [
    'wait',
    runId,
    '--repo', repoPath,
    '--for', 'terminal',
    '--json'
  ];

  const result = await runAgentCommand(args, repoPath);

  try {
    const output: WaitResult = JSON.parse(result.stdout);
    return {
      status: output.status,
      stop_reason: output.stop_reason,
      elapsed_ms: output.elapsed_ms
    };
  } catch {
    return {
      status: 'stopped',
      stop_reason: 'wait_parse_error',
      elapsed_ms: 0
    };
  }
}

/**
 * Save orchestrator state to disk.
 */
function saveState(state: OrchestratorState, repoPath: string): void {
  const orchDir = path.join(getRunsRoot(repoPath), 'orchestrations');
  fs.mkdirSync(orchDir, { recursive: true });

  const statePath = path.join(orchDir, `${state.orchestrator_id}.json`);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Print orchestrator status summary.
 */
function printStatus(state: OrchestratorState): void {
  const summary = getOrchestratorSummary(state);
  const elapsed = Date.now() - new Date(state.started_at).getTime();
  const elapsedMin = Math.round(elapsed / 60000);

  console.log('');
  console.log(`Orchestrator: ${state.orchestrator_id} (${elapsedMin}m elapsed)`);
  console.log(`Status: ${state.status.toUpperCase()}`);
  console.log(`Progress: ${summary.completed_steps}/${summary.total_steps} steps`);
  console.log(`Tracks: ${summary.complete} complete, ${summary.running} running, ${summary.pending} pending, ${summary.stopped} stopped, ${summary.failed} failed`);
  console.log('');

  for (const track of state.tracks) {
    const step = track.steps[track.current_step] ?? track.steps[track.steps.length - 1];
    const stepInfo = step?.run_id ? ` (${step.run_id})` : '';
    const errorInfo = track.error ? ` - ${track.error}` : '';
    console.log(`  ${track.name}: ${track.status}${stepInfo}${errorInfo}`);
  }
  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function orchestrateCommand(options: OrchestrateOptions): Promise<void> {
  const configPath = path.resolve(options.config);
  const repoPath = path.resolve(options.repo);

  // Load and validate config
  let config;
  try {
    config = loadOrchestrationConfig(configPath);
  } catch (err) {
    console.error(`Failed to load orchestration config: ${err}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${config.tracks.length} track(s) from ${configPath}`);

  // Create initial state
  let state = createInitialOrchestratorState(config, repoPath, {
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    collisionPolicy: options.collisionPolicy
  });

  console.log(`Orchestrator ID: ${state.orchestrator_id}`);
  console.log(`Collision policy: ${options.collisionPolicy}`);
  console.log('');

  if (options.dryRun) {
    console.log('Dry run - showing planned execution:');
    for (const track of state.tracks) {
      console.log(`  Track "${track.name}":`);
      for (const step of track.steps) {
        console.log(`    - ${step.task_path}`);
      }
    }
    return;
  }

  saveState(state, repoPath);

  // Track active run promises for concurrent waiting
  const activeWaits = new Map<string, Promise<StepResult>>();

  // Main orchestration loop
  while (state.status === 'running') {
    const decision = makeScheduleDecision(state);

    switch (decision.action) {
      case 'done':
        state.status = state.tracks.every((t) => t.status === 'complete')
          ? 'complete'
          : 'stopped';
        state.ended_at = new Date().toISOString();
        break;

      case 'blocked':
        console.error(`BLOCKED: ${decision.reason}`);
        if (decision.track_id) {
          state = failTrack(state, decision.track_id, decision.reason ?? 'blocked');
        }
        break;

      case 'launch': {
        const trackId = decision.track_id!;
        const track = state.tracks.find((t) => t.id === trackId)!;
        const step = track.steps[track.current_step];

        console.log(`Launching: ${track.name} - ${step.task_path}`);

        const launchResult = await launchRun(step.task_path, repoPath, {
          time: options.time,
          maxTicks: options.maxTicks,
          allowDeps: options.allowDeps,
          worktree: options.worktree,
          fast: options.fast,
          forceParallel: options.collisionPolicy === 'force'
        });

        if ('error' in launchResult) {
          console.error(`  Failed to launch: ${launchResult.error}`);
          state = failTrack(state, trackId, launchResult.error);
        } else {
          console.log(`  Started run: ${launchResult.runId}`);
          state = startTrackRun(state, trackId, launchResult.runId, launchResult.runDir);

          // Start waiting for this run in the background
          const waitPromise = waitForRun(launchResult.runId, repoPath);
          activeWaits.set(trackId, waitPromise);
        }

        saveState(state, repoPath);
        break;
      }

      case 'wait':
        // Check if any active waits have completed
        if (activeWaits.size > 0) {
          // Race all active waits
          const entries = [...activeWaits.entries()];
          const raceResult = await Promise.race(
            entries.map(async ([trackId, promise]) => {
              const result = await promise;
              return { trackId, result };
            })
          );

          const { trackId, result } = raceResult;
          const track = state.tracks.find((t) => t.id === trackId)!;

          console.log(`Completed: ${track.name} - ${result.status}`);
          if (result.stop_reason) {
            console.log(`  Stop reason: ${result.stop_reason}`);
          }

          state = completeTrackStep(state, trackId, result);
          activeWaits.delete(trackId);
          saveState(state, repoPath);
        } else {
          // No active waits, just poll
          await sleep(POLL_INTERVAL_MS);
        }
        break;
    }

    printStatus(state);
  }

  // Final summary
  console.log('='.repeat(60));
  console.log('ORCHESTRATION COMPLETE');
  printStatus(state);

  const summary = getOrchestratorSummary(state);
  if (summary.failed > 0 || summary.stopped > 0) {
    process.exitCode = 1;
  }
}
