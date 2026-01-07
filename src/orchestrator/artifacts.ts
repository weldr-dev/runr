/**
 * Orchestrator terminal artifacts.
 *
 * Handles writing complete.json, stop.json, summary.json, and orchestration.md
 * with proper ordering (summary first, terminal marker last).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  OrchestratorState,
  OrchestratorWaitResult,
  OrchestratorStopArtifact,
  OrchestratorSummaryArtifact,
  OrchestratorStopReason,
  OrchestratorStopReasonFamily,
  Track,
  ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION
} from './types.js';
import { getOrchestrationsRoot, getLegacyOrchestrationsRoot } from '../store/runs-root.js';

/**
 * Get the orchestration directory for a given orchestrator ID.
 * Uses new canonical path: .agent/orchestrations/<orchId>
 */
export function getOrchestrationDir(repoPath: string, orchestratorId: string): string {
  return path.join(getOrchestrationsRoot(repoPath), orchestratorId);
}

/**
 * Get the legacy orchestration directory (for migration).
 * Old path was: .agent/runs/orchestrations/<orchId>
 */
export function getLegacyOrchestrationDir(repoPath: string, orchestratorId: string): string {
  return path.join(getLegacyOrchestrationsRoot(repoPath), orchestratorId);
}

/**
 * Migrate orchestration from legacy path to new path if needed.
 * Returns true if migration occurred.
 */
export function migrateOrchestrationIfNeeded(repoPath: string, orchestratorId: string): boolean {
  const newDir = getOrchestrationDir(repoPath, orchestratorId);
  const legacyDir = getLegacyOrchestrationDir(repoPath, orchestratorId);

  // Already at new location - nothing to do
  if (fs.existsSync(newDir)) {
    return false;
  }

  // Check if exists at legacy location
  if (!fs.existsSync(legacyDir)) {
    return false;
  }

  // Migrate: copy to new location, then remove old
  console.log(`Migrating orchestration ${orchestratorId} to new path structure...`);

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(newDir), { recursive: true });

  // Copy recursively
  copyDirRecursive(legacyDir, newDir);

  // Remove old directory
  fs.rmSync(legacyDir, { recursive: true, force: true });

  // Clean up empty legacy orchestrations dir if empty
  const legacyRoot = getLegacyOrchestrationsRoot(repoPath);
  try {
    const remaining = fs.readdirSync(legacyRoot);
    if (remaining.length === 0) {
      fs.rmdirSync(legacyRoot);
    }
  } catch {
    // Ignore if can't clean up
  }

  console.log(`  Migrated to: ${newDir}`);
  return true;
}

/**
 * Find orchestration directory, checking both new and legacy paths.
 * Automatically migrates if found at legacy location.
 */
export function findOrchestrationDir(repoPath: string, orchestratorId: string): string | null {
  const newDir = getOrchestrationDir(repoPath, orchestratorId);

  // Check new location first
  if (fs.existsSync(newDir)) {
    return newDir;
  }

  // Check legacy location and migrate if found
  const legacyDir = getLegacyOrchestrationDir(repoPath, orchestratorId);
  if (fs.existsSync(legacyDir)) {
    migrateOrchestrationIfNeeded(repoPath, orchestratorId);
    return getOrchestrationDir(repoPath, orchestratorId);
  }

  return null;
}

/**
 * Copy directory recursively.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get the handoffs directory for terminal artifacts.
 */
export function getHandoffsDir(repoPath: string, orchestratorId: string): string {
  return path.join(getOrchestrationDir(repoPath, orchestratorId), 'handoffs');
}

/**
 * Ensure orchestration directories exist.
 */
export function ensureOrchestrationDirs(repoPath: string, orchestratorId: string): void {
  const orchDir = getOrchestrationDir(repoPath, orchestratorId);
  const handoffsDir = getHandoffsDir(repoPath, orchestratorId);
  fs.mkdirSync(orchDir, { recursive: true });
  fs.mkdirSync(handoffsDir, { recursive: true });
}

/**
 * Determine stop reason family from stop reason.
 */
