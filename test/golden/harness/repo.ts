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
 * Get runr paths via CLI (canonical source of truth).
 */
export async function getRunrPathsViaCLI(repoPath: string): Promise<{
  repo_root: string;
  runr_root: string;
  runs_dir: string;
  orchestrations_dir: string;
  using_legacy: boolean;
} | null> {
  const result = await runCommand('npx', ['runr', 'paths', '--json'], {
    cwd: repoPath,
    timeout: 10000
  });

  if (result.exitCode !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** @deprecated Use getRunrPathsViaCLI instead */
export const getAgentPathsViaCLI = getRunrPathsViaCLI;

/**
 * Read the latest orchestration ID from a test repo.
 * Checks both new path (.runr/orchestrations/ or .agent/orchestrations/) and legacy path.
 */
export function getLatestOrchestrationId(repoPath: string): string | null {
  const ids: string[] = [];

  // Check new canonical path: .runr/orchestrations/
  const newRunrOrchDir = path.join(repoPath, '.runr', 'orchestrations');
  if (fs.existsSync(newRunrOrchDir)) {
    for (const e of fs.readdirSync(newRunrOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch')) {
        ids.push(e.name);
      }
    }
  }

  // Check legacy path: .agent/orchestrations/
  const legacyOrchDir = path.join(repoPath, '.agent', 'orchestrations');
  if (fs.existsSync(legacyOrchDir)) {
    for (const e of fs.readdirSync(legacyOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch') && !ids.includes(e.name)) {
        ids.push(e.name);
      }
    }
  }

  // Check very old legacy path: .agent/runs/orchestrations/
  const veryOldLegacyOrchDir = path.join(repoPath, '.agent', 'runs', 'orchestrations');
  if (fs.existsSync(veryOldLegacyOrchDir)) {
    for (const e of fs.readdirSync(veryOldLegacyOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch') && !ids.includes(e.name)) {
        ids.push(e.name);
      }
    }
  }

  if (ids.length === 0) {
    return null;
  }

  ids.sort().reverse();
  return ids[0];
}

/**
 * Read orchestration state from a test repo.
 * Checks new (.runr/) and legacy (.agent/) paths.
 */
export function readOrchestrationState(repoPath: string, orchId: string): unknown | null {
  // Try new canonical path first: .runr/orchestrations/
  const newRunrStatePath = path.join(repoPath, '.runr', 'orchestrations', orchId, 'state.json');
  if (fs.existsSync(newRunrStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(newRunrStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Try legacy path: .agent/orchestrations/
  const legacyStatePath = path.join(repoPath, '.agent', 'orchestrations', orchId, 'state.json');
  if (fs.existsSync(legacyStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(legacyStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Fall back to very old legacy path: .agent/runs/orchestrations/
  const veryOldLegacyStatePath = path.join(repoPath, '.agent', 'runs', 'orchestrations', orchId, 'state.json');
  if (fs.existsSync(veryOldLegacyStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(veryOldLegacyStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  return null;
}
