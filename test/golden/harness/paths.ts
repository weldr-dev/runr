/**
 * Path utilities for golden scenario tests.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const GOLDEN_ROOT = path.resolve(__dirname, '..');
export const HARNESS_DIR = path.resolve(GOLDEN_ROOT, 'harness');
export const FIXTURES_DIR = path.resolve(GOLDEN_ROOT, 'fixtures');
export const SCENARIOS_DIR = path.resolve(GOLDEN_ROOT, 'scenarios');
export const MINI_REPO_FIXTURE = path.resolve(FIXTURES_DIR, 'mini-repo');

/**
 * Get paths for a specific scenario.
 */
export function getScenarioPaths(scenarioId: string) {
  const scenarioDir = path.join(SCENARIOS_DIR, scenarioId);
  return {
    root: scenarioDir,
    tracks: path.join(scenarioDir, 'tracks.yaml'),
    tasks: path.join(scenarioDir, 'tasks'),
    expect: path.join(scenarioDir, 'expect.json'),
    hooks: path.join(scenarioDir, 'hooks.json')
  };
}

/**
 * Get paths for orchestration artifacts in a test repo.
 */
export function getOrchestrationPaths(repoPath: string, orchId?: string) {
  const agentDir = path.join(repoPath, '.agent');
  const orchestrationsDir = path.join(agentDir, 'orchestrations');

  if (orchId) {
    const orchDir = path.join(orchestrationsDir, orchId);
    return {
      agent: agentDir,
      orchestrations: orchestrationsDir,
      orch: orchDir,
      state: path.join(orchDir, 'state.json'),
      handoffs: path.join(orchDir, 'handoffs'),
      complete: path.join(orchDir, 'handoffs', 'complete.json'),
      stop: path.join(orchDir, 'handoffs', 'stop.json'),
      summary: path.join(orchDir, 'handoffs', 'summary.json'),
      markdown: path.join(orchDir, 'handoffs', 'orchestration.md')
    };
  }

  return {
    agent: agentDir,
    orchestrations: orchestrationsDir
  };
}
