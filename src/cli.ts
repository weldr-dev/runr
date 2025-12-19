import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand } from './commands/status.js';
import { reportCommand } from './commands/report.js';

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
  .option('--web', 'Allow web access for unblock', false)
  .option('--dry-run', 'Initialize run without executing', false)
  .action(async (options) => {
    await runCommand({
      repo: options.repo,
      task: options.task,
      time: Number.parseInt(options.time, 10),
      config: options.config,
      allowDeps: options.allowDeps,
      web: options.web,
      dryRun: options.dryRun
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
