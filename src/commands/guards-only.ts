import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { RunStore } from '../store/run-store.js';
import { buildMilestonesFromTask } from '../supervisor/planner.js';
import { runPreflight } from './preflight.js';

export interface GuardsOnlyOptions {
  repo: string;
  task: string;
  config?: string;
  allowDeps: boolean;
  allowDirty: boolean;
  noWrite: boolean;
  skipPing?: boolean;
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

export async function guardsOnlyCommand(
  options: GuardsOnlyOptions
): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const taskPath = path.resolve(options.task);
  const configPath = resolveConfigPath(repoPath, options.config);
  const config = loadConfig(configPath);
  const taskText = fs.readFileSync(taskPath, 'utf-8');
  const milestones = buildMilestonesFromTask(taskText);
  const milestoneRiskLevel = milestones[0]?.risk_level ?? 'medium';

  const runId = makeRunId();
  const slug = slugFromTask(taskPath);
  const runDir = path.resolve('runs', runId);

  const preflight = await runPreflight({
    repoPath,
    runId,
    slug,
    config,
    allowDeps: options.allowDeps,
    allowDirty: options.allowDirty,
    milestoneRiskLevel,
    skipPing: options.skipPing ?? true // Skip ping by default for guards-only
  });

  if (!options.noWrite) {
    const runStore = RunStore.init(runId);
    runStore.writeConfigSnapshot(config);
    runStore.writeArtifact('task.md', taskText);
    runStore.appendEvent({
      type: 'preflight',
      source: 'cli',
      payload: {
        repo: preflight.repo_context,
        guard: preflight.guard,
        binary: preflight.binary,
        ping: preflight.ping,
        tiers: preflight.tiers,
        tier_reasons: preflight.tier_reasons,
        allow_dirty: options.allowDirty,
        allow_deps: options.allowDeps
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

  console.log(summaryLine);
}
