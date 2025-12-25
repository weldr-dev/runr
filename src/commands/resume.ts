import fs from 'node:fs';
import path from 'node:path';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { AgentConfig, agentConfigSchema } from '../config/schema.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { runSupervisorLoop } from '../supervisor/runner.js';
import { captureFingerprint, compareFingerprints, FingerprintDiff } from '../env/fingerprint.js';
import { WorktreeInfo, validateWorktree, recreateWorktree, WorktreeRecreateResult } from '../repo/worktree.js';

export interface ResumeOptions {
  runId: string;
  time: number;
  maxTicks: number;
  allowDeps: boolean;
  config?: string;
  force: boolean;
}

interface ConfigSnapshotWithWorktree extends AgentConfig {
  _worktree?: WorktreeInfo;
}

function readConfigSnapshot(runDir: string): { config: AgentConfig | null; worktree: WorktreeInfo | null } {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    return { config: null, worktree: null };
  }
  const raw = fs.readFileSync(snapshotPath, 'utf-8');
  const parsed = JSON.parse(raw) as ConfigSnapshotWithWorktree;

  // Extract worktree info before parsing config
  const worktree = parsed._worktree ?? null;
  delete parsed._worktree;

  // Parse the config without worktree field
  const config = agentConfigSchema.parse(parsed);
  return { config, worktree };
}

function readTaskArtifact(runDir: string): string {
  const taskPath = path.join(runDir, 'artifacts', 'task.md');
  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task artifact not found: ${taskPath}`);
  }
  return fs.readFileSync(taskPath, 'utf-8');
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const runStore = RunStore.init(options.runId);
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    throw new Error(`Run state not found for ${options.runId}`);
  }

  const { config: configSnapshot, worktree: worktreeInfo } = readConfigSnapshot(runStore.path);
  const config =
    configSnapshot ??
    loadConfig(resolveConfigPath(state.repo_path, options.config));
  const taskText = readTaskArtifact(runStore.path);

  // Handle worktree reattachment if this run used a worktree
  let effectiveRepoPath = state.repo_path;
  if (worktreeInfo?.worktree_enabled) {
    try {
      const result = await recreateWorktree(worktreeInfo, options.force);

      if (result.recreated) {
        console.log(`Worktree recreated: ${worktreeInfo.effective_repo_path}`);
        runStore.appendEvent({
          type: 'worktree_recreated',
          source: 'cli',
          payload: {
            worktree_path: worktreeInfo.effective_repo_path,
            base_sha: worktreeInfo.base_sha
          }
        });
      }

      if (result.branchMismatch) {
        runStore.appendEvent({
          type: 'worktree_branch_mismatch',
          source: 'cli',
          payload: {
            expected_branch: worktreeInfo.run_branch,
            force_used: true
          }
        });
      }

      if (result.nodeModulesSymlinked) {
        runStore.appendEvent({
          type: 'node_modules_symlinked',
          source: 'cli',
          payload: {
            worktree_path: worktreeInfo.effective_repo_path
          }
        });
      }

      effectiveRepoPath = result.info.effective_repo_path;
      console.log(`Using worktree: ${effectiveRepoPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to recreate worktree: ${message}`);
      console.error('Run with --force to override, or start fresh with: node dist/cli.js run --worktree ...');
      process.exitCode = 1;
      return;
    }
  }

  // Check environment fingerprint
  const originalFingerprint = runStore.readFingerprint();
  if (originalFingerprint) {
    const currentFingerprint = await captureFingerprint(config, effectiveRepoPath);
    const diffs = compareFingerprints(originalFingerprint, currentFingerprint);
    if (diffs.length > 0) {
      console.warn('Environment fingerprint mismatch:');
      for (const diff of diffs) {
        console.warn(`  ${diff.field}: ${diff.original ?? 'null'} -> ${diff.current ?? 'null'}`);
      }
      if (!options.force) {
        console.error('\nRun with --force to resume despite fingerprint mismatch.');
        process.exitCode = 1;
        return;
      }
      console.warn('\nWARNING: Forcing resume despite environment mismatch (--force)\n');
    }
  }

  // Determine the phase to resume from
  let resumePhase = state.phase;
  if (state.phase === 'STOPPED' && state.last_successful_phase) {
    // Resume from the phase after the last successful one
    const phaseOrder = ['INIT', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'CHECKPOINT'];
    const lastIdx = phaseOrder.indexOf(state.last_successful_phase);
    if (lastIdx >= 0 && lastIdx < phaseOrder.length - 1) {
      resumePhase = phaseOrder[lastIdx + 1] as RunState['phase'];
    } else {
      resumePhase = state.last_successful_phase;
    }
  }

  const updated: RunState = {
    ...state,
    phase: resumePhase,
    resume_token: options.runId,
    updated_at: new Date().toISOString(),
    last_error: undefined,
    stop_reason: undefined
  };

  runStore.writeState(updated);
  runStore.appendEvent({
    type: 'run_resumed',
    source: 'cli',
    payload: {
      run_id: options.runId,
      max_ticks: options.maxTicks,
      time: options.time,
      allow_deps: options.allowDeps
    }
  });

  await runSupervisorLoop({
    runStore,
    repoPath: effectiveRepoPath,
    taskText,
    config,
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    allowDeps: options.allowDeps
  });
}
