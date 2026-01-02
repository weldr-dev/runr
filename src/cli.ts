#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand, statusAllCommand } from './commands/status.js';
import { reportCommand, findLatestRunId } from './commands/report.js';
import { summarizeCommand } from './commands/summarize.js';
import { compareCommand } from './commands/compare.js';
import { guardsOnlyCommand } from './commands/guards-only.js';
import { doctorCommand } from './commands/doctor.js';
import { followCommand, findBestRunToFollow } from './commands/follow.js';
import { gcCommand } from './commands/gc.js';
import { waitCommand, findLatestRunId as findLatestRunIdForWait } from './commands/wait.js';
import { orchestrateCommand, resumeOrchestrationCommand, waitOrchestrationCommand } from './commands/orchestrate.js';
import { pathsCommand } from './commands/paths.js';
import { metricsCommand } from './commands/metrics.js';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { CollisionPolicy } from './orchestrator/types.js';

const program = new Command();

// Check if invoked as deprecated 'agent' command
const invokedAs = process.argv[1]?.split('/').pop() || 'runr';
if (invokedAs === 'agent') {
  console.warn('\x1b[33m⚠ Deprecation: The "agent" command is deprecated. Use "runr" instead.\x1b[0m\n');
}

program
  .name('runr')
  .description('Phase-gated orchestration for agent tasks');

program
  .command('init')
  .description('Initialize Runr configuration for a repository')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--interactive', 'Interactive setup (prompt for verification commands)', false)
  .option('--print', 'Print config without writing files', false)
  .option('--force', 'Overwrite existing config', false)
  .action(async (options) => {
    await initCommand({
      repo: options.repo,
      interactive: options.interactive,
      print: options.print,
      force: options.force
    });
  });

program
  .command('run')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--config <path>', 'Path to runr.config.json (or agent.config.json)')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--allow-dirty', 'Allow dirty worktree', false)
  .option('--no-branch', 'Do not checkout run branch')
  .option('--no-write', 'Do not write run artifacts')
  .option('--web', 'Allow web access for unblock', false)
  .option('--dry-run', 'Initialize run without executing', false)
  .option('--max-ticks <count>', 'Max supervisor ticks (default: 50)', '50')
  .option('--skip-doctor', 'Skip worker health checks', false)
  .option('--fresh-target', 'Wipe target root before starting', false)
  .option('--worktree', 'Create isolated git worktree for this run', false)
  .option('--fast', 'Fast path: skip PLAN and REVIEW phases for small tasks', false)
  .option('--auto-resume', 'Auto-resume on transient failures (stall, worker timeout)', false)
  .option('--force-parallel', 'Bypass file collision checks with active runs', false)
  .option('--json', 'Output JSON with run_id (for orchestrator consumption)', false)
  .action(async (options) => {
    const noBranch = options.branch === false;
    const noWrite = options.write === false;
    await runCommand({
      repo: options.repo,
      task: options.task,
      time: Number.parseInt(options.time, 10),
      config: options.config,
      allowDeps: options.allowDeps,
      allowDirty: options.allowDirty,
      web: options.web,
      dryRun: options.dryRun,
      noBranch,
      noWrite,
      maxTicks: Number.parseInt(options.maxTicks, 10),
      skipDoctor: options.skipDoctor,
      freshTarget: options.freshTarget,
      worktree: options.worktree,
      fast: options.fast,
      autoResume: options.autoResume,
      forceParallel: options.forceParallel,
      json: options.json
    });
  });

program
  .command('guards-only')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--config <path>', 'Path to runr.config.json (or agent.config.json)')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--allow-dirty', 'Allow dirty worktree', false)
  .option('--no-write', 'Do not write run artifacts')
  .action(async (options) => {
    const noWrite = options.write === false;
    await guardsOnlyCommand({
      repo: options.repo,
      task: options.task,
      config: options.config,
      allowDeps: options.allowDeps,
      allowDirty: options.allowDirty,
      noWrite
    });
  });

