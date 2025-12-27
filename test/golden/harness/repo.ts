/**
 * Test repository management for golden scenarios.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCommand } from './proc.js';
import { MINI_REPO_FIXTURE, getScenarioPaths } from './paths.js';

/**
 * Create a temporary test repository from the mini-repo fixture.
 */
export async function createTestRepo(scenarioId: string): Promise<string> {
  // Create temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `golden-${scenarioId}-`));

  // Copy mini-repo fixture
  copyDirRecursive(MINI_REPO_FIXTURE, tmpDir);

  // Copy scenario-specific files
  const scenarioPaths = getScenarioPaths(scenarioId);

  // Copy tracks.yaml
  if (fs.existsSync(scenarioPaths.tracks)) {
    fs.copyFileSync(scenarioPaths.tracks, path.join(tmpDir, 'tracks.yaml'));
  }

  // Copy tasks directory
  if (fs.existsSync(scenarioPaths.tasks)) {
    const tasksDir = path.join(tmpDir, 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    copyDirRecursive(scenarioPaths.tasks, tasksDir);
  }

  // Initialize git repo (use quoted strings for shell mode)
  await runCommand('git', ['init'], { cwd: tmpDir });
  await runCommand('git', ['config', 'user.email', 'test@golden.local'], { cwd: tmpDir });
  await runCommand('git', ['config', 'user.name', '"Golden Test"'], { cwd: tmpDir });
  await runCommand('git', ['add', '.'], { cwd: tmpDir });
  await runCommand('git', ['commit', '-m', '"Initial commit"'], { cwd: tmpDir });

  return tmpDir;
}

/**
 * Clean up a test repository.
 */
export function cleanupTestRepo(repoPath: string): void {
  try {
    fs.rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Copy directory recursively.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Read the latest orchestration ID from a test repo.
 */
export function getLatestOrchestrationId(repoPath: string): string | null {
  const orchDir = path.join(repoPath, '.agent', 'runs', 'orchestrations');
  if (!fs.existsSync(orchDir)) {
    return null;
  }

  const entries = fs.readdirSync(orchDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('orch'))
    .map(e => e.name)
    .sort()
    .reverse();

  return entries[0] ?? null;
}

/**
 * Read orchestration state from a test repo.
 */
export function readOrchestrationState(repoPath: string, orchId: string): unknown | null {
  const statePath = path.join(repoPath, '.agent', 'runs', 'orchestrations', orchId, 'state.json');
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    return null;
  }
}
