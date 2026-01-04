import fs from 'node:fs';
import path from 'node:path';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { AgentConfig, agentConfigSchema } from '../config/schema.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { runSupervisorLoop } from '../supervisor/runner.js';
import { prepareForResume } from '../supervisor/state-machine.js';
import { captureFingerprint, compareFingerprints, FingerprintDiff } from '../env/fingerprint.js';
import { WorktreeInfo, validateWorktree, recreateWorktree, WorktreeRecreateResult } from '../repo/worktree.js';
import { git } from '../repo/git.js';
import { getRunsRoot } from '../store/runs-root.js';

export interface ResumeOptions {
  runId: string;
  time: number;
  maxTicks: number;
  allowDeps: boolean;
  config?: string;
  force: boolean;
  repo: string;
  autoResume: boolean;
  autoStash?: boolean;
  plan?: boolean;
  json?: boolean;
}

/**
 * Format effective configuration for display at resume.
 */
function formatResumeConfig(options: ResumeOptions): string {
  const parts = [
    `run_id=${options.runId}`,
    `time=${options.time}min`,
    `ticks=${options.maxTicks}`,
    `auto_resume=${options.autoResume ? 'on' : 'off'}`,
    `allow_deps=${options.allowDeps ? 'yes' : 'no'}`,
    `force=${options.force ? 'yes' : 'no'}`
  ];
  return `Resume: ${parts.join(' | ')}`;
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

/**
 * Resume plan with checkpoint tracking and deltas.
 */
interface ResumePlan {
  runId: string;
  checkpointSha: string | null;
  lastCheckpointMilestoneIndex: number; // -1 if none
  resumeFromMilestoneIndex: number;     // usually last+1
  remainingMilestones: number;
  checkpointSource: 'git_log_run_specific' | 'git_log_legacy' | 'none';
  delta: {
    diffstat?: string;
    lockfilesChanged: boolean;
    ignoredNoiseCount: number;
    ignoredNoiseSample: string[];
  };
}

/**
 * Extract ignored changes summary from timeline events.
 */
function getIgnoredChangesSummary(
  runId: string,
  repo: string
): { count: number; sample: string[] } | null {
  const runsRoot = getRunsRoot(repo);
  const timelinePath = path.join(runsRoot, runId, 'timeline.jsonl');

  if (!fs.existsSync(timelinePath)) {
    return null;
  }

  try {
    const lines = fs.readFileSync(timelinePath, 'utf-8').split('\n').filter(l => l.trim());
    const ignoredEvents = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(e => e && e.type === 'ignored_changes');

    if (ignoredEvents.length === 0) {
      return null;
    }

    const lastEvent = ignoredEvents[ignoredEvents.length - 1];
    const payload = lastEvent.payload as {
      ignored_count: number;
      ignored_sample: string[];
      ignore_check_status: 'ok' | 'failed';
    };

    if (payload.ignored_count === 0) {
      return null;
    }

    return {
      count: payload.ignored_count,
      sample: payload.ignored_sample
    };
  } catch {
    return null;
  }
}

/**
 * Build resume plan by discovering last checkpoint and computing deltas.
 */
async function buildResumePlan(options: {
  state: RunState;
  repoPath: string;
  runStore: RunStore;
  config: AgentConfig;
}): Promise<ResumePlan> {
  const { state, repoPath, runStore, config } = options;

  // Find last checkpoint via git log
  // Try run-specific pattern first, then fallback to legacy
  let checkpointSha: string | null = null;
  let lastCheckpointMilestoneIndex = -1;
  let checkpointSource: 'git_log_run_specific' | 'git_log_legacy' | 'none' = 'none';

  // First: try new format with run_id
  try {
    const runSpecificPattern = `^chore\\(runr\\): checkpoint ${state.run_id} milestone `;
    const result = await git(
      [
        'log',
        '-z',
        '--grep', runSpecificPattern,
        '-n', '1',
        '--pretty=format:%H%x00%s'
      ],
      repoPath
    );

    if (result.stdout.trim()) {
      const parts = result.stdout.trim().split('\0');
      checkpointSha = parts[0] || null;
      const commitMessage = parts[1] || '';

      // Extract milestone index from commit message
      // Format: "chore(runr): checkpoint <run_id> milestone <N>"
      const match = commitMessage.match(/milestone (\d+)/);
      if (match) {
        lastCheckpointMilestoneIndex = parseInt(match[1], 10);
        checkpointSource = 'git_log_run_specific';
      }
    }
  } catch {
    // Run-specific checkpoint not found
  }

  // Fallback: try legacy format (without run_id)
  if (checkpointSha === null) {
    try {
      const result = await git(
        [
          'log',
          '-z',
          '--grep', '^chore\\(agent\\): checkpoint milestone ',
          '-n', '1',
          '--pretty=format:%H%x00%s'
        ],
        repoPath
      );

      if (result.stdout.trim()) {
        const parts = result.stdout.trim().split('\0');
        checkpointSha = parts[0] || null;
        const commitMessage = parts[1] || '';

        // Extract milestone index from commit message
        // Format: "chore(agent): checkpoint milestone <N>"
        const match = commitMessage.match(/checkpoint milestone (\d+)/);
        if (match) {
          lastCheckpointMilestoneIndex = parseInt(match[1], 10);
          checkpointSource = 'git_log_legacy';
        }
      }
    } catch {
      // No checkpoint found at all, start from beginning
    }
  }

  const resumeFromMilestoneIndex = lastCheckpointMilestoneIndex + 1;
  const remainingMilestones = Math.max(0, state.milestones.length - resumeFromMilestoneIndex);

  // Compute delta
  let diffstat: string | undefined;
  let lockfilesChanged = false;

  if (checkpointSha) {
    try {
      const diffStatResult = await git(['diff', '--stat', `${checkpointSha}..HEAD`], repoPath);
      diffstat = diffStatResult.stdout.trim() || undefined;

      const diffNamesResult = await git(['diff', '--name-only', `${checkpointSha}..HEAD`], repoPath);
      const changedFiles = diffNamesResult.stdout.trim().split('\n').filter(f => f);
      lockfilesChanged = changedFiles.some(f =>
        f === 'package-lock.json' ||
        f === 'pnpm-lock.yaml' ||
        f === 'yarn.lock'
      );
    } catch {
      // Diff failed, skip deltas
    }
  }

  const ignoredSummary = getIgnoredChangesSummary(state.run_id, state.repo_path);

  return {
    runId: state.run_id,
    checkpointSha,
    lastCheckpointMilestoneIndex,
    resumeFromMilestoneIndex,
    remainingMilestones,
    checkpointSource,
    delta: {
      diffstat,
      lockfilesChanged,
      ignoredNoiseCount: ignoredSummary?.count ?? 0,
      ignoredNoiseSample: ignoredSummary?.sample ?? []
    }
  };
}

interface StashInfo {
  stashRef: string;
  stashMessage: string;
  fileCount: number;
}

/**
 * Assert working tree is clean (REFUSE policy).
 * If autoStash=true, creates stash and returns info.
 */
async function assertCleanWorkingTree(
  repoPath: string,
  options: { autoStash?: boolean; runId?: string } = {}
): Promise<StashInfo | null> {
  try {
    const statusResult = await git(['status', '--porcelain'], repoPath);
    const dirtyFiles = statusResult.stdout.trim().split('\n').filter(f => f.trim());

    if (dirtyFiles.length === 0) {
      return null; // Clean, no stash needed
    }

    // Dirty working tree detected
    if (options.autoStash) {
      // Create stash with deterministic message
      const timestamp = new Date().toISOString();
      const stashMessage = `runr-autostash-${options.runId || 'unknown'}-${timestamp}`;

      await git(['stash', 'push', '-u', '-m', stashMessage], repoPath);

      // Get stash ref (should be stash@{0} after push)
      const stashRef = 'stash@{0}';

      console.log(`Auto-stashed ${dirtyFiles.length} uncommitted change${dirtyFiles.length === 1 ? '' : 's'}`);
      console.log(`  Stash ref: ${stashRef}`);
      console.log(`  Message: ${stashMessage}`);
      console.log(`  To restore: git stash pop ${stashRef}`);

      return {
        stashRef,
        stashMessage,
        fileCount: dirtyFiles.length
      };
    }

    // Not auto-stashing, refuse with error
    const sampleFiles = dirtyFiles.slice(0, 5).map(f => f.trim());
    const hasMore = dirtyFiles.length > 5;

    let errorMessage = `Working tree has ${dirtyFiles.length} uncommitted change${dirtyFiles.length === 1 ? '' : 's'}:\n`;
    errorMessage += sampleFiles.join('\n');
    if (hasMore) {
      errorMessage += `\n... and ${dirtyFiles.length - 5} more`;
    }
    errorMessage += '\n\nRun `git stash && runr resume` to stash changes before resuming.';
    errorMessage += '\nOr use `runr resume --auto-stash` to stash automatically.';

    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Working tree has')) {
      throw error;
    }
    // Git command failed, assume clean
    return null;
  }
}