program
  .command('resume')
  .argument('<runId>', 'Run ID')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--max-ticks <count>', 'Max supervisor ticks (default: 50)', '50')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--config <path>', 'Path to runr.config.json (or agent.config.json)')
  .option('--force', 'Resume despite env fingerprint mismatch', false)
  .option('--auto-resume', 'Continue auto-resuming on transient failures', false)
  .action(async (runId: string, options) => {
    await resumeCommand({
      runId,
      repo: options.repo,
      time: Number.parseInt(options.time, 10),
      maxTicks: Number.parseInt(options.maxTicks, 10),
      allowDeps: options.allowDeps,
      config: options.config,
      force: options.force,
      autoResume: options.autoResume
    });
  });

program
  .command('status')
  .argument('[runId]', 'Run ID (omit with --all to show all runs)')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--all', 'Show status of all runs', false)
  .action(async (runId: string | undefined, options) => {
    if (options.all) {
      await statusAllCommand({ repo: options.repo });
    } else if (runId) {
      await statusCommand({ runId, repo: options.repo });
    } else {
      console.error('Error: Run ID required unless using --all');
      process.exit(1);
    }
  });

program
  .command('report')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--tail <count>', 'Tail last N events', '50')
  .option('--kpi-only', 'Show compact KPI summary only')
  .action(async (runId: string, options) => {
    let resolvedRunId = runId;
    if (runId === 'latest') {
      const latest = findLatestRunId(options.repo);
      if (!latest) {
        console.error('No runs found');
        process.exit(1);
      }
      resolvedRunId = latest;
    }
    await reportCommand({
      runId: resolvedRunId,
      repo: options.repo,
      tail: Number.parseInt(options.tail, 10),
      kpiOnly: options.kpiOnly
    });
  });

program
  .command('summarize')
  .description('Generate summary.json from run KPIs')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .action(async (runId: string, options) => {
    let resolvedRunId = runId;
    if (runId === 'latest') {
      const latest = findLatestRunId(options.repo);
      if (!latest) {
        console.error('No runs found');
        process.exit(1);
      }
      resolvedRunId = latest;
    }
    await summarizeCommand({ runId: resolvedRunId, repo: options.repo });
  });

program
  .command('compare')
  .description('Compare KPIs between two runs')
  .argument('<runA>', 'First run ID')
  .argument('<runB>', 'Second run ID')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .action(async (runA: string, runB: string, options) => {
    await compareCommand({ runA, runB, repo: options.repo });
  });

program
  .command('doctor')
  .description('Check worker CLI availability and headless mode')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--config <path>', 'Path to runr.config.json (or agent.config.json)')
  .action(async (options) => {
    await doctorCommand({
      repo: options.repo,
      config: options.config
    });
  });

program
  .command('paths')
  .description('Display canonical runr directory paths (for scripts and tooling)')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--json', 'Output JSON (default: true)', true)
  .option('--no-json', 'Output human-readable table')
  .action(async (options) => {
    await pathsCommand({
      repo: options.repo,
      json: options.json
    });
  });

program
  .command('metrics')
  .description('Show aggregated metrics across all runs and orchestrations')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--days <n>', 'Number of days to aggregate (default: 30)', '30')
  .option('--window <n>', 'Max runs to consider (default: 50 runs, 20 orchestrations)')
  .option('--json', 'Output JSON format', false)
  .action(async (options) => {
    await metricsCommand({
      repo: options.repo,
      days: parseInt(options.days, 10),
      window: options.window ? parseInt(options.window, 10) : undefined,
      json: options.json
    });
  });

program
  .command('version')
  .description('Show version information')
  .option('--json', 'Output JSON format', false)
  .action(async (options) => {
    await versionCommand({
      json: options.json
    });
  });

