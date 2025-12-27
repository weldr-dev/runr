/**
 * Orchestrator types for multi-track run coordination.
 *
 * The orchestrator manages parallel tracks of serial steps,
 * with collision-aware scheduling to prevent merge conflicts.
 */

import { z } from 'zod';

/**
 * A single step in a track (one task to execute).
 */
export interface Step {
  /** Path to the task .md file */
  task_path: string;
  /** Optional explicit allowlist override for this step */
  allowlist?: string[];
  /** Run ID once launched */
  run_id?: string;
  /** Run directory once launched */
  run_dir?: string;
  /** Final result when complete */
  result?: StepResult;
}

export interface StepResult {
  status: 'complete' | 'stopped' | 'timeout';
  stop_reason?: string;
  elapsed_ms: number;
}

/**
 * A track is a sequence of steps that run serially.
 * Multiple tracks can run in parallel (subject to collision policy).
 */
export interface Track {
  /** Unique track identifier */
  id: string;
  /** Human-readable track name */
  name: string;
  /** Steps to execute in order */
  steps: Step[];
  /** Current step index (0-based) */
  current_step: number;
  /** Track status */
  status: TrackStatus;
  /** Error message if blocked or failed */
  error?: string;
}

export type TrackStatus =
  | 'pending'    // Not yet started
  | 'running'    // Step currently executing
  | 'waiting'    // Blocked waiting for collision to clear
  | 'complete'   // All steps done
  | 'stopped'    // Stopped due to error/stop_reason
  | 'failed';    // Unrecoverable failure

/**
 * Collision policy for scheduling.
 */
export type CollisionPolicy =
  | 'serialize'   // Wait for colliding run to finish (default)
  | 'force'       // Force parallel with --force-parallel
  | 'fail';       // Fail the track on collision

/**
 * Orchestrator state - the complete coordination state.
 */
export interface OrchestratorState {
  /** Unique orchestrator run ID */
  orchestrator_id: string;
  /** Path to the repo being orchestrated */
  repo_path: string;
  /** All tracks */
  tracks: Track[];
  /** Currently active run IDs by track ID */
  active_runs: Record<string, string>;
  /** File claims: which run owns which file patterns */
  file_claims: Record<string, string>;
  /** Scheduling policy */
  collision_policy: CollisionPolicy;
  /** Overall status */
  status: OrchestratorStatus;
  /** Start timestamp */
  started_at: string;
  /** End timestamp */
  ended_at?: string;
  /** Time budget in minutes (applies to each run) */
  time_budget_minutes: number;
  /** Max ticks per run */
  max_ticks: number;
  /** Fast mode (skip PLAN/REVIEW phases) */
  fast?: boolean;
}

export type OrchestratorStatus =
  | 'running'    // At least one track is active
  | 'complete'   // All tracks complete
  | 'stopped'    // Stopped early (user or error)
  | 'failed';    // Unrecoverable failure

/**
 * Scheduler decision for what to do next.
 */
export interface ScheduleDecision {
  action: 'launch' | 'wait' | 'done' | 'blocked';
  /** Track to launch (if action=launch) */
  track_id?: string;
  /** Reason for waiting/blocked */
  reason?: string;
  /** Colliding run IDs (if blocked due to collision) */
  colliding_runs?: string[];
}

/**
 * Input for orchestrate command.
 */
export interface OrchestrateOptions {
  /** Path to orchestration config file (YAML or JSON) */
  config: string;
  /** Target repo path */
  repo: string;
  /** Time budget per run in minutes */
  time: number;
  /** Max ticks per run */
  maxTicks: number;
  /** Collision policy */
  collisionPolicy: CollisionPolicy;
  /** Allow dependency changes */
  allowDeps: boolean;
  /** Use worktrees for isolation */
  worktree: boolean;
  /** Fast mode (skip PLAN/REVIEW) */
  fast: boolean;
  /** Dry run - plan but don't execute */
  dryRun: boolean;
}

/**
 * Orchestration config file format.
 *
 * Example:
 * ```yaml
 * tracks:
 *   - name: "API"
 *     steps:
 *       - task: tasks/api-auth.md
 *       - task: tasks/api-endpoints.md
 *   - name: "UI"
 *     steps:
 *       - task: tasks/ui-components.md
 * ```
 */
export interface OrchestrationConfig {
  tracks: TrackConfig[];
}