/**
 * Get working tree status (non-throwing version for plan mode).
 */
async function getWorkingTreeStatus(repoPath: string): Promise<{
  clean: boolean;
  dirtyPaths: string[];
  dirtyCount: number;
}> {
  try {
    const statusResult = await git(['status', '--porcelain'], repoPath);
    const dirtyFiles = statusResult.stdout.trim().split('\n').filter(f => f.trim());

    return {
      clean: dirtyFiles.length === 0,
      dirtyPaths: dirtyFiles.slice(0, 10), // Sample up to 10
      dirtyCount: dirtyFiles.length
    };
  } catch {
    // Git command failed, assume clean
    return {
      clean: true,
      dirtyPaths: [],
      dirtyCount: 0
    };
  }
}

/**
 * Resume plan JSON schema (v1).
 */
interface ResumePlanJson {
  schema_version: number;
  run_id: string;
  repo_path: string;
  effective_repo_path: string;
  checkpoint: {
    sha: string | null;
    milestone_index: number;
    source: 'git_log_run_specific' | 'git_log_legacy' | 'none';
  };
  resume: {
    from_milestone_index: number;
    phase: string;
    remaining_milestones: number;
  };
  repo_state: {
    working_tree_clean: boolean;
    dirty_paths_sample: string[];
    dirty_count: number;
  };
  delta: {
    diffstat?: string;
    lockfiles_changed: boolean;
    ignored_noise_count: number;
    ignored_noise_sample: string[];
  };
  warnings: string[];
}

