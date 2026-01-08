#!/usr/bin/env node
/**
 * Runr CLI - Phase-gated orchestration for agent tasks
 *
 * Core commands:
 *   runr                 - Front door: status + next actions
 *   runr run             - Start a new run
 *   runr continue        - Do the obvious next thing
 *   runr report          - View run details
 *   runr init            - Initialize configuration
 *
 * Advanced:
 *   runr orch ...        - Multi-step orchestrations
 *   runr runs ...        - Audit trail & bundles
 *   runr tools ...       - Diagnostics & maintenance
 */

import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand, statusAllCommand } from './commands/status.js';
import { reportCommand, findLatestRunId } from './commands/report.js';
import { summarizeCommand } from './commands/summarize.js';
import { nextCommand } from './commands/next.js';
import { compareCommand } from './commands/compare.js';
import { guardsOnlyCommand } from './commands/guards-only.js';
import { doctorCommand } from './commands/doctor.js';
import { followCommand, findBestRunToFollow } from './commands/follow.js';
import { gcCommand } from './commands/gc.js';
import { waitCommand, findLatestRunId as findLatestRunIdForWait } from './commands/wait.js';
import { orchestrateCommand, resumeOrchestrationCommand, waitOrchestrationCommand, receiptCommand } from './commands/orchestrate.js';
import { pathsCommand } from './commands/paths.js';
import { metricsCommand } from './commands/metrics.js';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { packsCommand } from './commands/packs.js';
import { watchCommand } from './commands/watch.js';
import { journalCommand, noteCommand, openCommand } from './commands/journal.js';
import { bundleCommand } from './commands/bundle.js';
import { submitCommand } from './commands/submit.js';
import { metaCommand } from './commands/meta.js';
import { interveneCommand } from './commands/intervene.js';
import { auditCommand } from './commands/audit.js';
import { modeCommand, type WorkflowMode } from './commands/mode.js';
import { installCommand as hooksInstallCommand, uninstallCommand as hooksUninstallCommand, statusCommand as hooksStatusCommand, checkCommitCommand } from './commands/hooks.js';
import { continueCommand } from './commands/continue.js';
import { CollisionPolicy } from './orchestrator/types.js';
import { resolveRepoState } from './ux/state.js';
import { computeBrain } from './ux/brain.js';
import { formatFrontDoor, formatJson as formatBrainJson } from './ux/render.js';
import { recordFrontDoor } from './ux/telemetry.js';
import type { StopDiagnosisJson } from './diagnosis/types.js';
import type { StopDiagnostics } from './diagnosis/stop-explainer.js';
import fs from 'node:fs';

const program = new Command();

// Check if invoked as deprecated 'agent' command
const invokedAs = process.argv[1]?.split('/').pop() || 'runr';
if (invokedAs === 'agent') {
  console.warn('\x1b[33m⚠ Deprecation: The "agent" command is deprecated. Use "runr" instead.\x1b[0m\n');
}

// Custom help with examples
program.addHelpText('after', `
Examples:
  runr                       Show status and next actions
  runr run --task <file>     Start a new task
  runr continue              Do the next obvious thing
  runr report latest         Inspect what happened

Advanced:
  runr orch run --config <file>   Start multi-step orchestration
  runr runs bundle <id>           Generate evidence bundle
  runr tools doctor               Check system health
`);

program
  .name('runr')
  .description('Autopilot for agent tasks')
  .version('0.7.1');

// ============================================================================
// CORE COMMANDS (the 5 commands everyone needs)
// ============================================================================

