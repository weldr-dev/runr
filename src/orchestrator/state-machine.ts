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
  OrchestratorPolicy,
  OrchestrationConfig,
  Track,
  Step,
  ScheduleDecision,
  TrackStatus,
  OrchestratorStatus,
  CollisionPolicy,
  StepResult,
  OwnershipClaim,
  orchestrationConfigSchema,
  orchestratorStateSchema
} from './types.js';
import {
  getActiveRuns,
  checkFileCollisions,
  checkAllowlistOverlaps,
  patternsOverlap,
  ActiveRun
} from '../supervisor/collision.js';
import { getRunsRoot, getOrchestrationsRoot, getLegacyOrchestrationsRoot } from '../store/runs-root.js';
import {
  getOrchestrationDir,
  findOrchestrationDir,
  migrateOrchestrationIfNeeded
} from './artifacts.js';

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
    fast?: boolean;
    autoResume?: boolean;
    parallel?: number;
    ownershipRequired?: boolean;
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

  // Build the immutable policy block
  const policy: OrchestratorPolicy = {
    collision_policy: options.collisionPolicy,
    parallel: options.parallel ?? tracks.length, // Default: all tracks can run
    fast: options.fast ?? false,
    auto_resume: options.autoResume ?? false,
    ownership_required: options.ownershipRequired ?? false,
    time_budget_minutes: options.timeBudgetMinutes,
    max_ticks: options.maxTicks
  };

  return {
    orchestrator_id: makeOrchestratorId(),
    repo_path: repoPath,
    tracks,
    active_runs: {},
    file_claims: {},
    status: 'running',
    started_at: new Date().toISOString(),
    claim_events: [],
    // v1+ policy block
    policy,
    // Legacy fields (kept for backward compat with existing readers)
    collision_policy: policy.collision_policy,
    time_budget_minutes: policy.time_budget_minutes,
    max_ticks: policy.max_ticks,
    fast: policy.fast
  };
}

/**
 * Get effective policy from state.
 * Reads from policy block if present, falls back to legacy fields.
 */
