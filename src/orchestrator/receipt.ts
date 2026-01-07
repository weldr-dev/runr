/**
 * Orchestration Receipt Generator.
 *
 * Produces "manager dashboard" artifacts that summarize an orchestration:
 * - receipt.json: Machine-readable summary with task outcomes, interventions, and issues
 * - receipt.md: Human-readable markdown summary
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  OrchestratorState,
  Track
} from './types.js';
import { getOrchestrationDir, findOrchestrationDir } from './artifacts.js';
import { loadOrchestratorState, findLatestOrchestrationId } from './state-machine.js';
import { getRunsRoot } from '../store/runs-root.js';

export const RECEIPT_SCHEMA_VERSION = '1';

/**
 * Task entry in the receipt.
 */
export interface ReceiptTask {
  task_path: string;
  run_id: string | undefined;
  status: 'finished' | 'stopped' | 'pending';
  stop_reason: string | undefined;
  milestones_completed: number;
  checkpoint_sha: string | undefined;
  duration_ms: number;
  intervention?: {
    receipt_path: string;
    reason: string;
  };
}

/**
 * Stop reason aggregation.
 */
export interface StopReasonEntry {
  reason: string;
  count: number;
  suggested_fix: string;
}

/**
 * Receipt JSON schema.
 */
export interface OrchestrationReceipt {
  schema_version: string;
  orchestration_id: string;
  started_at: string;
  completed_at: string | undefined;
  duration_ms: number;

  summary: {
    tasks_total: number;
    tasks_completed: number;
    tasks_stopped: number;
    tasks_pending: number;
    interventions_count: number;
    total_checkpoints: number;
  };

  tasks: ReceiptTask[];

  top_stop_reasons: StopReasonEntry[];
}

/**
 * Suggested fixes for common stop reasons.
 */
const STOP_REASON_FIXES: Record<string, string> = {
  'review_loop_detected': 'Check reviewer expectations match verifier output',
  'max_ticks_reached': 'Consider increasing --max-ticks or breaking into smaller tasks',
  'time_budget_exceeded': 'Consider increasing --time or simplifying the task',
  'verification_failed': 'Review verification commands and fix failing tests',
  'user_stop': 'Task was stopped by user request',
  'collision_detected': 'Ensure tasks have non-overlapping ownership declarations'
};

/**
 * Get suggested fix for a stop reason.
 */
function getSuggestedFix(reason: string): string {
  return STOP_REASON_FIXES[reason] ?? 'Review run logs for details';
}

/**
 * Find intervention receipt for a run.
 */
function findIntervention(repoPath: string, runId: string): ReceiptTask['intervention'] | undefined {
  const runsRoot = getRunsRoot(repoPath);
  const runDir = path.join(runsRoot, runId);
  const interventionsDir = path.join(runDir, 'interventions');

  if (!fs.existsSync(interventionsDir)) {
    return undefined;
  }

  // Find any intervention receipt
  try {
    const entries = fs.readdirSync(interventionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const receiptPath = path.join(interventionsDir, entry.name, 'intervention-receipt.json');
        if (fs.existsSync(receiptPath)) {
          try {
            const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
            return {
              receipt_path: path.relative(repoPath, receiptPath),
              reason: receipt.reason ?? 'unknown'
            };
          } catch {
            return {
              receipt_path: path.relative(repoPath, receiptPath),
              reason: 'unknown'
            };
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return undefined;
}

/**
 * Read run state to get checkpoint SHA and milestones.
 */
function getRunDetails(repoPath: string, runId: string): { checkpointSha?: string; milestones: number } {
  const runsRoot = getRunsRoot(repoPath);
  const stateFile = path.join(runsRoot, runId, 'state.json');

  if (!fs.existsSync(stateFile)) {
    return { milestones: 0 };
  }

  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    return {
      checkpointSha: state.checkpoint_commit_sha,
      milestones: state.completed_milestones ?? 0
    };
  } catch {
    return { milestones: 0 };
  }
}

/**
 * Build receipt task entry from track step.
 */
function buildReceiptTask(
  repoPath: string,
  step: Track['steps'][number],
  track: Track
): ReceiptTask {
  const runId = step.run_id;
  const result = step.result;

  // Determine status
  let status: ReceiptTask['status'] = 'pending';
  if (result) {
    status = result.status === 'complete' ? 'finished' : 'stopped';
  }

  // Get run details
  const details = runId ? getRunDetails(repoPath, runId) : { milestones: 0 };

  // Find intervention
  const intervention = runId ? findIntervention(repoPath, runId) : undefined;

  return {
    task_path: step.task_path,
    run_id: runId,
    status,
    stop_reason: result?.stop_reason,
    milestones_completed: details.milestones,
    checkpoint_sha: details.checkpointSha,
    duration_ms: result?.elapsed_ms ?? 0,
    intervention
  };
}

/**
 * Aggregate stop reasons across all tasks.
 */
function aggregateStopReasons(tasks: ReceiptTask[]): StopReasonEntry[] {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    if (task.stop_reason) {
      counts.set(task.stop_reason, (counts.get(task.stop_reason) ?? 0) + 1);
    }
  }

  // Sort by count descending
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      suggested_fix: getSuggestedFix(reason)
    }));
}

/**
 * Build receipt from orchestrator state.
 */
