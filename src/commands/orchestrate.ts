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
import { createInterface } from 'node:readline';
import {
  OrchestrateOptions,
  OrchestratorState,
  CollisionPolicy,
  StepResult,
  OrchestratorWaitResult
} from '../orchestrator/types.js';
import {
  loadOrchestrationConfig,
  createInitialOrchestratorState,
  makeScheduleDecision,
  startTrackRun,
  completeTrackStep,
  failTrack,
  getOrchestratorSummary,
  loadOrchestratorState,
  saveOrchestratorState,
  findLatestOrchestrationId,
  reconcileState,
  getEffectivePolicy,
  reserveOwnershipClaims
} from '../orchestrator/state-machine.js';
import { writeTerminalArtifacts, getOrchestrationDir, buildWaitResult } from '../orchestrator/artifacts.js';
import { getRunsRoot } from '../store/runs-root.js';
import { RunJsonOutput } from './run.js';
import { WaitResult } from './wait.js';
import { loadTaskMetadata } from '../tasks/task-metadata.js';

const POLL_INTERVAL_MS = 2000;
const RUN_LAUNCH_TIMEOUT_MS = 30000;

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

function applyTaskOwnershipMetadata(
  state: OrchestratorState,
  repoPath: string
): { state: OrchestratorState; errors: string[] } {
  const errors: string[] = [];

  const tracks = state.tracks.map((track) => {
    const steps = track.steps.map((step) => {
      if (step.owns_normalized !== undefined && step.owns_raw !== undefined) {
        return step;
      }

      const taskPath = path.resolve(repoPath, step.task_path);
      try {
        const metadata = loadTaskMetadata(taskPath);
        return {
          ...step,
          owns_raw: metadata.owns_raw,
          owns_normalized: metadata.owns_normalized
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${step.task_path}: ${message}`);
        return step;
      }
    });

    return { ...track, steps };
  });

  return { state: { ...state, tracks }, errors };
}

function collectMissingOwnership(state: OrchestratorState): Array<{ track: string; task: string }> {
  const missing: Array<{ track: string; task: string }> = [];
  for (const track of state.tracks) {
    for (const step of track.steps) {
      if (!step.owns_normalized || step.owns_normalized.length === 0) {
        missing.push({ track: track.name, task: step.task_path });
      }
    }
  }
  return missing;
}

function formatOwnershipMissingMessage(missing: Array<{ track: string; task: string }>): string {
  const lines = [
    'Parallel runs without worktrees require ownership declarations.',
    'Single-task runs and --worktree runs do not require owns.',
    '',
    'Fix: Add YAML frontmatter to each task file:',
    '',
    '  ---',
    '  owns:',
    '    - src/courses/my-course/',
    '  ---',
    '',
    'Or use --worktree for full isolation (recommended).',
    '',
    `Missing owns (${missing.length} task${missing.length === 1 ? '' : 's'}):`
  ];
  for (const entry of missing) {
    lines.push(`  ${entry.task}`);
  }
  return lines.join('\n');
}

/**
 * Launch an agent run and resolve when the JSON run_id is emitted.
 * The process keeps running; we continue to drain output to avoid backpressure.
 */
function launchAgentRun(
  args: string[],
  cwd: string,
  timeoutMs = RUN_LAUNCH_TIMEOUT_MS
): Promise<{ runId: string; runDir: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['agent', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let resolved = false;
    let stderr = '';

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error('Timed out waiting for agent run_id'));
    }, timeoutMs);

    const stdoutLines = createInterface({ input: proc.stdout });
    stdoutLines.on('line', (line) => {
      if (resolved) return;
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;

      try {
        const output: RunJsonOutput = JSON.parse(trimmed);
        if (output.run_id && output.run_dir) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ runId: output.run_id, runDir: output.run_dir });
        }
      } catch {
        // Ignore non-JSON lines
      }
    });

    proc.stderr.on('data', (data) => {
      if (resolved) return;
      const chunk = data.toString();
      if (stderr.length < 4096) {
        stderr = (stderr + chunk).slice(-4096);
      }
    });

    proc.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      const message = stderr.trim() || `Exit code ${code ?? 1}`;
      reject(new Error(message));
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
    skipDoctor?: boolean;
    autoResume?: boolean;
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
  if (options.skipDoctor) args.push('--skip-doctor');
  if (options.autoResume) args.push('--auto-resume');
  try {
    const output = await launchAgentRun(args, repoPath);
    return {
      runId: output.runId,
      runDir: output.runDir
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
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
 * Save orchestrator state to disk and write terminal artifacts if complete.
 */
function saveState(state: OrchestratorState, repoPath: string): void {
  saveOrchestratorState(state, repoPath);

  // Write terminal artifacts if orchestration is complete or stopped
  if (state.status !== 'running') {
    writeTerminalArtifacts(state, repoPath);
  }
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
  const ownershipRequired = !options.worktree && config.tracks.length > 1;
  let state = createInitialOrchestratorState(config, repoPath, {
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    collisionPolicy: options.collisionPolicy,
    fast: options.fast,
    ownershipRequired
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

  const ownershipApplied = applyTaskOwnershipMetadata(state, repoPath);
  if (ownershipApplied.errors.length > 0) {
    console.error('Failed to parse task ownership metadata:');
    for (const err of ownershipApplied.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  state = ownershipApplied.state;

  if (ownershipRequired) {
    const missing = collectMissingOwnership(state);
    if (missing.length > 0) {
      console.error(formatOwnershipMissingMessage(missing));
      process.exitCode = 1;
      return;
    }
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
        const policy = getEffectivePolicy(state);

        if (policy.ownership_required) {
          const ownsRaw = step.owns_raw ?? [];
          const ownsNormalized = step.owns_normalized ?? [];
          const reservation = reserveOwnershipClaims(state, trackId, ownsRaw, ownsNormalized);
          if (reservation.conflicts.length > 0) {
            const conflictList = reservation.conflicts.join(', ');
            const message = `Ownership claim conflict for ${step.task_path}: ${conflictList}`;
            console.error(`  ${message}`);
            state = failTrack(state, trackId, message);
            saveState(state, repoPath);
            break;
          }
          state = reservation.state;
        }

        console.log(`Launching: ${track.name} - ${step.task_path} (fast=${options.fast})`);

        const launchResult = await launchRun(step.task_path, repoPath, {
          time: options.time,
          maxTicks: options.maxTicks,
          allowDeps: options.allowDeps,
          worktree: options.worktree,
          fast: options.fast,
          forceParallel: options.collisionPolicy === 'force',
          autoResume: options.autoResume
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

/**
 * Policy override options for resume.
 */
export interface PolicyOverrides {
  time?: number;
  maxTicks?: number;
  fast?: boolean;
  collisionPolicy?: CollisionPolicy;
}

/**
 * Record of a single override application.
 */
export interface OverrideRecord {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Apply policy overrides to state.
 * Returns the updated state and a list of what was changed.
 */
function applyPolicyOverrides(
  state: OrchestratorState,
  overrides: PolicyOverrides
): { state: OrchestratorState; applied: OverrideRecord[] } {
  const applied: OverrideRecord[] = [];
  const policy = getEffectivePolicy(state);

  // Create a mutable copy of policy
  const newPolicy = { ...policy };

  if (overrides.time !== undefined && overrides.time !== policy.time_budget_minutes) {
    applied.push({
      field: 'time_budget_minutes',
      from: policy.time_budget_minutes,
      to: overrides.time
    });
    newPolicy.time_budget_minutes = overrides.time;
  }

  if (overrides.maxTicks !== undefined && overrides.maxTicks !== policy.max_ticks) {
    applied.push({
      field: 'max_ticks',
      from: policy.max_ticks,
      to: overrides.maxTicks
    });
    newPolicy.max_ticks = overrides.maxTicks;
  }

  if (overrides.fast !== undefined && overrides.fast !== policy.fast) {
    applied.push({
      field: 'fast',
      from: policy.fast,
      to: overrides.fast
    });
    newPolicy.fast = overrides.fast;
  }

  if (overrides.collisionPolicy !== undefined && overrides.collisionPolicy !== policy.collision_policy) {
    applied.push({
      field: 'collision_policy',
      from: policy.collision_policy,
      to: overrides.collisionPolicy
    });
    newPolicy.collision_policy = overrides.collisionPolicy;
  }

  if (applied.length === 0) {
    return { state, applied: [] };
  }

  // Update state with new policy
  const newState = {
    ...state,
    policy: newPolicy,
    // Also update legacy fields for backward compat
    collision_policy: newPolicy.collision_policy,
    time_budget_minutes: newPolicy.time_budget_minutes,
    max_ticks: newPolicy.max_ticks,
    fast: newPolicy.fast
  };

  return { state: newState, applied };
}

/**
 * Options for resuming an orchestration.
 */
export interface OrchestrateResumeOptions {
  /** Orchestrator ID to resume (or "latest") */
  orchestratorId: string;
  /** Target repo path */
  repo: string;
  /** Optional policy overrides (logged as policy_override event) */
  overrides?: PolicyOverrides;
}

/**
 * Resume a previously started orchestration.
 *
 * On resume:
 * 1. Load saved state from disk
 * 2. Reconcile active runs (probe for completion)
 * 3. Continue scheduling from current state
 */
export async function resumeOrchestrationCommand(options: OrchestrateResumeOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  // Resolve "latest" to actual ID
  let orchestratorId = options.orchestratorId;
  if (orchestratorId === 'latest') {
    const latest = findLatestOrchestrationId(repoPath);
    if (!latest) {
      console.error('No orchestrations found');
      process.exitCode = 1;
      return;
    }
    orchestratorId = latest;
  }

  // Load saved state
  let state = loadOrchestratorState(orchestratorId, repoPath);
  if (!state) {
    console.error(`Orchestration not found: ${orchestratorId}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Resuming orchestration: ${orchestratorId}`);

  // Apply policy overrides if provided
  if (options.overrides) {
    const { state: updatedState, applied } = applyPolicyOverrides(state, options.overrides);
    state = updatedState;

    if (applied.length > 0) {
      console.log('Policy overrides applied:');
      for (const override of applied) {
        console.log(`  ${override.field}: ${override.from} → ${override.to}`);
      }
      saveState(state, repoPath);
    }
  }

  const ownershipApplied = applyTaskOwnershipMetadata(state, repoPath);
  if (ownershipApplied.errors.length > 0) {
    console.error('Failed to parse task ownership metadata:');
    for (const err of ownershipApplied.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  state = ownershipApplied.state;

  const resumePolicy = getEffectivePolicy(state);
  if (resumePolicy.ownership_required) {
    const missing = collectMissingOwnership(state);
    if (missing.length > 0) {
      console.error(formatOwnershipMissingMessage(missing));
      process.exitCode = 1;
      return;
    }
  }

  // Check if already terminal
  if (state.status !== 'running') {
    console.log(`Orchestration already ${state.status}`);
    printStatus(state);
    process.exitCode = state.status === 'complete' ? 0 : 1;
    return;
  }

  // Reconcile active runs
  console.log('Reconciling active runs...');
  const { state: reconciledState, reconciled } = await reconcileState(state);
  state = reconciledState;

  for (const r of reconciled) {
    const status = r.status === 'still_running' ? 'still running' : r.status;
    console.log(`  ${r.trackId} (${r.runId}): ${status}`);
  }

  saveState(state, repoPath);

  // If all runs finished during reconciliation
  if (state.status !== 'running') {
    console.log('All runs completed during reconciliation');
    printStatus(state);
    process.exitCode = state.status === 'complete' ? 0 : 1;
    return;
  }

  // Resume tracking active waits
  const activeWaits = new Map<string, Promise<StepResult>>();

  // Start waiting for any still-running runs
  for (const r of reconciled) {
    if (r.status === 'still_running') {
      const waitPromise = waitForRun(r.runId, repoPath);
      activeWaits.set(r.trackId, waitPromise);
    }
  }

  console.log('Continuing orchestration...');
  console.log('');

  // Main orchestration loop (same as orchestrateCommand)
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

        // Use effective policy (from policy block or legacy fields)
        const policy = getEffectivePolicy(state);

        if (policy.ownership_required) {
          const ownsRaw = step.owns_raw ?? [];
          const ownsNormalized = step.owns_normalized ?? [];
          const reservation = reserveOwnershipClaims(state, trackId, ownsRaw, ownsNormalized);
          if (reservation.conflicts.length > 0) {
            const conflictList = reservation.conflicts.join(', ');
            const message = `Ownership claim conflict for ${step.task_path}: ${conflictList}`;
            console.error(`  ${message}`);
            state = failTrack(state, trackId, message);
            saveState(state, repoPath);
            break;
          }
          state = reservation.state;
        }

        console.log(`Launching: ${track.name} - ${step.task_path} (fast=${policy.fast})`);

        const launchResult = await launchRun(step.task_path, repoPath, {
          time: policy.time_budget_minutes,
          maxTicks: policy.max_ticks,
          allowDeps: false, // Default for resume
          worktree: false,
          fast: policy.fast,
          forceParallel: policy.collision_policy === 'force'
        });

        if ('error' in launchResult) {
          console.error(`  Failed to launch: ${launchResult.error}`);
          state = failTrack(state, trackId, launchResult.error);
        } else {
          console.log(`  Started run: ${launchResult.runId}`);
          state = startTrackRun(state, trackId, launchResult.runId, launchResult.runDir);

          const waitPromise = waitForRun(launchResult.runId, repoPath);
          activeWaits.set(trackId, waitPromise);
        }

        saveState(state, repoPath);
        break;
      }

      case 'wait':
        if (activeWaits.size > 0) {
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

/**
 * Options for orchestrate wait command.
 */
export interface OrchestrateWaitOptions {
  orchestratorId: string;
  repo: string;
  for: 'terminal' | 'complete' | 'stop';
  timeout?: number;
  json: boolean;
}

const WAIT_POLL_INTERVAL_MS = 500;
const WAIT_BACKOFF_MAX_MS = 2000;

/**
 * Wait for an orchestration to reach a terminal state.
 */
export async function waitOrchestrationCommand(options: OrchestrateWaitOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  // Resolve "latest" to actual ID
  let orchestratorId = options.orchestratorId;
  if (orchestratorId === 'latest') {
    const latest = findLatestOrchestrationId(repoPath);
    if (!latest) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_orchestrations', message: 'No orchestrations found' }));
      } else {
        console.error('No orchestrations found');
      }
      process.exitCode = 1;
      return;
    }
    orchestratorId = latest;
  }

  const orchDir = getOrchestrationDir(repoPath, orchestratorId);
  const handoffsDir = path.join(orchDir, 'handoffs');

  // Check if orchestration exists
  const state = loadOrchestratorState(orchestratorId, repoPath);
  if (!state) {
    if (options.json) {
      console.log(JSON.stringify({
        error: 'orchestration_not_found',
        orchestrator_id: orchestratorId,
        message: `Orchestration not found: ${orchestratorId}`
      }));
    } else {
      console.error(`Orchestration not found: ${orchestratorId}`);
    }
    process.exitCode = 1;
    return;
  }

  const startTime = Date.now();
  const timeoutMs = options.timeout ?? Infinity;
  let pollInterval = WAIT_POLL_INTERVAL_MS;

  while (true) {
    const elapsed = Date.now() - startTime;

    // Check timeout
    if (elapsed >= timeoutMs) {
      const currentState = loadOrchestratorState(orchestratorId, repoPath);
      if (options.json && currentState) {
        const result = buildWaitResultFromState(currentState, repoPath, true);
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Timeout after ${Math.round(elapsed / 1000)}s`);
      }
      process.exitCode = 124;
      return;
    }

    // Fast path: check for terminal artifact (most reliable)
    const completePath = path.join(handoffsDir, 'complete.json');
    const stopPath = path.join(handoffsDir, 'stop.json');

    if (fs.existsSync(completePath)) {
      const artifact: OrchestratorWaitResult = JSON.parse(fs.readFileSync(completePath, 'utf-8'));
      if (options.for !== 'stop') {
        outputWaitResult(artifact, options.json, elapsed);
        process.exitCode = 0;
        return;
      }
    }

    if (fs.existsSync(stopPath)) {
      const artifact: OrchestratorWaitResult = JSON.parse(fs.readFileSync(stopPath, 'utf-8'));
      if (options.for !== 'complete') {
        outputWaitResult(artifact, options.json, elapsed);
        process.exitCode = 1;
        return;
      }
    }

    // Slow path: read state.json
    const currentState = loadOrchestratorState(orchestratorId, repoPath);
    if (currentState && currentState.status !== 'running') {
      const isComplete = currentState.status === 'complete';
      const matchesCondition =
        options.for === 'terminal' ||
        (options.for === 'complete' && isComplete) ||
        (options.for === 'stop' && !isComplete);

      if (matchesCondition) {
        const result = buildWaitResultFromState(currentState, repoPath, false);
        outputWaitResult(result, options.json, elapsed);
        process.exitCode = isComplete ? 0 : 1;
        return;
      }
    }

    // Backoff polling
    pollInterval = Math.min(pollInterval * 1.2, WAIT_BACKOFF_MAX_MS);
    await sleep(pollInterval);
  }
}

/**
 * Build wait result from state (when no artifact exists yet).
 */
function buildWaitResultFromState(
  state: OrchestratorState,
  repoPath: string,
  timedOut: boolean
): OrchestratorWaitResult {
  const result = buildWaitResult(state, repoPath) as OrchestratorWaitResult;

  if (timedOut) {
    return {
      ...result,
      status: 'stopped' as const,
      stop_reason: 'orchestrator_timeout',
      stop_reason_family: 'budget'
    };
  }

  return result;
}

/**
 * Output wait result in JSON or human-readable format.
 */
function outputWaitResult(
  result: OrchestratorWaitResult,
  json: boolean,
  elapsedMs: number
): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const statusWord = result.status === 'complete' ? 'Completed' : 'Stopped';
    console.log(`${statusWord} after ${Math.round(elapsedMs / 1000)}s`);
    console.log(`Tracks: ${result.tracks.completed}/${result.tracks.total}`);
    console.log(`Steps: ${result.steps.completed}/${result.steps.total}`);
    if (result.stop_reason) {
      console.log(`Reason: ${result.stop_reason}`);
    }
    if (result.resume_command) {
      console.log(`Resume: ${result.resume_command}`);
    }
  }
}

/**
 * Options for orchestrate receipt command.
 */
export interface OrchestrateReceiptOptions {
  orchestratorId: string;
  repo: string;
  json: boolean;
  write: boolean;
}

/**
 * Generate and display orchestration receipt.
 */
export async function receiptCommand(options: OrchestrateReceiptOptions): Promise<void> {
  const { getReceipt, writeReceipt, generateReceiptMarkdown } = await import('../orchestrator/receipt.js');
  const repoPath = path.resolve(options.repo);

  // Get receipt (from cache or generate from state)
  const receipt = getReceipt(repoPath, options.orchestratorId);

  if (!receipt) {
    console.error(`Orchestration not found: ${options.orchestratorId}`);
    process.exitCode = 1;
    return;
  }

  // Write artifacts if requested
  if (options.write) {
    const paths = writeReceipt(receipt, repoPath);
    console.log(`Receipt written:`);
    console.log(`  JSON: ${paths.json}`);
    console.log(`  MD: ${paths.md}`);
    console.log('');
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(generateReceiptMarkdown(receipt));
  }
}
