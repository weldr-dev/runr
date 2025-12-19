export type Phase =
  | 'INIT'
  | 'PLAN'
  | 'MILESTONE_START'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'FINALIZE'
  | 'DONE'
  | 'BLOCKED'
  | 'ESCALATED';

export type RiskLevel = 'low' | 'medium' | 'high';

export type VerificationTier = 'tier0' | 'tier1' | 'tier2';

export interface Milestone {
  goal: string;
  files_expected?: string[];
  done_checks: string[];
  risk_level: RiskLevel;
}

export interface RunState {
  run_id: string;
  repo_path: string;
  phase: Phase;
  milestone_index: number;
  milestones: Milestone[];
  scope_lock: {
    allowlist: string[];
    denylist: string[];
  };
  current_branch?: string;
  planned_run_branch?: string;
  risk_score: number;
  last_error?: string;
  retries: number;
  checkpoint_commit_sha?: string;
  last_successful_phase?: Phase;
  resume_token?: string;
  tier_reasons?: string[];
  started_at: string;
  updated_at: string;
  stop_reason?: string;
}

export type WorkerStatus = 'ok' | 'blocked' | 'failed';

export interface WorkerResult {
  status: WorkerStatus;
  patch?: string;
  commands_run: string[];
  observations: string[];
  handoff_memo?: string;
}

export interface Event {
  seq: number;
  timestamp: string;
  type: string;
  payload: unknown;
  source: string;
  correlation_id?: string;
}

export interface RepoContext {
  repo_path: string;
  git_root: string;
  default_branch: string;
  run_branch: string;
  current_branch: string;
  changed_files: string[];
  touched_packages: string[];
}

export interface VerificationPolicy {
  risk_triggers: Array<{
    name: string;
    patterns: string[];
    tier: VerificationTier;
  }>;
  tier0: string[];
  tier1: string[];
  tier2: string[];
  max_verify_time_per_milestone: number;
}

export interface VerifyResult {
  tier: VerificationTier;
  commands: string[];
  ok: boolean;
  duration_ms: number;
  output: string;
}