program
  .command('follow')
  .description('Tail run timeline and exit on termination')
  .argument('[runId]', 'Run ID (or "latest", default: latest running or latest)')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .action(async (runId: string | undefined, options) => {
    let resolvedRunId: string;

    if (!runId || runId === 'latest') {
      const best = findBestRunToFollow(options.repo);
      if (!best) {
        console.error('No runs found');
        process.exit(1);
      }
      resolvedRunId = best.runId;
      if (!best.wasRunning) {
        console.log(`No running runs; following latest (${resolvedRunId})`);
      }
    } else {
      resolvedRunId = runId;
    }

    await followCommand({ runId: resolvedRunId, repo: options.repo });
  });

program
  .command('gc')
  .description('Clean up old worktree directories to reclaim disk space')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--dry-run', 'Preview what would be deleted without actually deleting', false)
  .option('--older-than <days>', 'Only delete worktrees older than N days', '7')
  .action(async (options) => {
    await gcCommand({
      repo: options.repo,
      dryRun: options.dryRun,
      olderThan: Number.parseInt(options.olderThan, 10)
    });
  });

program
  .command('wait')
  .description('Block until run reaches terminal state (for meta-agent coordination)')
  .argument('[runId]', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--for <condition>', 'Wait condition: terminal, stop, complete', 'terminal')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--json', 'Output JSON (default: true)', true)
  .option('--no-json', 'Output human-readable text')
  .action(async (runId: string | undefined, options) => {
    let resolvedRunId: string;

    if (!runId || runId === 'latest') {
      const latest = findLatestRunIdForWait(options.repo);
      if (!latest) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'no_runs', message: 'No runs found' }));
        } else {
          console.error('No runs found');
        }
        process.exit(1);
      }
      resolvedRunId = latest;
    } else {
      resolvedRunId = runId;
    }

    await waitCommand({
      runId: resolvedRunId,
      repo: options.repo,
      for: options.for as 'terminal' | 'stop' | 'complete',
      timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
      json: options.json
    });
  });

// Orchestrate subcommands
const orchestrateCmd = program
  .command('orchestrate')
  .description('Run multiple tracks of tasks in parallel with collision-aware scheduling');

orchestrateCmd
  .command('run')
  .description('Start a new orchestration from config')
  .requiredOption('--config <path>', 'Path to orchestration config file (YAML or JSON)')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--time <minutes>', 'Time budget per run in minutes', '120')
  .option('--max-ticks <count>', 'Max supervisor ticks per run', '50')
  .option('--collision-policy <policy>', 'Collision policy: serialize, force, fail', 'serialize')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--worktree', 'Create isolated git worktree for each run', false)
  .option('--fast', 'Fast path: skip PLAN and REVIEW phases', false)
  .option('--auto-resume', 'Auto-resume runs on transient failures', false)
  .option('--dry-run', 'Show planned execution without running', false)
  .action(async (options) => {
    const collisionPolicy = options.collisionPolicy as CollisionPolicy;
    if (!['serialize', 'force', 'fail'].includes(collisionPolicy)) {
      console.error(`Invalid collision policy: ${collisionPolicy}`);
      console.error('Valid values: serialize, force, fail');
      process.exit(1);
    }

    await orchestrateCommand({
      config: options.config,
      repo: options.repo,
      time: Number.parseInt(options.time, 10),
      maxTicks: Number.parseInt(options.maxTicks, 10),
      collisionPolicy,
      allowDeps: options.allowDeps,
      worktree: options.worktree,
      fast: options.fast,
      autoResume: options.autoResume,
      dryRun: options.dryRun
    });
  });

