import path from 'node:path';
import fs from 'node:fs';

/**
 * Canonical runr paths structure.
 * This is the single source of truth for all runr directory locations.
 */
export interface RunrPaths {
  /** The target repository root */
  repo_root: string;
  /** The .runr (or legacy .agent) directory root */
  runr_root: string;
  /** Directory for individual run artifacts */
  runs_dir: string;
  /** Directory for worktree checkouts (outside .runr/ to avoid denylist conflicts) */
  worktrees_dir: string;
  /** Directory for orchestration state and artifacts */
  orchestrations_dir: string;
  /** Whether using legacy .agent/ location (for deprecation warnings) */
  using_legacy: boolean;
}

/** @deprecated Use RunrPaths instead */
export type AgentPaths = RunrPaths;

// Track if we've shown the deprecation warning this session
let shownLegacyWarning = false;

/**
 * Get all canonical runr paths for a repository.
 * This is the single source of truth - import this everywhere.
 *
 * Layout (new):
 * ```
 * .runr/
 *   runs/<runId>/...
 *   orchestrations/<orchId>/...
 * .runr-worktrees/
 *   <runId>/
 * ```
 *
 * Layout (legacy, still supported):
 * ```
 * .agent/
 *   runs/<runId>/...
 *   orchestrations/<orchId>/...
 * .agent-worktrees/
 *   <runId>/
 * ```
 *
 * Worktrees are stored OUTSIDE .runr/ to avoid conflicts with denylist patterns
 * like `.runr/**`. This prevents both:
 * 1. Git-level dirtiness (parent repo seeing worktree as untracked files)
 * 2. Worker-level confusion (absolute CWD containing `.runr/` matching denylist)
 *
 * Override worktrees location with RUNR_WORKTREES_DIR (or legacy AGENT_WORKTREES_DIR) env var.
 *
 * @param repoPath - The target repository path
 * @returns All runr paths as absolute paths
 */
export function getRunrPaths(repoPath: string): RunrPaths {
  const repoRoot = path.resolve(repoPath);

  // Check for new .runr/ directory first, fall back to legacy .agent/
  const newRoot = path.join(repoRoot, '.runr');
  const legacyRoot = path.join(repoRoot, '.agent');

  let runrRoot: string;
  let usingLegacy = false;

  if (fs.existsSync(newRoot)) {
    runrRoot = newRoot;
  } else if (fs.existsSync(legacyRoot)) {
    runrRoot = legacyRoot;
    usingLegacy = true;
    if (!shownLegacyWarning) {
      console.warn('\x1b[33m⚠ Deprecation: .agent/ directory is deprecated. Rename to .runr/\x1b[0m');
      shownLegacyWarning = true;
    }
  } else {
    // Neither exists - default to new location (will be created on first run)
    runrRoot = newRoot;
  }

  // Worktrees: check new env var first, then legacy, then default
  const worktreesOverride = process.env.RUNR_WORKTREES_DIR || process.env.AGENT_WORKTREES_DIR;
  let worktreesDir: string;

  if (worktreesOverride) {
    worktreesDir = path.isAbsolute(worktreesOverride)
      ? worktreesOverride
      : path.resolve(repoRoot, worktreesOverride);
  } else if (usingLegacy) {
    worktreesDir = path.join(repoRoot, '.agent-worktrees');
  } else {
    worktreesDir = path.join(repoRoot, '.runr-worktrees');
  }

  return {
    repo_root: repoRoot,
    runr_root: runrRoot,
    runs_dir: path.join(runrRoot, 'runs'),
    worktrees_dir: worktreesDir,
    orchestrations_dir: path.join(runrRoot, 'orchestrations'),
    using_legacy: usingLegacy
  };
}

/**
 * @deprecated Use getRunrPaths instead
 */
export function getAgentPaths(repoPath: string): RunrPaths {
  return getRunrPaths(repoPath);
}

/**
 * Get the runs root directory for a given repo path.
 * @deprecated Use getRunrPaths(repoPath).runs_dir instead
 */
export function getRunsRoot(repoPath: string): string {
  return getRunrPaths(repoPath).runs_dir;
}

/**
 * Get the worktrees root directory for a given repo path.
 */
export function getWorktreesRoot(repoPath: string): string {
  return getRunrPaths(repoPath).worktrees_dir;
}

/**
 * Get the run directory for a specific run ID within a repo.
 *
 * @param repoPath - The target repository path
 * @param runId - The run ID (timestamp format)
 * @returns The absolute path to the run directory
 */
export function getRunDir(repoPath: string, runId: string): string {
  return path.join(getRunrPaths(repoPath).runs_dir, runId);
}

/**
 * Get the orchestrations root directory.
 *
 * @param repoPath - The target repository path
 * @returns The absolute path to the orchestrations directory
 */
export function getOrchestrationsRoot(repoPath: string): string {
  return getRunrPaths(repoPath).orchestrations_dir;
}

/**
 * Legacy orchestrations path (for migration).
 * Old location was nested under runs.
 */
export function getLegacyOrchestrationsRoot(repoPath: string): string {
  return path.join(getRunrPaths(repoPath).runs_dir, 'orchestrations');
}
