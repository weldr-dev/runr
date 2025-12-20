import fs from 'node:fs';
import path from 'node:path';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { AgentConfig, agentConfigSchema } from '../config/schema.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { runSupervisorLoop } from '../supervisor/runner.js';

export interface ResumeOptions {
  runId: string;
  time: number;
  maxTicks: number;
  allowDeps: boolean;
  config?: string;
}

function readConfigSnapshot(runDir: string): AgentConfig | null {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }
  const raw = fs.readFileSync(snapshotPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return agentConfigSchema.parse(parsed);
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

  const configSnapshot = readConfigSnapshot(runStore.path);
  const config =
    configSnapshot ??
    loadConfig(resolveConfigPath(state.repo_path, options.config));
  const taskText = readTaskArtifact(runStore.path);

  const updated: RunState = {
    ...state,
    resume_token: options.runId,
    updated_at: new Date().toISOString()
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
    repoPath: state.repo_path,
    taskText,
    config,
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    allowDeps: options.allowDeps
  });
}
