import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { RunStore } from '../store/run-store.js';
import { getRunsRoot } from '../store/runs-root.js';
import { git, gitOptional } from '../repo/git.js';
import { createWorktree, WorktreeInfo } from '../repo/worktree.js';
import { buildMilestonesFromTask } from '../supervisor/planner.js';
import { createInitialState, stopRun, updatePhase } from '../supervisor/state-machine.js';
import { runPreflight } from './preflight.js';
import { runSupervisorLoop } from '../supervisor/runner.js';
import { runDoctorChecks, WorkerCheck } from './doctor.js';
import { captureFingerprint } from '../env/fingerprint.js';
import { loadTaskMetadata } from '../tasks/task-metadata.js';
import {
  getActiveRuns,
  checkAllowlistOverlaps,
  formatAllowlistWarning
} from '../supervisor/collision.js';

export interface RunOptions {
  repo: string;
  task: string;
  time: number;
  config?: string;
  allowDeps: boolean;
  allowDirty: boolean;
  web: boolean;
  dryRun: boolean;
  noBranch: boolean;
  noWrite: boolean;
  maxTicks: number;
  skipDoctor: boolean;
  freshTarget: boolean;
  worktree: boolean;
  fast: boolean;
  autoResume: boolean;
  forceParallel: boolean;
  json: boolean;
}

export interface RunJsonOutput {
  run_id: string;
  run_dir: string;
  repo_root: string;
  status: 'started' | 'guard_failed' | 'dry_run';
  guard_ok?: boolean;
  tiers?: string[];
}