program
  .command('run')
  .description('Start a new run')
  .option('--repo <path>', 'Target repo path', '.')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--config <path>', 'Path to runr.config.json')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--allow-dirty', 'Allow dirty worktree', false)
  .option('--no-branch', 'Do not checkout run branch')
  .option('--no-write', 'Do not write run artifacts')
  .option('--web', 'Allow web access for unblock', false)
  .option('--dry-run', 'Initialize run without executing', false)
  .option('--max-ticks <count>', 'Max supervisor ticks', '50')
  .option('--skip-doctor', 'Skip worker health checks', false)
  .option('--fresh-target', 'Wipe target root before starting', false)
  .option('--worktree', 'Create isolated git worktree for this run', false)
  .option('--fast', 'Skip PLAN and REVIEW phases', false)
  .option('--auto-resume', 'Auto-resume on transient failures', false)
  .option('--force-parallel', 'Bypass file collision checks', false)
  .option('--json', 'Output JSON with run_id', false)
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
  .command('continue')
  .description('Continue from where you left off')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--confirm', 'Prompt before executing', false)
  .option('--force', 'Override ledger mode restrictions', false)
  .option('--json', 'Output JSON', false)
  .action(async (options) => {
    await continueCommand({
      repo: options.repo,
      confirm: options.confirm,
      force: options.force,
      json: options.json,
    });
  });

program
  .command('report')
  .description('View run details and KPIs')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--tail <count>', 'Tail last N events', '50')
  .option('--kpi-only', 'Show compact KPI summary only')
  .option('--json', 'Output KPI as JSON')
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
      kpiOnly: options.kpiOnly,
      json: options.json
    });
  });

program
  .command('init')
  .description('Initialize Runr configuration')
  .option('--repo <path>', 'Path to repository', '.')
  .option('--pack <name>', 'Workflow pack: solo, pr, trunk')
  .option('--about <description>', 'Project description')
  .option('--with-claude', 'Create CLAUDE.md guide', false)
  .option('--dry-run', 'Preview without making changes', false)
  .option('--workflow <profile>', 'Workflow profile: solo, pr, trunk')
  .option('--interactive', 'Launch interactive setup wizard', false)
  .option('--print', 'Display generated config without writing', false)
  .option('--force', 'Overwrite existing config', false)
  .option('--demo', 'Create a self-contained demo project', false)
  .option('--demo-dir <path>', 'Directory for demo project', 'runr-demo')
  .action(async (options) => {
    await initCommand({
      repo: options.repo,
      workflow: options.workflow,
      pack: options.pack,
      about: options.about,
      withClaude: options.withClaude,
      interactive: options.interactive,
      print: options.print,
      force: options.force,
      dryRun: options.dryRun,
      demo: options.demo,
      demoDir: options.demoDir
    });
  });

// ============================================================================
// ADVANCED COMMANDS (escape hatches, still visible)
// ============================================================================

program
  .command('resume')
  .description('Resume a stopped run')
  .argument('<runId>', 'Run ID')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--time <minutes>', 'Time budget in minutes', '120')
  .option('--max-ticks <count>', 'Max supervisor ticks', '50')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--config <path>', 'Path to runr.config.json')
  .option('--force', 'Resume despite env fingerprint mismatch', false)
  .option('--auto-resume', 'Continue auto-resuming on transient failures', false)
  .option('--auto-stash', 'Automatically stash uncommitted changes', false)
  .option('--plan', 'Print resume plan and exit without resuming', false)
  .option('--json', 'Output resume plan as JSON (implies --plan)', false)
  .action(async (runId: string, options) => {
    await resumeCommand({
      runId,
      repo: options.repo,
      time: Number.parseInt(options.time, 10),
      maxTicks: Number.parseInt(options.maxTicks, 10),
      allowDeps: options.allowDeps,
      config: options.config,
      force: options.force,
      autoResume: options.autoResume,
      autoStash: options.autoStash,
      plan: options.plan,
      json: options.json
    });
  });

