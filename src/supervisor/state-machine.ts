import { RunState } from '../types/schemas.js';
import { buildMilestonesFromTask } from './planner.js';

export interface InitStateInput {
  run_id: string;
  repo_path: string;
  task_text: string;
  allowlist: string[];
  denylist: string[];
}

export function createInitialState(input: InitStateInput): RunState {
  const now = new Date().toISOString();
  const milestones = buildMilestonesFromTask(input.task_text);
  return {
    run_id: input.run_id,
    repo_path: input.repo_path,
    phase: 'INIT',
    milestone_index: 0,
    milestones,
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
