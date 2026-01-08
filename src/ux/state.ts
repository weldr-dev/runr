/**
 * Repo state resolution for the UX layer.
 *
 * This module gathers signals from the filesystem to determine the current
 * state of the repository: what's running, what's stopped, what orchestration
 * is in progress, etc.
 *
 * All functions here do I/O. The brain module is pure and consumes this data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot } from '../store/runs-root.js';
import { findLatestRunId, listRecentRunIds } from '../store/run-utils.js';
import { getCurrentMode, WorkflowMode } from '../commands/mode.js';
import { findLatestOrchestrationId, loadOrchestratorState } from '../orchestrator/state-machine.js';
import { git } from '../repo/git.js';

/**
 * Minimal info about a run (for display).
 */
export interface RunInfo {
  runId: string;
  phase: string;
  stopReason: string | null;
  taskPath: string | null;
  startedAt: string | null;
  updatedAt: string | null;
}

/**
 * Info about a stopped run with diagnostics.
 */
export interface StoppedRunInfo extends RunInfo {
  stopReason: string;
  /** Path to stop.json if it exists */
  stopJsonPath: string | null;
  /** Path to stop_diagnostics.json if it exists */
  diagnosticsPath: string | null;
}

/**
 * Orchestration cursor info.
 */
export interface OrchCursor {
  orchestratorId: string;
  status: string;
  tracksTotal: number;
  tracksComplete: number;
  tracksStopped: number;
  configPath: string | null;
}

/**
 * Complete repo state for the UX layer.
 */
export interface RepoState {
  /** Currently running run, if any */
  activeRun: RunInfo | null;
  /** Most recent run (any state) */
  latestRun: RunInfo | null;
  /** Most recent stopped run, if any */
  latestStopped: StoppedRunInfo | null;
  /** Orchestration in progress, if any */
  orchestration: OrchCursor | null;
  /** Working tree status */
  treeStatus: 'clean' | 'dirty';
  /** Current workflow mode */
  mode: WorkflowMode;
  /** Repo path used for resolution */
  repoPath: string;
}

/**
 * Read minimal run info from state.json.
 * Returns null if file doesn't exist or is unparseable.
 */
function readRunInfo(runDir: string, runId: string): RunInfo | null {
  const statePath = path.join(runDir, 'state.json');

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content);

    return {
      runId,
      phase: state.phase ?? 'unknown',
      stopReason: state.stop_reason ?? null,
      taskPath: null, // Could read from config.snapshot.json if needed
      startedAt: state.started_at ?? null,
      updatedAt: state.updated_at ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Read task path from config snapshot.
 */
function readTaskPath(runDir: string): string | null {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');

  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(content);
    return snapshot.task_path ?? snapshot.taskPath ?? null;
  } catch {
    return null;
  }
}

/**
 * Find the most recent stopped run.
 * Scans runs newest→oldest, returns first with phase=STOPPED.
 */
export function findLatestStoppedRun(repoPath: string): StoppedRunInfo | null {
  const runsRoot = getRunsRoot(repoPath);
  const runIds = listRecentRunIds(repoPath, 20); // Check last 20 runs

  for (const runId of runIds) {
    const runDir = path.join(runsRoot, runId);
    const info = readRunInfo(runDir, runId);

    if (info && info.phase === 'STOPPED' && info.stopReason) {
      // Check for stop.json
      const stopJsonPath = path.join(runDir, 'handoffs', 'stop.json');
      const diagnosticsPath = path.join(runDir, 'stop_diagnostics.json');

      return {
        ...info,
        stopReason: info.stopReason,
        taskPath: readTaskPath(runDir),
        stopJsonPath: fs.existsSync(stopJsonPath) ? stopJsonPath : null,
        diagnosticsPath: fs.existsSync(diagnosticsPath) ? diagnosticsPath : null,
      };
    }
  }

  return null;
}

/**
 * Find any currently running run.
 * A run is "running" if phase is not STOPPED.
 */
export function findActiveRun(repoPath: string): RunInfo | null {
  const runsRoot = getRunsRoot(repoPath);
  const runIds = listRecentRunIds(repoPath, 10); // Check last 10 runs

  for (const runId of runIds) {
    const runDir = path.join(runsRoot, runId);
    const info = readRunInfo(runDir, runId);

    if (info && info.phase !== 'STOPPED') {
      return {
        ...info,
        taskPath: readTaskPath(runDir),
      };
    }
  }

  return null;
}

/**
 * Get orchestration cursor if one exists and is not complete.
 */
export function getOrchestrationCursor(repoPath: string): OrchCursor | null {
  const orchId = findLatestOrchestrationId(repoPath);

  if (!orchId) {
    return null;
  }

  const state = loadOrchestratorState(orchId, repoPath);

  if (!state) {
    return null;
  }

  // Only return cursor if orchestration is still running or has stopped tasks
  if (state.status === 'complete') {
    return null;
  }

  const complete = state.tracks.filter(t => t.status === 'complete').length;
  const stopped = state.tracks.filter(t => t.status === 'stopped' || t.status === 'failed').length;

  return {
    orchestratorId: orchId,
    status: state.status,
    tracksTotal: state.tracks.length,
    tracksComplete: complete,
    tracksStopped: stopped,
    configPath: null, // Could be read from state if stored
  };
}

/**
 * Check if working tree is clean.
 */
export async function getTreeStatus(repoPath: string): Promise<'clean' | 'dirty'> {
  try {
    const result = await git(['status', '--porcelain'], repoPath);
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    return lines.length === 0 ? 'clean' : 'dirty';
  } catch {
    // If git fails, assume clean (conservative)
    return 'clean';
  }
}

/**
 * Resolve complete repo state.
 * This is the main entry point for the UX layer.
 */
export async function resolveRepoState(repoPath: string = process.cwd()): Promise<RepoState> {
  // Find active run first (takes priority)
  const activeRun = findActiveRun(repoPath);

  // Find latest run (any state)
  const latestRunId = findLatestRunId(repoPath);
  let latestRun: RunInfo | null = null;
  if (latestRunId) {
    const runDir = path.join(getRunsRoot(repoPath), latestRunId);
    latestRun = readRunInfo(runDir, latestRunId);
    if (latestRun) {
      latestRun.taskPath = readTaskPath(runDir);
    }
  }

  // Find latest stopped run (for continue)
  const latestStopped = findLatestStoppedRun(repoPath);

  // Get orchestration cursor
  const orchestration = getOrchestrationCursor(repoPath);

  // Get tree status
  const treeStatus = await getTreeStatus(repoPath);

  // Get workflow mode
  const mode = getCurrentMode(repoPath);

  return {
    activeRun,
    latestRun,
    latestStopped,
    orchestration,
    treeStatus,
    mode,
    repoPath,
  };
}

/**
 * Derive display status from repo state.
 */
export function deriveDisplayStatus(state: RepoState): 'running' | 'stopped' | 'orch_ready' | 'clean' {
  if (state.activeRun) {
    return 'running';
  }
  if (state.latestStopped) {
    return 'stopped';
  }
  if (state.orchestration && state.orchestration.status !== 'complete') {
    return 'orch_ready';
  }
  return 'clean';
}