program
  .command('intervene')
  .description('Record manual work done outside Runr')
  .argument('<runId>', 'Run ID (or "latest")')
  .requiredOption('--reason <type>', 'Why intervention was needed')
  .requiredOption('--note <text>', 'Description of what was done')
  .option('--cmd <command>', 'Command to run and capture', (val, prev: string[]) => [...prev, val], [])
  .option('--cmd-output <mode>', 'Output capture mode', 'truncated')
  .option('--no-redact', 'Disable secret redaction')
  .option('--since <sha>', 'Override base_sha for attribution')
  .option('--commit <message>', 'Create commit with Runr trailers')
  .option('--amend-last', 'Amend last commit to add Runr trailers')
  .option('--stage-only', 'Stage changes but do not commit')
  .option('--force', 'Force operations even if unsafe')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--json', 'Output JSON', false)
  .action(async (runId: string, options) => {
    await interveneCommand({
      repo: options.repo,
      runId,
      reason: options.reason,
      note: options.note,
      commands: options.cmd,
      cmdOutput: options.cmdOutput,
      noRedact: !options.redact,
      since: options.since,
      commit: options.commit,
      amendLast: options.amendLast,
      stageOnly: options.stageOnly,
      force: options.force,
      json: options.json
    });
  });

program
  .command('submit')
  .description('Submit verified checkpoint to integration branch')
  .argument('<runId>', 'Run ID to submit')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--to <branch>', 'Target branch (default: from workflow config)')
  .option('--dry-run', 'Preview without making changes', false)
  .option('--push', 'Push to origin after cherry-pick', false)
  .option('--config <path>', 'Path to runr.config.json')
  .action(async (runId: string, options) => {
    await submitCommand({
      repo: options.repo,
      runId,
      to: options.to,
      dryRun: options.dryRun,
      push: options.push,
      config: options.config
    });
  });

program
  .command('meta')
  .description('Launch meta-agent with Runr context')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--tool <name>', 'Tool to use: auto, claude, codex', 'auto')
  .option('--allow-dirty', 'Allow uncommitted changes', false)
  .option('--interactive', 'Ask for permission on each tool use', false)
  .action(async (options) => {
    await metaCommand({
      repo: options.repo,
      tool: options.tool as 'auto' | 'claude' | 'codex',
      allowDirty: options.allowDirty,
      interactive: options.interactive
    });
  });

// ============================================================================
// ORCHESTRATION GROUP (runr orch ...)
// ============================================================================

const orchCmd = program
  .command('orch')
  .description('Multi-step orchestrations');

