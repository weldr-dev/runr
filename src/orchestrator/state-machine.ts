/**
 * Orchestrator state machine.
 *
 * Manages the lifecycle of multi-track orchestration:
 * - Creates initial state from config
 * - Makes scheduling decisions
 * - Handles state transitions when runs complete
 * - Manages collision detection and serialization
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import {
  OrchestratorState,
  OrchestrationConfig,
  Track,
  Step,
  ScheduleDecision,
  TrackStatus,
  OrchestratorStatus,
  CollisionPolicy,
  StepResult,
  orchestrationConfigSchema
} from './types.js';
import {
  getActiveRuns,
  checkFileCollisions,
  ActiveRun
} from '../supervisor/collision.js';

/**
 * Generate a unique orchestrator ID.
 */
function makeOrchestratorId(): string {
  const now = new Date();
  const parts = [
    'orch',
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

/**
 * Load and validate orchestration config from file.
 */
export function loadOrchestrationConfig(configPath: string): OrchestrationConfig {
  const content = fs.readFileSync(configPath, 'utf-8');
  const ext = path.extname(configPath).toLowerCase();

  let parsed: unknown;
  if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.parse(content);
  } else {
    parsed = JSON.parse(content);
  }

  return orchestrationConfigSchema.parse(parsed);
}

/**
 * Create initial orchestrator state from config.
 */
export function createInitialOrchestratorState(
  config: OrchestrationConfig,
  repoPath: string,
  options: {
    timeBudgetMinutes: number;
    maxTicks: number;
    collisionPolicy: CollisionPolicy;
  }
): OrchestratorState {
  const tracks: Track[] = config.tracks.map((tc, idx) => ({
    id: `track-${idx + 1}`,
    name: tc.name,
    steps: tc.steps.map((sc) => ({
      task_path: sc.task,
      allowlist: sc.allowlist
    })),
    current_step: 0,
    status: 'pending' as TrackStatus
  }));

  return {
    orchestrator_id: makeOrchestratorId(),
    repo_path: repoPath,
    tracks,
    active_runs: {},
    file_claims: {},
    collision_policy: options.collisionPolicy,
    status: 'running',
    started_at: new Date().toISOString(),
    time_budget_minutes: options.timeBudgetMinutes,
    max_ticks: options.maxTicks
  };
}

/**
 * Get the next step for a track (if any).
 */
function getNextStep(track: Track): Step | null {
  if (track.current_step >= track.steps.length) {
    return null;
  }
  return track.steps[track.current_step];
}

/**
 * Check if a track can be launched given current file claims.
 */
function checkTrackCollision(
  track: Track,
  step: Step,
  state: OrchestratorState,
  repoPath: string
): { ok: boolean; collidingRuns?: string[]; collidingFiles?: string[] } {
  // Get the allowlist for this step
  // First check step-level, then we'd need task-level from config
  // For now, we rely on the run's post-PLAN collision check
  // This is a pre-launch allowlist overlap check

  // Get active runs (both from orchestrator and external)
  const externalRuns = getActiveRuns(repoPath);
  const orchestratorRuns: ActiveRun[] = [];

  // Add our own active runs
  for (const [trackId, runId] of Object.entries(state.active_runs)) {
    if (trackId === track.id) continue; // Don't check against self

    const activeTrack = state.tracks.find((t) => t.id === trackId);
    if (!activeTrack) continue;

    const activeStep = getNextStep(activeTrack);
    if (!activeStep) continue;

    // Build a pseudo-ActiveRun for collision checking
    // We'd need the files_expected from the running step
    // For MVP, we'll rely on the run-level collision check
  }

  // For MVP, return ok=true and let the individual runs handle collision
  // A more sophisticated version would track files_expected per run
  return { ok: true };
}

/**
 * Make a scheduling decision: what should the orchestrator do next?
 */
export function makeScheduleDecision(
  state: OrchestratorState
): ScheduleDecision {
  // Check if all tracks are done
  const allDone = state.tracks.every(
    (t) => t.status === 'complete' || t.status === 'stopped' || t.status === 'failed'
  );
  if (allDone) {
    return { action: 'done' };
  }

  // Find tracks that can be launched
  for (const track of state.tracks) {
    // Skip tracks that are already running, complete, or failed
    if (track.status !== 'pending' && track.status !== 'waiting') {
      continue;
    }

    const step = getNextStep(track);
    if (!step) {
      continue;
    }

    // Check for collisions
    const collision = checkTrackCollision(track, step, state, state.repo_path);
    if (!collision.ok) {
      if (state.collision_policy === 'serialize') {
        // Mark as waiting and continue to next track
        continue;
      } else if (state.collision_policy === 'fail') {
        return {
          action: 'blocked',
          track_id: track.id,
          reason: 'File collision detected',
          colliding_runs: collision.collidingRuns
        };
      }
      // 'force' policy: launch anyway
    }

    // This track is ready to launch
    return {
      action: 'launch',
      track_id: track.id
    };
  }

  // No tracks ready to launch, but not all done - must be waiting
  const waitingTracks = state.tracks.filter((t) => t.status === 'waiting');
  if (waitingTracks.length > 0) {
    return {
      action: 'wait',
      reason: `Waiting for collisions to clear: ${waitingTracks.map((t) => t.name).join(', ')}`
    };
  }

  // All remaining tracks must be running
  return {
    action: 'wait',
    reason: 'Waiting for running tracks to complete'
  };
}

/**
 * Mark a track as running with a specific run.
 */
export function startTrackRun(
  state: OrchestratorState,
  trackId: string,
  runId: string,
  runDir: string
): OrchestratorState {
  const newState = { ...state };
  newState.tracks = state.tracks.map((t) => {
    if (t.id !== trackId) return t;

    const newSteps = [...t.steps];
    newSteps[t.current_step] = {
      ...newSteps[t.current_step],
      run_id: runId,
      run_dir: runDir
    };

    return {
      ...t,
      steps: newSteps,
      status: 'running' as TrackStatus
    };
  });
  newState.active_runs = { ...state.active_runs, [trackId]: runId };
  return newState;
}

/**
 * Handle a run completing for a track.
 */
export function completeTrackStep(
  state: OrchestratorState,
  trackId: string,
  result: StepResult
): OrchestratorState {
  const newState = { ...state };

  newState.tracks = state.tracks.map((t) => {
    if (t.id !== trackId) return t;

    const newSteps = [...t.steps];
    newSteps[t.current_step] = {
      ...newSteps[t.current_step],
      result
    };

    const nextStep = t.current_step + 1;
    let newStatus: TrackStatus;

    if (result.status !== 'complete') {
      // Run stopped or timed out
      newStatus = 'stopped';
    } else if (nextStep >= t.steps.length) {
      // All steps complete
      newStatus = 'complete';
    } else {
      // More steps to go
      newStatus = 'pending';
    }

    return {
      ...t,
      steps: newSteps,
      current_step: nextStep,
      status: newStatus,
      error: result.status !== 'complete' ? result.stop_reason : undefined
    };
  });

  // Remove from active runs
  const { [trackId]: _, ...remainingActiveRuns } = state.active_runs;
  newState.active_runs = remainingActiveRuns;

  // Update overall status
  newState.status = computeOverallStatus(newState);
  if (newState.status !== 'running') {
    newState.ended_at = new Date().toISOString();
  }

  return newState;
}

/**
 * Compute overall orchestrator status from track states.
 */
function computeOverallStatus(state: OrchestratorState): OrchestratorStatus {
  const statuses = state.tracks.map((t) => t.status);

  // If any track is running or pending, we're still running
  if (statuses.some((s) => s === 'running' || s === 'pending' || s === 'waiting')) {
    return 'running';
  }

  // If all tracks are complete, we're complete
  if (statuses.every((s) => s === 'complete')) {
    return 'complete';
  }

  // If any track failed, we failed
  if (statuses.some((s) => s === 'failed')) {
    return 'failed';
  }

  // Otherwise, we stopped (some tracks stopped but not failed)
  return 'stopped';
}

/**
 * Mark a track as failed with an error.
 */
export function failTrack(
  state: OrchestratorState,
  trackId: string,
  error: string
): OrchestratorState {
  const newState = { ...state };

  newState.tracks = state.tracks.map((t) => {
    if (t.id !== trackId) return t;
    return {
      ...t,
      status: 'failed' as TrackStatus,
      error
    };
  });

  // Remove from active runs if present
  const { [trackId]: _, ...remainingActiveRuns } = state.active_runs;
  newState.active_runs = remainingActiveRuns;

  newState.status = computeOverallStatus(newState);
  if (newState.status !== 'running') {
    newState.ended_at = new Date().toISOString();
  }

  return newState;
}

/**
 * Get summary statistics for display.
 */
export function getOrchestratorSummary(state: OrchestratorState): {
  total_tracks: number;
  complete: number;
  running: number;
  pending: number;
  stopped: number;
  failed: number;
  total_steps: number;
  completed_steps: number;
} {
  const byStatus = {
    complete: 0,
    running: 0,
    pending: 0,
    waiting: 0,
    stopped: 0,
    failed: 0
  };

  let totalSteps = 0;
  let completedSteps = 0;

  for (const track of state.tracks) {
    byStatus[track.status]++;
    totalSteps += track.steps.length;
    completedSteps += track.steps.filter((s) => s.result?.status === 'complete').length;
  }

  return {
    total_tracks: state.tracks.length,
    complete: byStatus.complete,
    running: byStatus.running,
    pending: byStatus.pending + byStatus.waiting,
    stopped: byStatus.stopped,
    failed: byStatus.failed,
    total_steps: totalSteps,
    completed_steps: completedSteps
  };
}