function makeRunId(): string {
  const now = new Date();
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function slugFromTask(taskPath: string): string {
  const base = path.basename(taskPath, path.extname(taskPath));
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

async function ensureRunBranch(
  gitRoot: string,
  runBranch: string,
  defaultBranch: string
): Promise<void> {
  const existing = await gitOptional(['branch', '--list', runBranch], gitRoot);
  if (existing?.stdout?.trim()) {
    await git(['checkout', runBranch], gitRoot);
    return;
  }
  await git(['checkout', '-b', runBranch, defaultBranch], gitRoot);
}

function formatSummaryLine(input: {
  runId: string;
  runDir: string;
  repoRoot: string;
  currentBranch: string;
  plannedRunBranch: string;
  guardOk: boolean;
  tiers: string[];
  tierReasons: string[];
  noWrite: boolean;
}): string {
  return [
    `run_id=${input.runId}`,
    `run_dir=${input.runDir}`,
    `repo_root=${input.repoRoot}`,
    `current_branch=${input.currentBranch}`,
    `planned_run_branch=${input.plannedRunBranch}`,
    `guard=${input.guardOk ? 'pass' : 'fail'}`,
    `tiers=${input.tiers.join('|')}`,
    `tier_reasons=${input.tierReasons.join('|') || 'none'}`,
    `no_write=${input.noWrite ? 'true' : 'false'}`
  ].join(' ');
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Format effective configuration for display at run start.
 * Shows key settings to eliminate "is it broken?" confusion.
 */
function formatEffectiveConfig(options: RunOptions): string {
  const contextPack = process.env.CONTEXT_PACK === '1' ? 'on' : 'off';
  const parts = [
    `time=${options.time}min`,
    `ticks=${options.maxTicks}`,
    `worktree=${options.worktree ? 'on' : 'off'}`,
    `fast=${options.fast ? 'on' : 'off'}`,
    `auto_resume=${options.autoResume ? 'on' : 'off'}`,
    `context_pack=${contextPack}`,
    `allow_deps=${options.allowDeps ? 'yes' : 'no'}`
  ];
  return `Config: ${parts.join(' | ')}`;
}

function basePathFromAllowlist(pattern: string, repoPath: string): string | null {
  const globIndex = pattern.search(/[*?[\]]/);
  const withoutGlob = globIndex === -1 ? pattern : pattern.slice(0, globIndex);
  const trimmed = normalizePath(withoutGlob);
  if (!trimmed) return null;

  const abs = path.resolve(repoPath, trimmed);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    return trimmed;
  }

  if (pattern.endsWith('/**') || pattern.endsWith('/*') || pattern.endsWith('/')) {
    return trimmed;
  }

  const dir = normalizePath(path.posix.dirname(trimmed));
  return dir && dir !== '.' ? dir : null;
}

function commonPathPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const segments = paths.map((p) => normalizePath(p).split('/').filter(Boolean));
  const max = Math.min(...segments.map((parts) => parts.length));
  const common: string[] = [];

  for (let i = 0; i < max; i += 1) {
    const segment = segments[0][i];
    if (segments.every((parts) => parts[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.length ? common.join('/') : null;
}

function resolveTargetRoot(repoPath: string, allowlist: string[]): string | null {
  const roots = allowlist
    .map((pattern) => basePathFromAllowlist(pattern, repoPath))
    .filter((value): value is string => Boolean(value));
  const root = commonPathPrefix(roots);
  if (!root) return null;

  const repoAbs = path.resolve(repoPath);
  const targetAbs = path.resolve(repoPath, root);
  if (!targetAbs.startsWith(`${repoAbs}${path.sep}`)) return null;
  if (targetAbs === repoAbs) return null;

  return root;
}

async function freshenTargetRoot(repoPath: string, allowlist: string[]): Promise<string> {
  const targetRoot = resolveTargetRoot(repoPath, allowlist);
  if (!targetRoot) {
    throw new Error('Unable to resolve safe target root from allowlist.');
  }

  await gitOptional(['checkout', '--', targetRoot], repoPath);
  await git(['clean', '-fd', targetRoot], repoPath);

  return targetRoot;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const taskPath = path.resolve(options.task);
  const configPath = resolveConfigPath(repoPath, options.config);
  const config = loadConfig(configPath);
  const taskMetadata = loadTaskMetadata(taskPath);
  const taskText = taskMetadata.body;
  const ownsRaw = taskMetadata.owns_raw;
  const ownsNormalized = taskMetadata.owns_normalized;

  // Log effective configuration for transparency (skip in JSON mode)
  if (!options.json) {
    console.log(formatEffectiveConfig(options));
  }

  // Run doctor checks unless skipped (via flag or env var)
  const skipDoctor = options.skipDoctor || process.env.AGENT_SKIP_DOCTOR === '1';
  if (skipDoctor) {
    console.warn('WARNING: Skipping worker health checks (--skip-doctor)');
  } else {
    const doctorChecks = await runDoctorChecks(config, repoPath);
    const failedChecks = doctorChecks.filter((c) => c.error);
    if (failedChecks.length > 0) {
      console.error('Doctor checks failed:');
      for (const check of failedChecks) {
        console.error(`  ${check.name}: ${check.error}`);
      }
      console.error('\nRun with --skip-doctor to bypass worker health checks.');
      process.exitCode = 1;
      return;
    }
  }

  // Stage 1: Pre-PLAN collision check (allowlist overlap warning)
  if (!options.forceParallel) {
    const activeRuns = getActiveRuns(repoPath);
    if (activeRuns.length > 0) {
      const overlaps = checkAllowlistOverlaps(config.scope.allowlist, activeRuns);
      if (overlaps.length > 0) {
        console.warn('');
        console.warn(formatAllowlistWarning(overlaps));
        console.warn('');
      }
    }
  }

  let freshTargetRoot: string | null = null;
  if (options.freshTarget) {
    try {
      freshTargetRoot = await freshenTargetRoot(repoPath, config.scope.allowlist);
      console.log(`Fresh target: cleaned ${freshTargetRoot}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Fresh target failed: ${message}`);
      process.exitCode = 1;
      return;
    }
  }

  const runId = makeRunId();
  const slug = slugFromTask(taskPath);
  const runDir = path.join(getRunsRoot(repoPath), runId);
  const milestones = buildMilestonesFromTask(taskText);
  const milestoneRiskLevel = milestones[0]?.risk_level ?? 'medium';

  // Create worktree for isolated execution if enabled
  let effectiveRepoPath = repoPath;
  let worktreeInfo: WorktreeInfo | null = null;
  if (options.worktree) {
    const worktreePath = path.join(runDir, 'worktree');
    const runBranch = options.noBranch
      ? undefined
      : `agent/${runId}/${slug}`;

    try {
      worktreeInfo = await createWorktree(repoPath, worktreePath, runBranch);
      effectiveRepoPath = worktreeInfo.effective_repo_path;
      console.log(`Worktree created: ${worktreePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to create worktree: ${message}`);
      process.exitCode = 1;
      return;
    }
  }

  // Always run ping for quick auth check (catches OAuth failures early)
  // Doctor is more thorough but ping is faster for auth validation
  const preflight = await runPreflight({
    repoPath: effectiveRepoPath,
    runId,
    slug,
    config,
    allowDeps: options.allowDeps,
    allowDirty: options.allowDirty,
    milestoneRiskLevel,
    skipPing: false
  });

  const runStore = options.noWrite ? null : RunStore.init(runId, repoPath);

  if (runStore) {
    // Write config snapshot with worktree info if enabled
    const configWithWorktree = worktreeInfo
      ? { ...config, _worktree: worktreeInfo }
      : config;
    runStore.writeConfigSnapshot(configWithWorktree);
    runStore.writeArtifact('task.md', taskText);
    runStore.writeArtifact(
      'task.meta.json',
      JSON.stringify(
        {
          task_path: taskPath,
          owns_raw: ownsRaw,
          owns_normalized: ownsNormalized
        },
        null,
        2
      )
    );
    const fingerprint = await captureFingerprint(config, effectiveRepoPath);
    runStore.writeFingerprint(fingerprint);
    if (worktreeInfo) {
      runStore.appendEvent({
        type: 'worktree_created',
        source: 'cli',
        payload: {
          worktree_path: worktreeInfo.effective_repo_path,
          base_sha: worktreeInfo.base_sha,
          run_branch: worktreeInfo.run_branch
        }
      });
    }
    if (freshTargetRoot) {
      runStore.appendEvent({
        type: 'fresh_target',
        source: 'cli',
        payload: { target_root: freshTargetRoot }
      });
    }
    runStore.appendEvent({
      type: 'run_started',
      source: 'cli',
      payload: {
        repo: preflight.repo_context,
        task: taskPath,
        time_budget_minutes: options.time,
        allow_deps: options.allowDeps,
        allow_dirty: options.allowDirty,
        web: options.web,
        no_branch: options.noBranch,
        dry_run: options.dryRun,
        max_ticks: options.maxTicks
      }
    });
    runStore.appendEvent({
      type: 'preflight',
      source: 'cli',
      payload: {
        guard: preflight.guard,
        binary: preflight.binary,
        ping: preflight.ping,
        tiers: preflight.tiers,
        tier_reasons: preflight.tier_reasons
      }
    });
  }

  const summaryLine = formatSummaryLine({
    runId,
    runDir,
    repoRoot: preflight.repo_context.git_root,
    currentBranch: preflight.repo_context.current_branch,
    plannedRunBranch: preflight.repo_context.run_branch,
    guardOk: preflight.guard.ok,
    tiers: preflight.tiers,
    tierReasons: preflight.tier_reasons,
    noWrite: options.noWrite
  });

  if (!preflight.guard.ok) {
    if (runStore) {
      let state = createInitialState({
        run_id: runId,
        repo_path: effectiveRepoPath,
        task_text: taskText,
        owned_paths: {
          raw: ownsRaw,
          normalized: ownsNormalized
        },
        allowlist: config.scope.allowlist,
        denylist: config.scope.denylist
      });
      state.current_branch = preflight.repo_context.current_branch;
      state.planned_run_branch = preflight.repo_context.run_branch;
      state.tier_reasons = preflight.tier_reasons;
      state = stopRun(state, 'guard_violation');
      runStore.writeState(state);
      runStore.appendEvent({
        type: 'guard_violation',
        source: 'cli',
        payload: {
          guard: preflight.guard,
          binary: preflight.binary,
          ping: preflight.ping
        }
      });
      const binaryLines = preflight.binary.results.map(r =>
        r.ok
          ? `- ${r.worker}: ${r.version}`
          : `- ${r.worker}: FAIL - ${r.error}`
      );
      const pingLines = preflight.ping.skipped
        ? ['- Skipped']
        : preflight.ping.results.map(r =>
            r.ok
              ? `- ${r.worker}: OK (${r.ms}ms)`
              : `- ${r.worker}: FAIL - ${r.category} (${r.message})`
          );
      const summary = [
        '# Summary',
        '',
        'Run stopped due to guard violations.',
        '',
        'Guard reasons:',
        preflight.guard.reasons.length
          ? `- ${preflight.guard.reasons.join('\n- ')}`
          : '- None',
        '',
        'Scope violations:',
        preflight.guard.scope_violations.length
          ? `- ${preflight.guard.scope_violations.join('\n- ')}`
          : '- None',
        '',
        'Lockfile violations:',
        preflight.guard.lockfile_violations.length
          ? `- ${preflight.guard.lockfile_violations.join('\n- ')}`
          : '- None',
        '',
        'Binary checks:',
        binaryLines.length ? binaryLines.join('\n') : '- None',
        '',
        'Ping results:',
        ...pingLines
      ].join('\n');
      runStore.writeSummary(summary);
    }
    if (options.json) {
      const jsonOutput: RunJsonOutput = {
        run_id: runId,
        run_dir: runDir,
        repo_root: preflight.repo_context.git_root,
        status: 'guard_failed',
        guard_ok: false,
        tiers: preflight.tiers
      };
      console.log(JSON.stringify(jsonOutput));
    } else {
      console.log(summaryLine);
    }
    return;
  }

  const noBranchEffective = options.noBranch || options.dryRun || options.noWrite;
  if (!noBranchEffective) {
    await ensureRunBranch(
      preflight.repo_context.git_root,
      preflight.repo_context.run_branch,
      preflight.repo_context.current_branch
    );
  }

  let state = createInitialState({
    run_id: runId,
    repo_path: effectiveRepoPath,
    task_text: taskText,
    owned_paths: {
      raw: ownsRaw,
      normalized: ownsNormalized
    },
    allowlist: config.scope.allowlist,
    denylist: config.scope.denylist
  });
  state.current_branch = preflight.repo_context.current_branch;
  state.planned_run_branch = preflight.repo_context.run_branch;
  state.tier_reasons = preflight.tier_reasons;
  // Fast path: skip PLAN, go directly to IMPLEMENT
  state = updatePhase(state, options.fast ? 'IMPLEMENT' : 'PLAN');
  if (runStore) {
    runStore.writeState(state);
  }

  if (options.dryRun) {
    if (runStore) {
      runStore.appendEvent({
        type: 'run_dry_stop',
        source: 'cli',
        payload: { reason: 'dry_run' }
      });
      runStore.writeSummary('# Summary\n\nRun initialized in dry-run mode.');
    }
    if (options.json) {
      const jsonOutput: RunJsonOutput = {
        run_id: runId,
        run_dir: runDir,
        repo_root: preflight.repo_context.git_root,
        status: 'dry_run',
        guard_ok: true,
        tiers: preflight.tiers
      };
      console.log(JSON.stringify(jsonOutput));
    } else {
      console.log(summaryLine);
    }
    return;
  }

  // Output JSON early for orchestrator consumption (run_id available immediately)
  if (options.json) {
    const jsonOutput: RunJsonOutput = {
      run_id: runId,
      run_dir: runDir,
      repo_root: preflight.repo_context.git_root,
      status: 'started',
      guard_ok: true,
      tiers: preflight.tiers
    };
    console.log(JSON.stringify(jsonOutput));
  }

  if (runStore) {
    runStore.writeSummary('# Summary\n\nRun initialized. Supervisor loop not yet executed.');
    await runSupervisorLoop({
      runStore,
      repoPath: effectiveRepoPath,
      taskText,
      config,
      timeBudgetMinutes: options.time,
      maxTicks: options.maxTicks,
      allowDeps: options.allowDeps,
      fast: options.fast,
      autoResume: options.autoResume,
      forceParallel: options.forceParallel,
      ownedPaths: ownsNormalized
    });
  }

  if (!options.json) {
    console.log(summaryLine);
  }
}