orchCmd
  .command('run')
  .description('Start a new orchestration from config')
  .requiredOption('--config <path>', 'Path to orchestration config file')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--time <minutes>', 'Time budget per run', '120')
  .option('--max-ticks <count>', 'Max supervisor ticks per run', '50')
  .option('--collision-policy <policy>', 'Policy: serialize, force, fail', 'serialize')
  .option('--allow-deps', 'Allow lockfile changes', false)
  .option('--worktree', 'Create isolated git worktree for each run', false)
  .option('--fast', 'Skip PLAN and REVIEW phases', false)
  .option('--auto-resume', 'Auto-resume runs on transient failures', false)
  .option('--dry-run', 'Show planned execution without running', false)
  .action(async (options) => {
    const collisionPolicy = options.collisionPolicy as CollisionPolicy;
    if (!['serialize', 'force', 'fail'].includes(collisionPolicy)) {
      console.error(`Invalid collision policy: ${collisionPolicy}`);
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

orchCmd
  .command('resume')
  .description('Resume a previously started orchestration')
  .argument('<orchestratorId>', 'Orchestrator ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--time <minutes>', 'Override time budget per run')
  .option('--max-ticks <count>', 'Override max supervisor ticks')
  .option('--fast', 'Override fast mode')
  .option('--no-fast', 'Disable fast mode override')
  .option('--collision-policy <policy>', 'Override collision policy')
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

orchCmd
  .command('wait')
  .description('Block until orchestration reaches terminal state')
  .argument('<orchestratorId>', 'Orchestrator ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--for <condition>', 'Wait condition: terminal, stop, complete', 'terminal')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--json', 'Output JSON', true)
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

orchCmd
  .command('receipt')
  .description('Generate orchestration receipt')
  .argument('<orchestratorId>', 'Orchestrator ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--json', 'Output JSON instead of markdown', false)
  .option('--write', 'Write receipt to orchestration directory', false)
  .action(async (orchestratorId: string, options) => {
    await receiptCommand({
      orchestratorId,
      repo: options.repo,
      json: options.json,
      write: options.write
    });
  });

// ============================================================================
// RUNS GROUP (runr runs ...) - formerly "evidence"
// ============================================================================

const runsCmd = program
  .command('runs')
  .description('Run history & evidence');

runsCmd
  .command('bundle')
  .description('Generate deterministic evidence bundle')
  .argument('<runId>', 'Run ID to bundle')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--output <path>', 'Output file path (default: stdout)')
  .action(async (runId: string, options) => {
    await bundleCommand({
      repo: options.repo,
      runId,
      output: options.output
    });
  });

runsCmd
  .command('audit')
  .description('View project history by provenance')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--range <range>', 'Git range (e.g., main~50..main)')
  .option('--run <id>', 'Filter to commits for specific run ID')
  .option('--limit <n>', 'Number of commits to analyze', '50')
  .option('--json', 'Output JSON', false)
  .option('--strict', 'Treat inferred attribution as gaps', false)
  .option('--coverage', 'Output coverage report', false)
  .option('--fail-under <pct>', 'Exit 1 if coverage < threshold')
  .option('--fail-under-with-inferred <pct>', 'Exit 1 if inferred coverage < threshold')
  .action(async (options) => {
    await auditCommand({
      repo: options.repo,
      range: options.range,
      runId: options.run,
      limit: parseInt(options.limit, 10),
      json: options.json,
      strict: options.strict,
      coverage: options.coverage,
      failUnder: options.failUnder ? parseInt(options.failUnder, 10) : undefined,
      failUnderWithInferred: options.failUnderWithInferred ? parseInt(options.failUnderWithInferred, 10) : undefined
    });
  });

runsCmd
  .command('summarize')
  .description('Generate summary.json from run KPIs')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
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

runsCmd
  .command('list')
  .description('Show all runs')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (options) => {
    await statusAllCommand({ repo: options.repo });
  });

// ============================================================================
// TOOLS GROUP (runr tools ...)
// ============================================================================

const toolsCmd = program
  .command('tools')
  .description('Diagnostics & maintenance');

toolsCmd
  .command('doctor')
  .description('Check worker CLI availability')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--config <path>', 'Path to runr.config.json')
  .action(async (options) => {
    await doctorCommand({
      repo: options.repo,
      config: options.config
    });
  });

toolsCmd
  .command('paths')
  .description('Display canonical runr directory paths')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--json', 'Output JSON', true)
  .option('--no-json', 'Output human-readable table')
  .action(async (options) => {
    await pathsCommand({
      repo: options.repo,
      json: options.json
    });
  });

toolsCmd
  .command('metrics')
  .description('Show aggregated metrics across runs')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--days <n>', 'Number of days to aggregate', '30')
  .option('--window <n>', 'Max runs to consider')
  .option('--json', 'Output JSON format', false)
  .action(async (options) => {
    await metricsCommand({
      repo: options.repo,
      days: parseInt(options.days, 10),
      window: options.window ? parseInt(options.window, 10) : undefined,
      json: options.json
    });
  });

toolsCmd
  .command('gc')
  .description('Clean up old worktree directories')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--dry-run', 'Preview what would be deleted', false)
  .option('--older-than <days>', 'Only delete worktrees older than N days', '7')
  .action(async (options) => {
    await gcCommand({
      repo: options.repo,
      dryRun: options.dryRun,
      olderThan: Number.parseInt(options.olderThan, 10)
    });
  });

toolsCmd
  .command('follow')
  .description('Tail run timeline in real-time')
  .argument('[runId]', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
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

toolsCmd
  .command('watch')
  .description('Watch run progress with optional auto-resume')
  .argument('<runId>', 'Run ID to watch')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--auto-resume', 'Automatically resume on transient failures', false)
  .option('--max-attempts <N>', 'Maximum auto-resume attempts', '3')
  .option('--interval <seconds>', 'Poll interval in seconds', '5')
  .option('--json', 'Output JSON events', false)
  .action(async (runId: string, options) => {
    await watchCommand({
      runId,
      repo: options.repo,
      autoResume: options.autoResume,
      maxAttempts: Number.parseInt(options.maxAttempts, 10),
      interval: Number.parseInt(options.interval, 10) * 1000,
      json: options.json
    });
  });

toolsCmd
  .command('wait')
  .description('Block until run reaches terminal state')
  .argument('[runId]', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--for <condition>', 'Wait condition: terminal, stop, complete', 'terminal')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--json', 'Output JSON', true)
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

toolsCmd
  .command('next')
  .description('Print suggested next command')
  .argument('<runId>', 'Run ID (or "latest")')
  .option('--repo <path>', 'Target repo path', '.')
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
    await nextCommand(resolvedRunId, { repo: options.repo });
  });

toolsCmd
  .command('compare')
  .description('Compare KPIs between two runs')
  .argument('<runA>', 'First run ID')
  .argument('<runB>', 'Second run ID')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (runA: string, runB: string, options) => {
    await compareCommand({ runA, runB, repo: options.repo });
  });