function getStopReasonFamily(stopReason?: OrchestratorStopReason): OrchestratorStopReasonFamily | undefined {
  if (!stopReason || stopReason === 'complete') return undefined;

  switch (stopReason) {
    case 'orchestrator_timeout':
    case 'orchestrator_max_ticks':
      return 'budget';
    case 'orchestrator_track_stopped':
    case 'orchestrator_blocked_on_collision':
    case 'orchestrator_internal_error':
      return 'orchestrator';
    default:
      return 'orchestrator';
  }
}

/**
 * Find the first failed track for stop artifact context.
 */
function findFailedTrack(state: OrchestratorState): OrchestratorStopArtifact['last_failed_track'] | undefined {
  for (const track of state.tracks) {
    if (track.status === 'stopped' || track.status === 'failed') {
      const failedStep = track.steps.find(s => s.result?.status !== 'complete');
      const stepIndex = failedStep ? track.steps.indexOf(failedStep) : track.current_step;
      const step = track.steps[stepIndex];
      return {
        track_id: track.id,
        step_index: stepIndex,
        run_id: step?.run_id,
        stop_reason: step?.result?.stop_reason
      };
    }
  }
  return undefined;
}

/**
 * Determine the orchestrator-level stop reason from state.
 */
export function determineStopReason(state: OrchestratorState): OrchestratorStopReason {
  if (state.status === 'complete') return 'complete';

  // Check for specific failure modes
  const failedTrack = state.tracks.find(t => t.status === 'failed' || t.status === 'stopped');
  if (failedTrack) {
    const failedStep = failedTrack.steps.find(s => s.result?.status !== 'complete');
    if (failedStep?.result?.stop_reason?.includes('collision')) {
      return 'orchestrator_blocked_on_collision';
    }
    return 'orchestrator_track_stopped';
  }

  return 'orchestrator_internal_error';
}

/**
 * Build OrchestratorWaitResult from state.
 */
export function buildWaitResult(
  state: OrchestratorState,
  repoPath: string
): OrchestratorWaitResult {
  const orchDir = getOrchestrationDir(repoPath, state.orchestrator_id);
  const startTime = new Date(state.started_at).getTime();
  const endTime = state.ended_at ? new Date(state.ended_at).getTime() : Date.now();

  const completedTracks = state.tracks.filter(t => t.status === 'complete').length;
  const completedSteps = state.tracks.reduce(
    (sum, t) => sum + t.steps.filter(s => s.result?.status === 'complete').length,
    0
  );
  const totalSteps = state.tracks.reduce((sum, t) => sum + t.steps.length, 0);

  const isComplete = state.status === 'complete';
  const stopReason = isComplete ? undefined : determineStopReason(state);

  const result: OrchestratorWaitResult = {
    schema_version: ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION,
    orchestrator_id: state.orchestrator_id,
    orchestrator_dir: orchDir,
    repo_root: path.resolve(repoPath),
    status: isComplete ? 'complete' : 'stopped',
    tracks: {
      completed: completedTracks,
      total: state.tracks.length
    },
    steps: {
      completed: completedSteps,
      total: totalSteps
    },
    active_runs: state.active_runs,
    elapsed_ms: endTime - startTime,
    ts: new Date().toISOString()
  };

  if (!isComplete) {
    result.stop_reason = stopReason;
    result.stop_reason_family = getStopReasonFamily(stopReason);
    result.resume_command = `agent orchestrate resume ${state.orchestrator_id} --repo ${repoPath}`;
  }

  return result;
}

/**
 * Build stop artifact with additional context.
 */
export function buildStopArtifact(
  state: OrchestratorState,
  repoPath: string
): OrchestratorStopArtifact {
  const waitResult = buildWaitResult(state, repoPath);
  const lastFailedTrack = findFailedTrack(state);

  return {
    ...waitResult,
    last_failed_track: lastFailedTrack
  };
}

/**
 * Build summary artifact for meta-agent consumption.
 */
