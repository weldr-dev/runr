import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand } from './commands/status.js';
import { reportCommand, findLatestRunId } from './commands/report.js';
import { summarizeCommand } from './commands/summarize.js';
import { compareCommand } from './commands/compare.js';
import { guardsOnlyCommand } from './commands/guards-only.js';
import { doctorCommand } from './commands/doctor.js';
import { followCommand, findBestRunToFollow } from './commands/follow.js';

const program = new Command();

program
  .name('agent-run')
  .description('Dual-LLM coding orchestrator');

program
  .command('run')
  .requiredOption('--repo <path>', 'Target repo path')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--config <path>', 'Path to agent.config.json')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--allow-dirty', 'Allow dirty worktree', false)
  .option('--no-branch', 'Do not checkout run branch')
  .option('--no-write', 'Do not write run artifacts')
  .option('--web', 'Allow web access for unblock', false)
  .option('--dry-run', 'Initialize run without executing', false)
  .option('--max-ticks <count>', 'Max supervisor ticks', '10')
  .option('--skip-doctor', 'Skip worker health checks', false)
  .option('--fresh-target', 'Wipe target root before starting', false)
  .option('--worktree', 'Create isolated git worktree for this run', false)
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
      worktree: options.worktree
    });
  });

program
  .command('guards-only')
  .requiredOption('--repo <path>', 'Target repo path')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--config <path>', 'Path to agent.config.json')
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
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--max-ticks <count>', 'Max supervisor ticks', '10')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--config <path>', 'Path to agent.config.json')
  .option('--force', 'Resume despite env fingerprint mismatch', false)
  .action(async (runId: string, options) => {
    await resumeCommand({
      runId,
      time: Number.parseInt(options.time, 10),
      maxTicks: Number.parseInt(options.maxTicks, 10),
      allowDeps: options.allowDeps,
      config: options.config,
      force: options.force
    });
  });

program
  .command('status')
  .argument('<runId>', 'Run ID')
  .action(async (runId: string) => {
    await statusCommand({ runId });
  });

program
  .command('report')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--tail <count>', 'Tail last N events', '50')
  .option('--kpi-only', 'Show compact KPI summary only')
  .action(async (runId: string, options) => {
    let resolvedRunId = runId;
    if (runId === 'latest') {
      const latest = findLatestRunId();
      if (!latest) {
        console.error('No runs found');
        process.exit(1);
      }
      resolvedRunId = latest;
    }
    await reportCommand({
      runId: resolvedRunId,
      tail: Number.parseInt(options.tail, 10),
      kpiOnly: options.kpiOnly
    });
  });

program
  .command('summarize')
  .description('Generate summary.json from run KPIs')
  .argument('<runId>', 'Run ID (or "latest")')
  .action(async (runId: string) => {
    let resolvedRunId = runId;
    if (runId === 'latest') {
      const latest = findLatestRunId();
      if (!latest) {
        console.error('No runs found');
        process.exit(1);
      }
      resolvedRunId = latest;
    }
    await summarizeCommand({ runId: resolvedRunId });
  });

program
  .command('compare')
  .description('Compare KPIs between two runs')
  .argument('<runA>', 'First run ID')
  .argument('<runB>', 'Second run ID')
  .action(async (runA: string, runB: string) => {
    await compareCommand({ runA, runB });
  });

program
  .command('doctor')
  .description('Check worker CLI availability and headless mode')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--config <path>', 'Path to agent.config.json')
  .action(async (options) => {
    await doctorCommand({
      repo: options.repo,
      config: options.config
    });
  });

program
  .command('follow')
  .description('Tail run timeline and exit on termination')
  .argument('[runId]', 'Run ID (or "latest", default: latest running or latest)')
  .action(async (runId?: string) => {
    let resolvedRunId: string;

    if (!runId || runId === 'latest') {
      const best = findBestRunToFollow();
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

    await followCommand({ runId: resolvedRunId });
  });

program.parseAsync();
