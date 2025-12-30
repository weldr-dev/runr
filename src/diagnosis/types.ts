/**
 * Diagnosis types for auto-diagnosing run stop reasons.
 *
 * The diagnosis system analyzes timeline events, state, and logs to determine
 * why a run stopped and what action to take next.
 */

/**
 * Stop reason families - high-level grouping of stop reasons.
 */
export type StopReasonFamily =
  | 'guard'       // scope_violation, lockfile, dirty worktree, cwd mismatch
  | 'budget'      // max_ticks, time_budget
  | 'verification'// test/lint/typecheck failures
  | 'worker'      // parse failures, fallbacks
  | 'stall'       // no progress detected
  | 'auth'        // authentication issues
  | 'complete'    // successful completion
  | 'unknown';

/**
 * Primary diagnosis categories.
 * Maps to specific signals and next actions.
 */
export type DiagnosisCategory =
  | 'auth_expired'
  | 'verification_cwd_mismatch'
  | 'scope_violation'
  | 'lockfile_restricted'
  | 'verification_failure'
  | 'worker_parse_failure'
  | 'stall_timeout'
  | 'max_ticks_reached'
  | 'time_budget_exceeded'
  | 'guard_violation_dirty'
  | 'ownership_violation'
  | 'unknown';

/**
 * A suggested next action with command and explanation.
 */
export interface NextAction {
  /** Short action title */
  title: string;
  /** Exact command to run (if applicable) */
  command?: string;
  /** Why this action helps */
  why: string;
}

/**
 * A signal that contributed to the diagnosis.
 */
export interface DiagnosisSignal {
  /** Source of the signal (event type, log file, state field) */
  source: string;
  /** The specific pattern or value that matched */
  pattern: string;
  /** Snippet of evidence (truncated if long) */
  snippet?: string;
}

/**
 * Machine-readable diagnosis output.
 * Written to runs/<id>/handoffs/stop.json
 */
export interface StopDiagnosisJson {
  /** Run identifier */
  run_id: string;

  /** Outcome of the run */
  outcome: 'stopped' | 'complete' | 'running';

  /** Original stop reason from state */
  stop_reason: string | null;

  /** High-level family of the stop reason */
  stop_reason_family: StopReasonFamily;

  /** Primary diagnosis category */
  primary_diagnosis: DiagnosisCategory;

  /** Confidence score (0-1) */
  confidence: number;

  /** Pre-filled resume command (for budget stops) */
  resume_command?: string;

  /** Signals that led to this diagnosis */
  signals: DiagnosisSignal[];

  /** Recommended next actions in priority order */
  next_actions: NextAction[];

  /** Related artifacts for debugging */
  related_artifacts: {
    /** Command to view detailed report */
    report?: string;
    /** Path to verification logs */
    verify_logs?: string;
    /** Path to worker output */
    worker_output?: string;
    /** Path to timeline */
    timeline?: string;
  };

  /** Timestamp when diagnosis was generated */
  diagnosed_at: string;
}

/**
 * Input context for diagnosis.
 */
export interface DiagnosisContext {
  runId: string;
  runDir: string;
  state: {
    phase: string;
    stop_reason?: string;
    milestone_index: number;
    milestones_total: number;
    last_error?: string;
  };
  events: Array<Record<string, unknown>>;
  configSnapshot?: Record<string, unknown>;
}
