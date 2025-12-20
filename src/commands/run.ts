import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { RunStore } from '../store/run-store.js';
import { git, gitOptional } from '../repo/git.js';
import { buildMilestonesFromTask } from '../supervisor/planner.js';
import { createInitialState, stopRun, updatePhase } from '../supervisor/state-machine.js';
import { runPreflight } from './preflight.js';
import { runSupervisorLoop } from '../supervisor/runner.js';
import { runDoctorChecks, WorkerCheck } from './doctor.js';
import { captureFingerprint } from '../env/fingerprint.js';

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

export async function runCommand(options: RunOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const taskPath = path.resolve(options.task);
  const configPath = resolveConfigPath(repoPath, options.config);
  const config = loadConfig(configPath);
  const taskText = fs.readFileSync(taskPath, 'utf-8');

  // Run doctor checks unless skipped
  if (options.skipDoctor) {
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

  const runId = makeRunId();
  const slug = slugFromTask(taskPath);
  const milestones = buildMilestonesFromTask(taskText);
  const milestoneRiskLevel = milestones[0]?.risk_level ?? 'medium';

  const preflight = await runPreflight({
    repoPath,
    runId,
    slug,
    config,
    allowDeps: options.allowDeps,
    allowDirty: options.allowDirty,
    milestoneRiskLevel
  });

  const runDir = path.resolve('runs', runId);
  const runStore = options.noWrite ? null : RunStore.init(runId);

  if (runStore) {
    runStore.writeConfigSnapshot(config);
    runStore.writeArtifact('task.md', taskText);
    const fingerprint = await captureFingerprint(config, repoPath);
    runStore.writeFingerprint(fingerprint);
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
        repo_path: repoPath,
        task_text: taskText,
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
          guard: preflight.guard
        }
      });
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
          : '- None'
      ].join('\n');
      runStore.writeSummary(summary);
    }
    console.log(summaryLine);
    return;
  }

  const noBranchEffective = options.noBranch || options.dryRun || options.noWrite;
  if (!noBranchEffective) {
    await ensureRunBranch(
      preflight.repo_context.git_root,
      preflight.repo_context.run_branch,
      preflight.repo_context.default_branch
    );
  }

  let state = createInitialState({
    run_id: runId,
    repo_path: repoPath,
    task_text: taskText,
    allowlist: config.scope.allowlist,
    denylist: config.scope.denylist
  });
  state.current_branch = preflight.repo_context.current_branch;
  state.planned_run_branch = preflight.repo_context.run_branch;
  state.tier_reasons = preflight.tier_reasons;
  state = updatePhase(state, 'PLAN');
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
    console.log(summaryLine);
    return;
  }

  if (runStore) {
    runStore.writeSummary('# Summary\n\nRun initialized. Supervisor loop not yet executed.');
    await runSupervisorLoop({
      runStore,
      repoPath,
      taskText,
      config,
      timeBudgetMinutes: options.time,
      maxTicks: options.maxTicks,
      allowDeps: options.allowDeps
    });
  }

  console.log(summaryLine);
}