/**
 * Format resume plan as JSON.
 */
async function formatResumePlanJson(
  plan: ResumePlan,
  state: RunState,
  effectiveRepoPath: string,
  checkpointSource: 'git_log_run_specific' | 'git_log_legacy' | 'none'
): Promise<ResumePlanJson> {
  const repoStatus = await getWorkingTreeStatus(effectiveRepoPath);
  const warnings: string[] = [];

  if (!plan.delta.diffstat && plan.checkpointSha) {
    warnings.push('Could not compute diffstat');
  }

  return {
    schema_version: 1,
    run_id: plan.runId,
    repo_path: state.repo_path,
    effective_repo_path: effectiveRepoPath,
    checkpoint: {
      sha: plan.checkpointSha,
      milestone_index: plan.lastCheckpointMilestoneIndex,
      source: checkpointSource
    },
    resume: {
      from_milestone_index: plan.resumeFromMilestoneIndex,
      phase: 'IMPLEMENT', // Resume always goes to IMPLEMENT
      remaining_milestones: plan.remainingMilestones
    },
    repo_state: {
      working_tree_clean: repoStatus.clean,
      dirty_paths_sample: repoStatus.dirtyPaths,
      dirty_count: repoStatus.dirtyCount
    },
    delta: {
      diffstat: plan.delta.diffstat,
      lockfiles_changed: plan.delta.lockfilesChanged,
      ignored_noise_count: plan.delta.ignoredNoiseCount,
      ignored_noise_sample: plan.delta.ignoredNoiseSample
    },
    warnings
  };
}

/**
 * Format resume plan for display.
 */