toolsCmd
  .command('packs')
  .description('List available workflow packs')
  .option('--verbose', 'Show pack loading path')
  .action(async (options) => {
    await packsCommand({ verbose: options.verbose });
  });

toolsCmd
  .command('guard')
  .description('Run entry guards without executing')
  .option('--repo <path>', 'Target repo path', '.')
  .requiredOption('--task <path>', 'Task brief file')
  .option('--config <path>', 'Path to runr.config.json')
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

// ============================================================================
// CONFIG GROUP (runr config ...)
// ============================================================================

const configCmd = program
  .command('config')
  .description('Runr settings');

configCmd
  .command('mode')
  .description('View or set workflow mode (flow/ledger)')
  .argument('[mode]', 'Mode to set (flow or ledger)')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (mode, options) => {
    await modeCommand({
      repo: options.repo,
      newMode: mode as WorkflowMode | undefined
    });
  });

// ============================================================================
// HIDDEN COMMANDS (setup plumbing, accessible but not in default help)
// ============================================================================

// Hooks group - hidden from main help
const hooksCmd = program
  .command('hooks', { hidden: true })
  .description('Git hooks for provenance tracking');

hooksCmd
  .command('install')
  .description('Install Runr git hooks')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (options) => {
    await hooksInstallCommand({ repo: options.repo });
  });

hooksCmd
  .command('uninstall')
  .description('Remove Runr git hooks')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (options) => {
    await hooksUninstallCommand({ repo: options.repo });
  });

hooksCmd
  .command('status')
  .description('Show git hooks status')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (options) => {
    await hooksStatusCommand({ repo: options.repo });
  });

hooksCmd
  .command('check-commit')
  .description('Check commit against run state (internal)')
  .argument('<msgFile>', 'Path to commit message file')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (msgFile: string, options) => {
    await checkCommitCommand({ repo: options.repo, msgFile });
  });

// Journal group - hidden from main help
const journalCmd = program
  .command('journal', { hidden: true })
  .description('Run journals and notes');

journalCmd
  .command('show')
  .description('Generate and display journal.md for a run')
  .argument('[runId]', 'Run ID (defaults to latest)')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--output <file>', 'Output file path')
  .option('--force', 'Force regeneration even if up to date', false)
  .action(async (runId: string | undefined, options) => {
    await journalCommand({
      repo: options.repo,
      runId,
      output: options.output,
      force: options.force
    });
  });

