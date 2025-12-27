/**
 * agent wait - Block until run reaches terminal state.
 *
 * Designed for meta-agent coordination. Returns machine-readable JSON
 * with run outcome, suitable for scripting and automation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';

export interface WaitOptions {
  runId: string;
  repo: string;
  for: 'terminal' | 'stop' | 'complete';
  timeout?: number; // ms
  json: boolean;
}

/**
 * Current schema version for WaitResult.
 * Increment when making breaking changes to the structure.
 */
export const WAIT_RESULT_SCHEMA_VERSION = 1;

export interface WaitResult {
  /** Schema version for forward compatibility */
  schema_version: number;
  run_id: string;
  run_dir: string;
  repo_root: string;
  status: 'complete' | 'stopped' | 'timeout';
  stop_reason?: string;
  phase: string;
  progress: {
    milestone: number;
    of: number;
  };
  resume_command?: string;
  collision_info?: {
    colliding_runs?: string[];
  };
  elapsed_ms: number;
  ts: string;
}

const TERMINAL_PHASES = ['STOPPED', 'DONE'];
const POLL_INTERVAL_MS = 500;
const BACKOFF_MAX_MS = 2000;

function readState(statePath: string): RunState | null {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as RunState;
  } catch {
    return null;
  }
}

function isTerminal(state: RunState): boolean {
  return TERMINAL_PHASES.includes(state.phase);
}

function matchesCondition(state: RunState, condition: WaitOptions['for']): boolean {
  if (!isTerminal(state)) return false;

  switch (condition) {
    case 'terminal':
      return true;
    case 'complete':
      return state.stop_reason === 'complete';
    case 'stop':
      return state.stop_reason !== 'complete';
    default:
      return true;
  }
}

function buildResult(
  runId: string,
  runDir: string,
  repoRoot: string,
  state: RunState,
  elapsedMs: number,
  timedOut: boolean
): WaitResult {
  const isComplete = state.stop_reason === 'complete';

  const result: WaitResult = {
    schema_version: WAIT_RESULT_SCHEMA_VERSION,
    run_id: runId,
    run_dir: runDir,
    repo_root: repoRoot,
    status: timedOut ? 'timeout' : isComplete ? 'complete' : 'stopped',
    phase: state.phase,
    progress: {
      milestone: state.milestone_index + 1,
      of: state.milestones.length
    },
    elapsed_ms: elapsedMs,
    ts: new Date().toISOString()
  };

  if (state.stop_reason && state.stop_reason !== 'complete') {
    result.stop_reason = state.stop_reason;
  }

  // Add resume command for non-complete stops
  if (!isComplete && !timedOut) {
    result.resume_command = `agent resume ${runId}`;
  }

  // Add collision info if relevant
  if (state.stop_reason === 'parallel_file_collision') {
    // Could extract from timeline, but for now just flag it
    result.collision_info = {};
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitCommand(options: WaitOptions): Promise<void> {
  const runDir = path.join(getRunsRoot(options.repo), options.runId);
  const statePath = path.join(runDir, 'state.json');

  if (!fs.existsSync(runDir)) {
    if (options.json) {
      console.log(JSON.stringify({
        error: 'run_not_found',
        run_id: options.runId,
        message: `Run directory not found: ${runDir}`
      }));
    } else {
      console.error(`Run directory not found: ${runDir}`);
    }
    process.exitCode = 1;
    return;
  }

  const repoRoot = path.resolve(options.repo);
  const startTime = Date.now();
  const timeoutMs = options.timeout ?? Infinity;
  let pollInterval = POLL_INTERVAL_MS;
  let lastState: RunState | null = null;

  while (true) {
    const elapsed = Date.now() - startTime;

    // Check timeout
    if (elapsed >= timeoutMs) {
      const state = readState(statePath);
      if (state) {
        const result = buildResult(options.runId, runDir, repoRoot, state, elapsed, true);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Timeout after ${Math.round(elapsed / 1000)}s`);
          console.log(`Current phase: ${state.phase}`);
          console.log(`Progress: ${state.milestone_index + 1}/${state.milestones.length}`);
        }
      }
      process.exitCode = 124; // timeout exit code (like GNU timeout)
      return;
    }

    // Read current state
    const state = readState(statePath);
    if (!state) {
      await sleep(pollInterval);
      continue;
    }

    lastState = state;

    // Check if condition is met
    if (matchesCondition(state, options.for)) {
      const result = buildResult(options.runId, runDir, repoRoot, state, elapsed, false);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const statusWord = result.status === 'complete' ? 'Completed' : 'Stopped';
        console.log(`${statusWord} after ${Math.round(elapsed / 1000)}s`);
        console.log(`Phase: ${state.phase}`);
        console.log(`Progress: ${result.progress.milestone}/${result.progress.of}`);
        if (result.stop_reason) {
          console.log(`Reason: ${result.stop_reason}`);
        }
        if (result.resume_command) {
          console.log(`Resume: ${result.resume_command}`);
        }
      }

      // Exit code: 0 for complete, 1 for stop
      process.exitCode = result.status === 'complete' ? 0 : 1;
      return;
    }

    // Backoff polling interval
    pollInterval = Math.min(pollInterval * 1.2, BACKOFF_MAX_MS);
    await sleep(pollInterval);
  }
}

/**
 * Find the latest run ID for --latest flag.
 */
export function findLatestRunId(repoPath: string): string | null {
  const runsDir = getRunsRoot(repoPath);
  if (!fs.existsSync(runsDir)) {
    return null;
  }

  const runIds = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();

  return runIds[0] ?? null;
}
