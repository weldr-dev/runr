import { RunState } from '../types/schemas.js';
import { buildMilestonesFromTask } from './planner.js';

export interface InitStateInput {
  run_id: string;
  repo_path: string;
  task_text: string;
  owned_paths?: {
    raw: string[];
    normalized: string[];
  };
  allowlist: string[];
  denylist: string[];
}

/**
 * Creates initial run state with all timestamps set.
 *
 * Progress Tracking Design:
 * - `started_at`: Run start time (never changes)
 * - `updated_at`: Last state mutation (any write)
 * - `phase_started_at`: Current phase start time
 * - `last_progress_at`: Last meaningful work (for stall detection)
 *
 * The supervisor's `recordProgress()` is the canonical way to mark progress.
 * It updates both `last_progress_at` and `updated_at` together.
 */
export function createInitialState(input: InitStateInput): RunState {
  const now = new Date().toISOString();
  const milestones = buildMilestonesFromTask(input.task_text);
  return {
    run_id: input.run_id,
    repo_path: input.repo_path,
    phase: 'INIT',
    milestone_index: 0,
    milestones,
    owned_paths: input.owned_paths,
    scope_lock: {
      allowlist: input.allowlist,
      denylist: input.denylist
    },
    risk_score: 0,
    retries: 0,
    milestone_retries: 0,
    resume_token: input.run_id,
    phase_started_at: now,
    phase_attempt: 0,
    started_at: now,
    updated_at: now,
    last_progress_at: now,
    worker_stats: {
      claude: 0,
      codex: 0,
      by_phase: {
        plan: { claude: 0, codex: 0 },
        implement: { claude: 0, codex: 0 },
        review: { claude: 0, codex: 0 }
      }
    }
  };
}

export function updatePhase(state: RunState, phase: RunState['phase']): RunState {
  const now = new Date().toISOString();
  const phaseAttempt = state.phase === phase ? state.phase_attempt + 1 : 1;
  return {
    ...state,
    phase,
    last_successful_phase: state.phase,
    phase_started_at: now,
    phase_attempt: phaseAttempt,
    updated_at: now
  };
}

export function stopRun(state: RunState, reason: string): RunState {
  const now = new Date().toISOString();
  return {
    ...state,
    phase: 'STOPPED',
    stop_reason: reason,
    updated_at: now,
    phase_started_at: now
  };
}

/**
 * Canonical phase order for determining resume target.
 * Used by both manual resume command and auto-resume.
 */
const PHASE_ORDER = ['INIT', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'CHECKPOINT', 'FINALIZE'] as const;

/**
 * Compute the target phase to resume from based on last successful phase.
 * Shared between resume command and auto-resume to prevent drift.
 *
 * Logic:
 * - If STOPPED with last_successful_phase, resume from phase after that
 * - If at FINALIZE, stay at FINALIZE
 * - Otherwise use current phase (for non-STOPPED states)
 */
export function computeResumeTargetPhase(state: RunState): RunState['phase'] {
  // If not stopped, just use current phase
  if (state.phase !== 'STOPPED') {
    return state.phase;
  }

  // If we have a last successful phase, resume from the next one
  if (state.last_successful_phase) {
    const lastIdx = PHASE_ORDER.indexOf(state.last_successful_phase as typeof PHASE_ORDER[number]);
    if (lastIdx >= 0 && lastIdx < PHASE_ORDER.length - 1) {
      return PHASE_ORDER[lastIdx + 1] as RunState['phase'];
    }
    // At FINALIZE or beyond, stay there
    return state.last_successful_phase;
  }

  // No last successful phase, start from INIT
  return 'INIT';
}

/**
 * Prepare state for resumption (manual or auto).
 * Clears stop state, sets resume phase, optionally increments auto_resume_count.
 */
export function prepareForResume(
  state: RunState,
  options: {
    incrementAutoResumeCount?: boolean;
    resumeToken?: string;
  } = {}
): RunState {
  const now = new Date().toISOString();
  const targetPhase = computeResumeTargetPhase(state);
  const autoResumeCount = state.auto_resume_count ?? 0;

  return {
    ...state,
    phase: targetPhase,
    stop_reason: undefined,
    last_error: undefined,
    resume_token: options.resumeToken ?? state.run_id,
    updated_at: now,
    phase_started_at: now,
    auto_resume_count: options.incrementAutoResumeCount
      ? autoResumeCount + 1
      : autoResumeCount
  };
}