journalCmd
  .command('note')
  .description('Add a timestamped note to a run')
  .argument('<message>', 'Note message')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--run-id <id>', 'Run ID (defaults to latest)')
  .action(async (message: string, options) => {
    await noteCommand(message, {
      repo: options.repo,
      runId: options.runId
    });
  });

journalCmd
  .command('open')
  .description('Open journal.md in $EDITOR')
  .argument('[runId]', 'Run ID (defaults to latest)')
  .option('--repo <path>', 'Target repo path', '.')
  .action(async (runId: string | undefined, options) => {
    await openCommand({
      repo: options.repo,
      runId
    });
  });

// Status command - hidden (runr without args is the front door)
program
  .command('status', { hidden: true })
  .description('Show run status')
  .argument('[runId]', 'Run ID (defaults to latest)')
  .option('--repo <path>', 'Target repo path', '.')
  .option('--all', 'Show status of all runs', false)
  .action(async (runId: string | undefined, options) => {
    if (options.all) {
      await statusAllCommand({ repo: options.repo });
    } else {
      const { findLatestRunId } = await import('./store/run-utils.js');
      const resolvedRunId = runId || findLatestRunId(options.repo);

      if (!resolvedRunId) {
        console.error('Error: No runs found. Specify --run-id or create a run first.');
        process.exit(1);
      }

      await statusCommand({ runId: resolvedRunId, repo: options.repo });
    }
  });

// ============================================================================
// FRONT DOOR
// ============================================================================

/**
 * Load diagnosis data for a stopped run.
 */
async function loadDiagnosisData(
  stopJsonPath: string | null,
  diagnosticsPath: string | null
): Promise<{ stopDiagnosis: StopDiagnosisJson | null; stopExplainer: StopDiagnostics | null }> {
  let stopDiagnosis: StopDiagnosisJson | null = null;
  let stopExplainer: StopDiagnostics | null = null;

  if (stopJsonPath && fs.existsSync(stopJsonPath)) {
    try {
      stopDiagnosis = JSON.parse(fs.readFileSync(stopJsonPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  if (diagnosticsPath && fs.existsSync(diagnosticsPath)) {
    try {
      stopExplainer = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf-8'));
    } catch {
      // Ignore parse errors
    }
  }

  return { stopDiagnosis, stopExplainer };
}

/**
 * Front door command - shows status and next actions when runr is called with no args.
 */
async function frontDoorCommand(options: { repo: string; json?: boolean }): Promise<void> {
  const repoPath = options.repo || process.cwd();

  // Resolve repo state
  const state = await resolveRepoState(repoPath);

  // Load diagnosis data if we have a stopped run
  let stopDiagnosis: StopDiagnosisJson | null = null;
  let stopExplainer: StopDiagnostics | null = null;

  if (state.latestStopped) {
    const diagData = await loadDiagnosisData(
      state.latestStopped.stopJsonPath,
      state.latestStopped.diagnosticsPath
    );
    stopDiagnosis = diagData.stopDiagnosis;
    stopExplainer = diagData.stopExplainer;
  }

  // Compute brain output
  const brainOutput = computeBrain({
    state,
    stopDiagnosis,
    stopExplainer,
  });

  // Record telemetry
  const runIdForTelemetry = state.latestStopped?.runId ?? state.activeRun?.runId;
  recordFrontDoor(repoPath, runIdForTelemetry);

  // Render output
  if (options.json) {
    console.log(formatBrainJson(brainOutput));
  } else {
    console.log(formatFrontDoor(brainOutput));
  }
}

// Handle no-args case: show front door instead of help
const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0].startsWith('-');
const isHelp = args.includes('--help') || args.includes('-h');
const isVersion = args.includes('--version') || args.includes('-V');

if (!hasCommand && !isHelp && !isVersion) {
  // No command provided - show front door
  const jsonFlag = args.includes('--json');
  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 && args[repoIdx + 1] ? args[repoIdx + 1] : '.';

  frontDoorCommand({ repo, json: jsonFlag }).catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  });
} else {
  // Normal command parsing
  program.parseAsync();
}