export function buildReceipt(state: OrchestratorState, repoPath: string): OrchestrationReceipt {
  const startTime = new Date(state.started_at).getTime();
  const endTime = state.ended_at ? new Date(state.ended_at).getTime() : Date.now();

  // Build task list
  const tasks: ReceiptTask[] = [];
  for (const track of state.tracks) {
    for (const step of track.steps) {
      tasks.push(buildReceiptTask(repoPath, step, track));
    }
  }

  // Count outcomes
  const tasksCompleted = tasks.filter(t => t.status === 'finished').length;
  const tasksStopped = tasks.filter(t => t.status === 'stopped').length;
  const tasksPending = tasks.filter(t => t.status === 'pending').length;
  const interventionsCount = tasks.filter(t => t.intervention).length;
  const totalCheckpoints = tasks.filter(t => t.checkpoint_sha).length;

  // Aggregate stop reasons
  const topStopReasons = aggregateStopReasons(tasks);

  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    orchestration_id: state.orchestrator_id,
    started_at: state.started_at,
    completed_at: state.ended_at,
    duration_ms: endTime - startTime,
    summary: {
      tasks_total: tasks.length,
      tasks_completed: tasksCompleted,
      tasks_stopped: tasksStopped,
      tasks_pending: tasksPending,
      interventions_count: interventionsCount,
      total_checkpoints: totalCheckpoints
    },
    tasks,
    top_stop_reasons: topStopReasons
  };
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Generate markdown receipt from JSON receipt.
 */
export function generateReceiptMarkdown(receipt: OrchestrationReceipt): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Orchestration Receipt: ${receipt.orchestration_id}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Duration | ${formatDuration(receipt.duration_ms)} |`);
  lines.push(`| Tasks | ${receipt.summary.tasks_completed}/${receipt.summary.tasks_total} completed |`);
  lines.push(`| Checkpoints | ${receipt.summary.total_checkpoints} |`);
  lines.push(`| Interventions | ${receipt.summary.interventions_count} |`);
  lines.push('');

  // Tasks section
  lines.push('## Tasks');
  lines.push('');

  for (const task of receipt.tasks) {
    const statusIcon = task.status === 'finished' ? '✓' : task.status === 'stopped' ? '⚠' : '○';
    const taskName = path.basename(task.task_path);
    lines.push(`### ${statusIcon} ${taskName}`);

    if (task.run_id) {
      lines.push(`- Run: ${task.run_id}`);
    }

    lines.push(`- Status: ${task.status}${task.stop_reason ? ` (${task.stop_reason})` : ''}`);

    if (task.checkpoint_sha) {
      lines.push(`- Checkpoint: ${task.checkpoint_sha.slice(0, 7)}`);
    }

    if (task.intervention) {
      lines.push(`- Intervention: ${task.intervention.reason}`);
    }

    lines.push('');
  }

  // Top issues
  if (receipt.top_stop_reasons.length > 0) {
    lines.push('## Top Issues');
    lines.push('');

    for (let i = 0; i < receipt.top_stop_reasons.length; i++) {
      const entry = receipt.top_stop_reasons[i];
      lines.push(`${i + 1}. **${entry.reason}** (${entry.count} occurrence${entry.count > 1 ? 's' : ''})`);
      lines.push(`   - Suggested: ${entry.suggested_fix}`);
    }
    lines.push('');
  }

  // Next steps
  if (receipt.summary.tasks_stopped > 0) {
    lines.push('## Next Steps');
    lines.push('');
    const stoppedTasks = receipt.tasks.filter(t => t.status === 'stopped');
    for (const task of stoppedTasks) {
      lines.push(`- Review stopped task: ${path.basename(task.task_path)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write receipt artifacts to orchestration directory.
 */
export function writeReceipt(receipt: OrchestrationReceipt, repoPath: string): { json: string; md: string } {
  const orchDir = getOrchestrationDir(repoPath, receipt.orchestration_id);
  fs.mkdirSync(orchDir, { recursive: true });

  const jsonPath = path.join(orchDir, 'receipt.json');
  const mdPath = path.join(orchDir, 'receipt.md');

  fs.writeFileSync(jsonPath, JSON.stringify(receipt, null, 2));
  fs.writeFileSync(mdPath, generateReceiptMarkdown(receipt));

  return { json: jsonPath, md: mdPath };
}

/**
 * Load existing receipt if available.
 */
export function loadReceipt(repoPath: string, orchestratorId: string): OrchestrationReceipt | null {
  const orchDir = findOrchestrationDir(repoPath, orchestratorId);
  if (!orchDir) {
    return null;
  }

  const receiptPath = path.join(orchDir, 'receipt.json');
  if (!fs.existsSync(receiptPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Generate or load receipt for an orchestration.
 */
export function getReceipt(repoPath: string, orchestratorId: string): OrchestrationReceipt | null {
  // Resolve "latest"
  let resolvedId = orchestratorId;
  if (orchestratorId === 'latest') {
    const latest = findLatestOrchestrationId(repoPath);
    if (!latest) {
      return null;
    }
    resolvedId = latest;
  }

  // Try to load existing receipt
  const existing = loadReceipt(repoPath, resolvedId);
  if (existing) {
    return existing;
  }

  // Generate from state
  const state = loadOrchestratorState(resolvedId, repoPath);
  if (!state) {
    return null;
  }

  return buildReceipt(state, repoPath);
}