export function getEffectivePolicy(state: OrchestratorState): OrchestratorPolicy {
  if (state.policy) {
    return state.policy;
  }

  // Migrate from legacy fields (v0 state)
  return {
    collision_policy: state.collision_policy,
    parallel: state.tracks.length, // No parallelism limit in v0
    fast: state.fast ?? false,
    auto_resume: false, // Not available in v0
    ownership_required: false,
    time_budget_minutes: state.time_budget_minutes,
    max_ticks: state.max_ticks
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
 * Uses allowlist overlap detection to prevent parallel runs on same files.
 */
function checkTrackCollision(
  track: Track,
  step: Step,
  state: OrchestratorState,
  repoPath: string
): { ok: boolean; collidingRuns?: string[]; collidingFiles?: string[] } {
  // Get the allowlist for this step
  const stepAllowlist = step.allowlist ?? [];

  // If no allowlist defined, can't check for collisions
  if (stepAllowlist.length === 0) {
    return { ok: true };
  }

  // Build pseudo-ActiveRuns from currently running orchestrator tracks
  const orchestratorRuns: ActiveRun[] = [];

  for (const [trackId, runId] of Object.entries(state.active_runs)) {
    if (trackId === track.id) continue; // Don't check against self

    const activeTrack = state.tracks.find((t) => t.id === trackId);
    if (!activeTrack) continue;

    // Get the current step of the active track
    const activeStep = activeTrack.steps[activeTrack.current_step];
    if (!activeStep) continue;

    // Build a pseudo-ActiveRun for collision checking
    orchestratorRuns.push({
      runId,
      phase: 'IMPLEMENT', // Assume running
      allowlist: activeStep.allowlist ?? [],
      predictedTouchFiles: [], // We don't have files_expected yet
      updatedAt: state.started_at ?? ''
    });
  }

  // Also check external active runs
  const externalRuns = getActiveRuns(repoPath);
  const allActiveRuns = [...orchestratorRuns, ...externalRuns];

  // Check for allowlist overlaps
  const overlaps = checkAllowlistOverlaps(stepAllowlist, allActiveRuns);

  if (overlaps.length > 0) {
    return {
      ok: false,
      collidingRuns: overlaps.map(o => o.runId),
      collidingFiles: overlaps.flatMap(o => o.overlappingPatterns)
    };
  }

  return { ok: true };
}

function isOwnershipClaim(value: OwnershipClaim | string): value is OwnershipClaim {
  return typeof value !== 'string';
}

function listOwnershipConflicts(
  state: OrchestratorState,
  trackId: string,
  ownsNormalized: string[]
): string[] {
  const conflicts = new Set<string>();
  const existing = Object.entries(state.file_claims);

  for (const pattern of ownsNormalized) {
    for (const [claimedPattern, claim] of existing) {
      if (isOwnershipClaim(claim) && claim.track_id === trackId) {
        continue;
      }
      if (patternsOverlap(pattern, claimedPattern)) {
        conflicts.add(claimedPattern);
      }
    }
  }

  return [...conflicts];
}

export function reserveOwnershipClaims(
  state: OrchestratorState,
  trackId: string,
  ownsRaw: string[],
  ownsNormalized: string[]
): { state: OrchestratorState; conflicts: string[] } {
  const normalized = [...new Set(ownsNormalized)];
  if (normalized.length === 0) {
    return { state, conflicts: [] };
  }

  const conflicts = listOwnershipConflicts(state, trackId, normalized);
  if (conflicts.length > 0) {
    return { state, conflicts };
  }

  const file_claims = { ...state.file_claims };
  for (const pattern of normalized) {
    file_claims[pattern] = {
      track_id: trackId,
      owns_raw: ownsRaw,
      owns_normalized: normalized
    };
  }

  const claim_events = [
    ...(state.claim_events ?? []),
    {
      timestamp: new Date().toISOString(),
      action: 'acquire' as const,
      track_id: trackId,
      claims: normalized,
      owns_raw: ownsRaw,
      owns_normalized: normalized
    }
  ];

  return {
    state: {
      ...state,
      file_claims,
      claim_events
    },
    conflicts: []
  };
}

export function attachRunIdToClaims(
  state: OrchestratorState,
  trackId: string,
  runId: string
): OrchestratorState {
  let updated = false;
  const file_claims = { ...state.file_claims };

  for (const [pattern, claim] of Object.entries(file_claims)) {
    if (isOwnershipClaim(claim) && claim.track_id === trackId) {
      file_claims[pattern] = { ...claim, run_id: runId };
      updated = true;
    }
  }

  if (!updated) {
    return state;
  }

  return { ...state, file_claims };
}

export function releaseOwnershipClaims(
  state: OrchestratorState,
  trackId: string
): OrchestratorState {
  const file_claims = { ...state.file_claims };
  const released: string[] = [];
  let firstClaim: OwnershipClaim | undefined;

  for (const [pattern, claim] of Object.entries(state.file_claims)) {
    if (isOwnershipClaim(claim) && claim.track_id === trackId) {
      if (!firstClaim) {
        firstClaim = claim;
      }
      delete file_claims[pattern];
      released.push(pattern);
    }
  }

  if (released.length === 0) {
    return state;
  }

  const claim_events = [
    ...(state.claim_events ?? []),
    {
      timestamp: new Date().toISOString(),
      action: 'release' as const,
      track_id: trackId,
      run_id: firstClaim?.run_id,
      claims: released,
      owns_raw: firstClaim?.owns_raw ?? [],
      owns_normalized: firstClaim?.owns_normalized ?? []
    }
  ];

  return {
    ...state,
    file_claims,
    claim_events
  };
}

/**
 * Make a scheduling decision: what should the orchestrator do next?
 */
export function makeScheduleDecision(
  state: OrchestratorState
): ScheduleDecision {
  const policy = getEffectivePolicy(state);
  const ownershipRequired = policy.ownership_required ?? false;

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

    if (ownershipRequired) {
      const ownsNormalized = step.owns_normalized ?? [];
      if (ownsNormalized.length === 0) {
        return {
          action: 'blocked',
          track_id: track.id,
          reason: `Missing owns metadata for ${step.task_path}`
        };
      }

      const conflicts = listOwnershipConflicts(state, track.id, ownsNormalized);
      if (conflicts.length > 0) {
        continue;
      }
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
  return attachRunIdToClaims(newState, trackId, runId);
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
  const releasedState = releaseOwnershipClaims(newState, trackId);

  // Update overall status
  releasedState.status = computeOverallStatus(releasedState);
  if (releasedState.status !== 'running') {
    releasedState.ended_at = new Date().toISOString();
  }

  return releasedState;
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

  const releasedState = releaseOwnershipClaims(newState, trackId);

  releasedState.status = computeOverallStatus(releasedState);
  if (releasedState.status !== 'running') {
    releasedState.ended_at = new Date().toISOString();
  }

  return releasedState;
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

/**
 * Load orchestrator state from disk.
 * Checks both new and legacy paths, migrating if needed.
 */
export function loadOrchestratorState(
  orchestratorId: string,
  repoPath: string
): OrchestratorState | null {
  // Find orchestration directory (handles migration automatically)
  const orchDir = findOrchestrationDir(repoPath, orchestratorId);

  if (orchDir) {
    const statePath = path.join(orchDir, 'state.json');
    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        const parsed = JSON.parse(content);
        return orchestratorStateSchema.parse(parsed);
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Save orchestrator state to disk.
 */
export function saveOrchestratorState(state: OrchestratorState, repoPath: string): void {
  const orchDir = getOrchestrationDir(repoPath, state.orchestrator_id);
  fs.mkdirSync(orchDir, { recursive: true });

  const statePath = path.join(orchDir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Find the latest orchestration ID.
 * Checks both new path (.agent/orchestrations/) and legacy path (.agent/runs/orchestrations/).
 */
export function findLatestOrchestrationId(repoPath: string): string | null {
  const ids: string[] = [];

  // Check new location: .agent/orchestrations/
  const newOrchDir = getOrchestrationsRoot(repoPath);
  if (fs.existsSync(newOrchDir)) {
    for (const e of fs.readdirSync(newOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch')) {
        ids.push(e.name);
      }
    }
  }

  // Check legacy location: .agent/runs/orchestrations/
  const legacyOrchDir = getLegacyOrchestrationsRoot(repoPath);
  if (fs.existsSync(legacyOrchDir)) {
    for (const e of fs.readdirSync(legacyOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch')) {
        // Don't add duplicates
        if (!ids.includes(e.name)) {
          ids.push(e.name);
        }
      }
    }
  }

  if (ids.length === 0) {
    return null;
  }

  // Sort and return latest
  ids.sort().reverse();
  return ids[0];
}

/**
 * Reconciliation result for a single active run.
 */
export interface ReconciliationResult {
  trackId: string;
  runId: string;
  status: 'still_running' | 'completed' | 'stopped' | 'not_found';
  result?: StepResult;
}

/**
 * Probe a run to check if it's still active or has completed.
 * Returns the run status without blocking.
 */
export async function probeRunStatus(
  runId: string,
  repoPath: string
): Promise<{ status: 'running' | 'terminal'; result?: StepResult }> {
  const runDir = path.join(getRunsRoot(repoPath), runId);
  const statePath = path.join(runDir, 'state.json');

  if (!fs.existsSync(statePath)) {
    return { status: 'terminal', result: { status: 'stopped', stop_reason: 'run_not_found', elapsed_ms: 0 } };
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const runState = JSON.parse(content);

    // STOPPED is the only terminal phase (DONE was never a valid phase)
    const isTerminal = runState.phase === 'STOPPED';

    if (isTerminal) {
      const isComplete = runState.stop_reason === 'complete';
      return {
        status: 'terminal',
        result: {
          status: isComplete ? 'complete' : 'stopped',
          stop_reason: runState.stop_reason,
          elapsed_ms: 0 // We don't track this in state.json
        }
      };
    }

    return { status: 'running' };
  } catch {
    return { status: 'terminal', result: { status: 'stopped', stop_reason: 'state_parse_error', elapsed_ms: 0 } };
  }
}

/**
 * Reconcile orchestrator state with actual run statuses.
 *
 * For each recorded active run:
 * - Check if it's still running or has completed
 * - Update state accordingly
 *
 * This is the critical crash-resume correctness step.
 */
export async function reconcileState(
  state: OrchestratorState
): Promise<{ state: OrchestratorState; reconciled: ReconciliationResult[] }> {
  let newState = { ...state };
  const reconciled: ReconciliationResult[] = [];

  for (const [trackId, runId] of Object.entries(state.active_runs)) {
    const probe = await probeRunStatus(runId, state.repo_path);

    if (probe.status === 'running') {
      reconciled.push({ trackId, runId, status: 'still_running' });
      // No state change needed - run is still active
    } else {
      // Run has completed - update state
      const result = probe.result!;
      reconciled.push({
        trackId,
        runId,
        status: result.status === 'complete' ? 'completed' : 'stopped',
        result
      });

      newState = completeTrackStep(newState, trackId, result);
    }
  }

  return { state: newState, reconciled };
}

/**
 * Check if this run should yield to another based on serialize policy.
 *
 * Deadlock prevention rule: later run_id yields to earlier run_id.
 * Run IDs are timestamps (YYYYMMDDHHMMSS), so lexicographic order = time order.
 */
export function shouldYieldTo(myRunId: string, otherRunId: string): boolean {
  // Later run yields to earlier run
  return myRunId > otherRunId;
}

/**
 * List all orchestration IDs (for status/listing commands).
 * Checks both new and legacy paths.
 */
export function listOrchestrationIds(repoPath: string): string[] {
  const ids: string[] = [];

  // Check new canonical path: .agent/orchestrations/
  const newOrchDir = getOrchestrationsRoot(repoPath);
  if (fs.existsSync(newOrchDir)) {
    for (const e of fs.readdirSync(newOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch')) {
        ids.push(e.name);
      }
    }
  }

  // Check legacy path: .agent/runs/orchestrations/
  const legacyOrchDir = getLegacyOrchestrationsRoot(repoPath);
  if (fs.existsSync(legacyOrchDir)) {
    for (const e of fs.readdirSync(legacyOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch') && !ids.includes(e.name)) {
        ids.push(e.name);
      }
    }
  }

  return ids.sort().reverse();
}
