/**
 * agent paths command - Display canonical agent directory paths.
 *
 * Single source of truth for all agent paths. Use this in scripts,
 * CI, and external tools instead of hardcoding paths.
 */

import { getAgentPaths, AgentPaths } from '../store/runs-root.js';

export interface PathsOptions {
  repo: string;
  json: boolean;
}

/**
 * Execute the paths command.
 */
export async function pathsCommand(options: PathsOptions): Promise<void> {
  const paths = getAgentPaths(options.repo);

  if (options.json) {
    console.log(JSON.stringify(paths, null, 2));
  } else {
    console.log('Agent Paths');
    console.log('===========');
    console.log('');
    console.log(`repo_root:          ${paths.repo_root}`);
    console.log(`agent_root:         ${paths.agent_root}`);
    console.log(`runs_dir:           ${paths.runs_dir}`);
    console.log(`worktrees_dir:      ${paths.worktrees_dir}`);
    console.log(`orchestrations_dir: ${paths.orchestrations_dir}`);
  }

  process.exitCode = 0;
}