orchestrateCmd
  .command('resume')
  .description('Resume a previously started orchestration')
  .argument('<orchestratorId>', 'Orchestrator ID to resume (or "latest")')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  // Policy override flags (optional, logged if used)
  .option('--time <minutes>', 'Override time budget per run')
  .option('--max-ticks <count>', 'Override max supervisor ticks')
  .option('--fast', 'Override fast mode (skip PLAN/REVIEW)')
  .option('--no-fast', 'Disable fast mode override')
  .option('--collision-policy <policy>', 'Override collision policy: serialize, force, fail')
  .action(async (orchestratorId: string, options) => {
    await resumeOrchestrationCommand({
      orchestratorId,
      repo: options.repo,
      overrides: {
        time: options.time ? Number.parseInt(options.time, 10) : undefined,
        maxTicks: options.maxTicks ? Number.parseInt(options.maxTicks, 10) : undefined,
        fast: options.fast,
        collisionPolicy: options.collisionPolicy
      }
    });
  });

orchestrateCmd
  .command('wait')
  .description('Block until orchestration reaches terminal state')
  .argument('<orchestratorId>', 'Orchestrator ID to wait for (or "latest")')
  .option('--repo <path>', 'Target repo path (default: current directory)', '.')
  .option('--for <condition>', 'Wait condition: terminal, stop, complete', 'terminal')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--json', 'Output JSON (default: true)', true)
  .option('--no-json', 'Output human-readable text')
  .action(async (orchestratorId: string, options) => {
    await waitOrchestrationCommand({
      orchestratorId,
      repo: options.repo,
      for: options.for as 'terminal' | 'stop' | 'complete',
      timeout: options.timeout ? Number.parseInt(options.timeout, 10) : undefined,
      json: options.json
    });
  });

// ==========================================
// Edgy aliases (same commands, different vibe)
// ==========================================

// summon → run
program
  .command('summon')
  .description('Summon a worker to execute a task (alias for "run")')
  .option('--repo <path>', 'Target repo path', '.')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--config <path>', 'Path to runr.config.json')
  .option('--worktree', 'Create isolated git worktree', false)
  .option('--fast', 'Skip PLAN and REVIEW phases', false)
  .option('--auto-resume', 'Auto-resume on transient failures', false)
  .option('--json', 'Output JSON', false)
  .action(async (options) => {
    await runCommand({
      repo: options.repo,
      task: options.task,
      time: Number.parseInt(options.time, 10),
      config: options.config,
      allowDeps: false,
      allowDirty: false,
      web: false,
      dryRun: false,
      noBranch: false,
      noWrite: false,
      maxTicks: 50,
      skipDoctor: false,
      freshTarget: false,
      worktree: options.worktree,
      fast: options.fast,
      autoResume: options.autoResume,
      forceParallel: false,
      json: options.json
    });
  });

// resurrect → resume
program
  .command('resurrect')
  .description('Resurrect a stopped run from checkpoint (alias for "resume")')
  .argument('<runId>', 'Run ID')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--force', 'Resume despite env mismatch', false)
  .action(async (runId: string, options) => {
    await resumeCommand({
      runId,
      repo: options.repo,
      time: Number.parseInt(options.time, 10),
      maxTicks: 50,
      allowDeps: false,
      config: options.config,
      force: options.force,
      autoResume: false
    });
  });

// scry → status
program
  .command('scry')
  .description('Scry the fate of a run (alias for "status")')
  .argument('[runId]', 'Run ID')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--all', 'Show all runs', false)
  .action(async (runId: string | undefined, options) => {
    if (options.all) {
      await statusAllCommand({ repo: options.repo });
    } else if (runId) {
      await statusCommand({ runId, repo: options.repo });
    } else {
      console.error('Error: Run ID required unless using --all');
      process.exit(1);
    }
  });

// banish → gc
program
  .command('banish')
  .description('Banish old worktrees to the void (alias for "gc")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--dry-run', 'Preview without deleting', false)
  .option('--older-than <days>', 'Only banish worktrees older than N days', '7')
  .action(async (options) => {
    await gcCommand({
      repo: options.repo,
      dryRun: options.dryRun,
      olderThan: Number.parseInt(options.olderThan, 10)
    });
  });

program.parseAsync();