export function buildSummaryArtifact(
  state: OrchestratorState,
  repoPath: string
): OrchestratorSummaryArtifact {
  const startTime = new Date(state.started_at).getTime();
  const endTime = state.ended_at ? new Date(state.ended_at).getTime() : Date.now();
  const isComplete = state.status === 'complete';

  const tracks = state.tracks.map(track => ({
    track_id: track.id,
    name: track.name,
    status: track.status,
    steps: track.steps.map((step, idx) => ({
      index: idx,
      task: step.task_path,
      run_id: step.run_id,
      status: step.result?.status === 'complete'
        ? 'complete' as const
        : step.result
          ? 'stopped' as const
          : 'pending' as const,
      stop_reason: step.result?.stop_reason
    }))
  }));

  // Determine next action
  let nextAction: OrchestratorSummaryArtifact['next_action'];
  if (isComplete) {
    nextAction = { kind: 'none' };
  } else {
    const failedTrack = findFailedTrack(state);
    if (failedTrack?.run_id) {
      nextAction = {
        kind: 'fix_and_resume_run',
        command: `agent resume ${failedTrack.run_id} --repo ${repoPath}`
      };
    } else {
      nextAction = {
        kind: 'resume_orchestrator',
        command: `agent orchestrate resume ${state.orchestrator_id} --repo ${repoPath}`
      };
    }
  }

  return {
    schema_version: ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION,
    orchestrator_id: state.orchestrator_id,
    status: isComplete ? 'complete' : 'stopped',
    repo_root: path.resolve(repoPath),
    started_at: state.started_at,
    ended_at: state.ended_at ?? new Date().toISOString(),
    elapsed_ms: endTime - startTime,
    policy: {
      collision_policy: state.collision_policy,
      time_budget_minutes: state.time_budget_minutes,
      max_ticks: state.max_ticks
    },
    tracks,
    collisions: [], // TODO: Track collisions during orchestration
    next_action: nextAction
  };
}

/**
 * Generate human-readable orchestration.md summary.
 */