export interface TrackConfig {
  name: string;
  steps: StepConfig[];
}

export interface StepConfig {
  task: string;
  allowlist?: string[];
}

// Zod schemas for validation

export const stepConfigSchema = z.object({
  task: z.string().min(1),
  allowlist: z.array(z.string()).optional()
});

export const trackConfigSchema = z.object({
  name: z.string().min(1),
  steps: z.array(stepConfigSchema).min(1)
});

export const orchestrationConfigSchema = z.object({
  tracks: z.array(trackConfigSchema).min(1)
});

export const stepResultSchema = z.object({
  status: z.enum(['complete', 'stopped', 'timeout']),
  stop_reason: z.string().optional(),
  elapsed_ms: z.number()
});

export const stepSchema = z.object({
  task_path: z.string(),
  allowlist: z.array(z.string()).optional(),
  run_id: z.string().optional(),
  run_dir: z.string().optional(),
  result: stepResultSchema.optional()
});

export const trackSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(stepSchema),
  current_step: z.number(),
  status: z.enum(['pending', 'running', 'waiting', 'complete', 'stopped', 'failed']),
  error: z.string().optional()
});

export const orchestratorStateSchema = z.object({
  orchestrator_id: z.string(),
  repo_path: z.string(),
  tracks: z.array(trackSchema),
  active_runs: z.record(z.string()),
  file_claims: z.record(z.string()),
  collision_policy: z.enum(['serialize', 'force', 'fail']),
  status: z.enum(['running', 'complete', 'stopped', 'failed']),
  started_at: z.string(),
  ended_at: z.string().optional(),
  time_budget_minutes: z.number(),
  max_ticks: z.number(),
  fast: z.boolean().optional()
});

/**
 * Orchestrator stop reason families (mirror run stop_reason_family).
 */
export type OrchestratorStopReasonFamily =
  | 'guard'
  | 'budget'
  | 'verification'
  | 'worker'
  | 'stall'
  | 'auth'
  | 'orchestrator';

/**
 * Orchestrator-level stop reasons.
 */
export type OrchestratorStopReason =
  | 'complete'                         // All tracks complete
  | 'orchestrator_track_stopped'       // A child run stopped
  | 'orchestrator_timeout'             // Time budget exhausted
  | 'orchestrator_max_ticks'           // Max ticks per run exhausted
  | 'orchestrator_blocked_on_collision'// Serialize policy couldn't progress
  | 'orchestrator_internal_error';     // Unexpected error

/**
 * Wait result for orchestrations (mirrors run WaitResult).
 */
export interface OrchestratorWaitResult {
  orchestrator_id: string;
  orchestrator_dir: string;
  repo_root: string;
  status: 'complete' | 'stopped';
  stop_reason?: OrchestratorStopReason;
  stop_reason_family?: OrchestratorStopReasonFamily;
  resume_command?: string;
  tracks: {
    completed: number;
    total: number;
  };
  steps: {
    completed: number;
    total: number;
  };
  active_runs: Record<string, string>;
  elapsed_ms: number;
  ts: string;
}

/**
 * Stop artifact with additional context.
 */
export interface OrchestratorStopArtifact extends OrchestratorWaitResult {
  blocking_run_ids?: string[];
  last_failed_track?: {
    track_id: string;
    step_index: number;
    run_id?: string;
    stop_reason?: string;
  };
}

/**
 * Summary artifact for meta-agent consumption.
 */
export interface OrchestratorSummaryArtifact {
  orchestrator_id: string;
  status: 'complete' | 'stopped';
  repo_root: string;
  started_at: string;
  ended_at: string;
  elapsed_ms: number;
  policy: {
    collision_policy: CollisionPolicy;
    time_budget_minutes: number;
    max_ticks: number;
  };
  tracks: Array<{
    track_id: string;
    name: string;
    status: TrackStatus;
    steps: Array<{
      index: number;
      task: string;
      run_id?: string;
      status: 'pending' | 'complete' | 'stopped';
      stop_reason?: string;
    }>;
  }>;
  collisions: Array<{
    run_id: string;
    conflicts_with: string[];
    stage: 'pre_plan' | 'post_plan';
    file_count: number;
    files_top: string[];
  }>;
  next_action: {
    kind: 'resume_orchestrator' | 'fix_and_resume_run' | 'none';
    command?: string;
  };
}
