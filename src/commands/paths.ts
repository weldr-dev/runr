/**
 * runr paths command - Display canonical runr directory paths.
 *
 * Single source of truth for all runr paths. Use this in scripts,
 * CI, and external tools instead of hardcoding paths.
 */

import { getRunrPaths, RunrPaths } from '../store/runs-root.js';

export interface PathsOptions {
  repo: string;
  json: boolean;
}

/**
 * Execute the paths command.
 */
export async function pathsCommand(options: PathsOptions): Promise<void> {
  const paths = getRunrPaths(options.repo);

  if (options.json) {
    console.log(JSON.stringify(paths, null, 2));
  } else {
    console.log('Runr Paths');
    console.log('==========');
    console.log('');
    console.log(`repo_root:          ${paths.repo_root}`);
    console.log(`runr_root:          ${paths.runr_root}`);
    console.log(`runs_dir:           ${paths.runs_dir}`);
    console.log(`worktrees_dir:      ${paths.worktrees_dir}`);
    console.log(`orchestrations_dir: ${paths.orchestrations_dir}`);
    if (paths.using_legacy) {
      console.log('');
      console.log('\x1b[33m⚠ Using legacy .agent/ directory. Consider migrating to .runr/\x1b[0m');
    }
  }

  process.exitCode = 0;
}
