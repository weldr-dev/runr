export type Phase =
  | 'INIT'
  | 'PLAN'
  | 'MILESTONE_START'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'CHECKPOINT'
  | 'FINALIZE'
  | 'STOPPED'
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

export interface VerifyFailure {
  failedCommand: string;
  errorOutput: string;
  changedFiles: string[];
  tier: VerificationTier;
}

export interface WorkerStats {
  claude: number;
  codex: number;
  by_phase: {
    plan: { claude: number; codex: number };
    implement: { claude: number; codex: number };
    review: { claude: number; codex: number };
  };
}

export interface VerificationEvidence {
  commands_required: string[];
  commands_run: Array<{ command: string; exit_code: number }>;
  commands_missing: string[];
  tiers_run: VerificationTier[];
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
  milestone_retries: number;
  last_verify_failure?: VerifyFailure;
  last_verification_evidence?: VerificationEvidence;
  checkpoint_commit_sha?: string;
  last_successful_phase?: Phase;
  resume_token?: string;
  tier_reasons?: string[];
  phase_started_at: string;
  phase_attempt: number;
  started_at: string;
  updated_at: string;
  last_progress_at?: string;
  stop_reason?: string;
  worker_stats: WorkerStats;
  /** Count of auto-resumes for this run (migration-safe: defaults to 0 if absent) */
  auto_resume_count?: number;
  /** Count of review rounds for current milestone (resets on checkpoint) */
  review_rounds?: number;
  /** Hash of last review request_changes payload for loop detection */
  last_review_fingerprint?: string;
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

export interface CommandResult {
  command: string;
  exit_code: number;
  output: string;
}

export interface VerifyResult {
  tier: VerificationTier;
  commands: string[];
  command_results: CommandResult[];
  ok: boolean;
  duration_ms: number;
  output: string;
}
