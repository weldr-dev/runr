import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand } from './commands/status.js';
import { reportCommand } from './commands/report.js';
import { guardsOnlyCommand } from './commands/guards-only.js';

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
      noWrite
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
  .action(async (runId: string) => {
    await resumeCommand({ runId });
  });

program
  .command('status')
  .argument('<runId>', 'Run ID')
  .action(async (runId: string) => {
    await statusCommand({ runId });
  });

program
  .command('report')
  .argument('<runId>', 'Run ID')
  .action(async (runId: string) => {
    await reportCommand({ runId });
  });

program.parseAsync();