function formatResumePlan(plan: ResumePlan): string {
  const lines: string[] = [];

  lines.push(`Resume plan:`);
  lines.push(`  Checkpoint: ${plan.checkpointSha?.slice(0, 8) ?? 'none'} (milestone ${plan.lastCheckpointMilestoneIndex})`);
  lines.push(`  Resume from: milestone ${plan.resumeFromMilestoneIndex}`);
  lines.push(`  Remaining: ${plan.remainingMilestones} milestone${plan.remainingMilestones === 1 ? '' : 's'}`);

  if (plan.delta.lockfilesChanged) {
    lines.push(`  Delta: lockfiles changed`);
  }

  if (plan.delta.ignoredNoiseCount > 0) {
    const sample = plan.delta.ignoredNoiseSample.slice(0, 3).join(', ');
    lines.push(`  Ignored: ${plan.delta.ignoredNoiseCount} files (${sample}${plan.delta.ignoredNoiseSample.length > 3 ? ', ...' : ''})`);
  }

  return lines.join('\n');
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  // Early flag validation
  // --json implies --plan
  if (options.json) {
    options.plan = true;
  }

  // --auto-stash is incompatible with --plan (plan is read-only)
  if (options.autoStash && options.plan) {
    console.error('Error: --auto-stash cannot be used with --plan (plan mode is read-only)');
    process.exitCode = 1;
    return;
  }

  // Log effective configuration for transparency (skip in JSON mode)
  if (!options.json) {
    console.log(formatResumeConfig(options));
  }

  const runStore = RunStore.init(options.runId, options.repo);
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    if (options.json) {
      console.error(JSON.stringify({
        error: 'run_not_found',
        message: `Run state not found for ${options.runId}`
      }, null, 2));
    } else {
      throw new Error(`Run state not found for ${options.runId}`);
    }
    process.exitCode = 1;
    return;
  }

  const { config: configSnapshot, worktree: worktreeInfo} = readConfigSnapshot(runStore.path);
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

  // INSERTION 1: Dirty tree check (REFUSE policy)
  // Skip in plan mode - plan is read-only
  let stashInfo: StashInfo | null = null;
  if (!options.plan) {
    stashInfo = await assertCleanWorkingTree(effectiveRepoPath, {
      autoStash: options.autoStash,
      runId: options.runId
    });
  }

  // INSERTION 2: Build and print resume plan
  const plan = await buildResumePlan({
    state,
    repoPath: effectiveRepoPath,
    runStore,
    config
  });

  // If --plan mode, output plan and exit
  if (options.plan) {
    if (options.json) {
      const planJson = await formatResumePlanJson(
        plan,
        state,
        effectiveRepoPath,
        plan.checkpointSource
      );
      console.log(JSON.stringify(planJson, null, 2));
    } else {
      console.log(formatResumePlan(plan));
    }
    return;
  }

  // Not in plan mode - print plan in text format
  console.log(formatResumePlan(plan));

  // Use shared helper to prepare state for resume
  const updated = prepareForResume(state, { resumeToken: options.runId });

  // Override milestone_index and phase from plan (fixes FINALIZE bug)
  updated.milestone_index = plan.resumeFromMilestoneIndex;
  updated.phase = plan.resumeFromMilestoneIndex >= state.milestones.length ? 'FINALIZE' : 'IMPLEMENT';

  runStore.writeState(updated);

  // INSERTION 3: Resume provenance event
  runStore.appendEvent({
    type: 'resume',
    source: 'cli',
    payload: {
      checkpoint_sha: plan.checkpointSha,
      last_checkpoint_milestone_index: plan.lastCheckpointMilestoneIndex,
      resume_from_milestone_index: plan.resumeFromMilestoneIndex,
      remaining_milestones: plan.remainingMilestones,
      delta: {
        lockfiles_changed: plan.delta.lockfilesChanged,
        ignored_noise_count: plan.delta.ignoredNoiseCount,
        ignored_noise_sample: plan.delta.ignoredNoiseSample
      }
    }
  });

  // Record auto-stash if it happened
  if (stashInfo) {
    runStore.appendEvent({
      type: 'auto_stash_created',
      source: 'cli',
      payload: {
        stash_ref: stashInfo.stashRef,
        stash_message: stashInfo.stashMessage,
        file_count: stashInfo.fileCount
      }
    });
  }

  runStore.appendEvent({
    type: 'run_resumed',
    source: 'cli',
    payload: {
      run_id: options.runId,
      max_ticks: options.maxTicks,
      time: options.time,
      allow_deps: options.allowDeps,
      auto_resume: options.autoResume,
      resume_phase: updated.phase
    }
  });

  await runSupervisorLoop({
    runStore,
    repoPath: effectiveRepoPath,
    taskText,
    config,
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    allowDeps: options.allowDeps,
    autoResume: options.autoResume
  });
}
