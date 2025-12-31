import path from 'node:path';

/**
 * Canonical agent paths structure.
 * This is the single source of truth for all agent directory locations.
 */
export interface AgentPaths {
  /** The target repository root */
  repo_root: string;
  /** The .agent directory root */
  agent_root: string;
  /** Directory for individual run artifacts */
  runs_dir: string;
  /** Directory for worktree checkouts */
  worktrees_dir: string;
  /** Directory for orchestration state and artifacts */
  orchestrations_dir: string;
}

/**
 * Get all canonical agent paths for a repository.
 * This is the single source of truth - import this everywhere.
 *
 * Layout:
 * ```
 * .agent/
 *   runs/<runId>/...
 *   worktrees/<runId>/
 *   orchestrations/<orchId>/...
 * ```
 *
 * @param repoPath - The target repository path
 * @returns All agent paths as absolute paths
 */
export function getAgentPaths(repoPath: string): AgentPaths {
  const repoRoot = path.resolve(repoPath);
  const agentRoot = path.join(repoRoot, '.agent');

  return {
    repo_root: repoRoot,
    agent_root: agentRoot,
    runs_dir: path.join(agentRoot, 'runs'),
    worktrees_dir: path.join(agentRoot, 'worktrees'),
    orchestrations_dir: path.join(agentRoot, 'orchestrations')
  };
}

/**
 * Get the runs root directory for a given repo path.
 * @deprecated Use getAgentPaths(repoPath).runs_dir instead
 */
export function getRunsRoot(repoPath: string): string {
  return getAgentPaths(repoPath).runs_dir;
}

/**
 * Get the worktrees root directory for a given repo path.
 */
export function getWorktreesRoot(repoPath: string): string {
  return getAgentPaths(repoPath).worktrees_dir;
}

/**
 * Get the run directory for a specific run ID within a repo.
 *
 * @param repoPath - The target repository path
 * @param runId - The run ID (timestamp format)
 * @returns The absolute path to the run directory
 */
export function getRunDir(repoPath: string, runId: string): string {
  return path.join(getAgentPaths(repoPath).runs_dir, runId);
}

/**
 * Get the orchestrations root directory.
 *
 * @param repoPath - The target repository path
 * @returns The absolute path to the orchestrations directory
 */
export function getOrchestrationsRoot(repoPath: string): string {
  return getAgentPaths(repoPath).orchestrations_dir;
}

/**
 * Legacy orchestrations path (for migration).
 * Old location was nested under runs.
 */
export function getLegacyOrchestrationsRoot(repoPath: string): string {
  return path.join(getAgentPaths(repoPath).runs_dir, 'orchestrations');
}
