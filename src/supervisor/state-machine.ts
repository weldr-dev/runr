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
    resume_token: input.run_id,
    started_at: now,
    updated_at: now
  };
}

export function updatePhase(state: RunState, phase: RunState['phase']): RunState {
  return {
    ...state,
    phase,
    last_successful_phase: phase,
    updated_at: new Date().toISOString()
  };
}

export function stopRun(state: RunState, reason: string): RunState {
  return {
    ...state,
    phase: 'DONE',
    stop_reason: reason,
    updated_at: new Date().toISOString()
  };
}