export function generateOrchestrationMarkdown(
  state: OrchestratorState,
  summary: OrchestratorSummaryArtifact
): string {
  const lines: string[] = [];

  // Header
  const statusEmoji = summary.status === 'complete' ? '✓' : '✗';
  lines.push(`# Orchestration ${statusEmoji} ${summary.status.toUpperCase()}`);
  lines.push('');
  lines.push(`**ID:** ${summary.orchestrator_id}`);
  lines.push(`**Repo:** ${summary.repo_root}`);
  lines.push(`**Duration:** ${Math.round(summary.elapsed_ms / 1000)}s`);
  lines.push('');

  // Policy
  lines.push('## Configuration');
  lines.push('');
  lines.push(`- Collision policy: ${summary.policy.collision_policy}`);
  lines.push(`- Run time limit: ${summary.policy.time_budget_minutes}min (each run)`);
  lines.push(`- Run tick limit: ${summary.policy.max_ticks} (each run)`);
  lines.push('');

  // Tracks table
  lines.push('## Tracks');
  lines.push('');
  lines.push('| Track | Status | Steps | Run IDs |');
  lines.push('|-------|--------|-------|---------|');

  for (const track of summary.tracks) {
    const completedSteps = track.steps.filter(s => s.status === 'complete').length;
    const runIds = track.steps
      .filter(s => s.run_id)
      .map(s => s.run_id)
      .join(', ') || '-';
    lines.push(`| ${track.name} | ${track.status} | ${completedSteps}/${track.steps.length} | ${runIds} |`);
  }
  lines.push('');

  // Step details
  lines.push('## Step Details');
  lines.push('');
  for (const track of summary.tracks) {
    lines.push(`### ${track.name}`);
    lines.push('');
    for (const step of track.steps) {
      const statusMark = step.status === 'complete' ? '✓' : step.status === 'stopped' ? '✗' : '○';
      const runInfo = step.run_id ? ` → ${step.run_id}` : '';
      const stopInfo = step.stop_reason ? ` (${step.stop_reason})` : '';
      lines.push(`${step.index + 1}. ${statusMark} ${step.task}${runInfo}${stopInfo}`);
    }
    lines.push('');
  }

  // Collisions
  if (summary.collisions.length > 0) {
    lines.push('## Collisions Encountered');
    lines.push('');
    for (const collision of summary.collisions) {
      lines.push(`- Run ${collision.run_id} conflicted with ${collision.conflicts_with.join(', ')}`);
      lines.push(`  - Stage: ${collision.stage}, Files: ${collision.file_count}`);
    }
    lines.push('');
  }

  // Next action
  if (summary.next_action.kind !== 'none') {
    lines.push('## Next Action');
    lines.push('');
    if (summary.next_action.kind === 'resume_orchestrator') {
      lines.push('Resume the orchestration:');
    } else {
      lines.push('Fix the failed run and resume:');
    }
    lines.push('');
    lines.push('```bash');
    lines.push(summary.next_action.command!);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write all terminal artifacts in correct order.
 *
 * Order is critical:
 * 1. summary.json
 * 2. orchestration.md
 * 3. receipt.json and receipt.md
 * 4. complete.json OR stop.json (LAST - signals terminal)
 */
export function writeTerminalArtifacts(
  state: OrchestratorState,
  repoPath: string
): void {
  const handoffsDir = getHandoffsDir(repoPath, state.orchestrator_id);
  const orchDir = getOrchestrationDir(repoPath, state.orchestrator_id);
  fs.mkdirSync(handoffsDir, { recursive: true });

  const isComplete = state.status === 'complete';

  // 1. Write summary.json
  const summary = buildSummaryArtifact(state, repoPath);
  fs.writeFileSync(
    path.join(handoffsDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // 2. Write orchestration.md
  const markdown = generateOrchestrationMarkdown(state, summary);
  fs.writeFileSync(
    path.join(handoffsDir, 'orchestration.md'),
    markdown
  );

  // 3. Write receipt artifacts (manager dashboard)
  try {
    // Dynamic import to avoid circular dependency
    import('./receipt.js').then(({ buildReceipt, writeReceipt }) => {
      const receipt = buildReceipt(state, repoPath);
      writeReceipt(receipt, repoPath);
    }).catch(() => {
      // Ignore receipt generation errors - not critical
    });
  } catch {
    // Ignore receipt generation errors - not critical
  }

  // 4. Write complete.json OR stop.json (LAST)
  if (isComplete) {
    const completeArtifact = buildWaitResult(state, repoPath);
    fs.writeFileSync(
      path.join(handoffsDir, 'complete.json'),
      JSON.stringify(completeArtifact, null, 2)
    );
  } else {
    const stopArtifact = buildStopArtifact(state, repoPath);
    fs.writeFileSync(
      path.join(handoffsDir, 'stop.json'),
      JSON.stringify(stopArtifact, null, 2)
    );
  }
}

/**
 * Check if orchestration has terminal artifacts (fast check).
 */
export function hasTerminalArtifact(repoPath: string, orchestratorId: string): {
  terminal: boolean;
  status?: 'complete' | 'stopped';
} {
  const handoffsDir = getHandoffsDir(repoPath, orchestratorId);

  if (fs.existsSync(path.join(handoffsDir, 'complete.json'))) {
    return { terminal: true, status: 'complete' };
  }
  if (fs.existsSync(path.join(handoffsDir, 'stop.json'))) {
    return { terminal: true, status: 'stopped' };
  }

  return { terminal: false };
}

/**
 * Read terminal artifact if it exists.
 */
export function readTerminalArtifact(
  repoPath: string,
  orchestratorId: string
): OrchestratorWaitResult | OrchestratorStopArtifact | null {
  const handoffsDir = getHandoffsDir(repoPath, orchestratorId);

  const completePath = path.join(handoffsDir, 'complete.json');
  if (fs.existsSync(completePath)) {
    return JSON.parse(fs.readFileSync(completePath, 'utf-8'));
  }

  const stopPath = path.join(handoffsDir, 'stop.json');
  if (fs.existsSync(stopPath)) {
    return JSON.parse(fs.readFileSync(stopPath, 'utf-8'));
  }

  return null;
}
