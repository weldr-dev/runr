import fs from 'node:fs';
import path from 'node:path';
import { git, gitOptional } from './git.js';

/**
 * Resolve the actual git directory for a worktree.
 * In a worktree, .git is a file containing "gitdir: <path>".
 * In a normal repo, .git is the directory itself.
 */
function resolveWorktreeGitDir(worktreePath: string): string {
  const dotGitPath = path.join(worktreePath, '.git');

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGitPath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new Error(`Worktree missing .git file/dir at ${dotGitPath} (worktreePath=${worktreePath})`);
    }
    throw err;
  }

  if (stat.isDirectory()) {
    return dotGitPath;
  }

  // Worktree: .git is a file with "gitdir: ..."
  const content = fs.readFileSync(dotGitPath, 'utf8').trim();
  const m = content.match(/^gitdir:\s*(.+)\s*$/i);
  if (!m) {
    throw new Error(`Unexpected .git file format at ${dotGitPath}: ${content.slice(0, 120)}`);
  }

  const gitdirPath = m[1].trim();

  // gitdir can be relative to worktreePath
  return path.isAbsolute(gitdirPath)
    ? gitdirPath
    : path.resolve(worktreePath, gitdirPath);
}

/**
 * Add patterns to .git/info/exclude.
 * This prevents env artifacts like node_modules symlinks from showing as untracked.
 */
function upsertInfoExclude(gitdir: string, patterns: string[]): void {
  const infoDir = path.join(gitdir, 'info');
  const excludePath = path.join(infoDir, 'exclude');

  fs.mkdirSync(infoDir, { recursive: true });

  const existing = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, 'utf8')
    : '';

  const existingLines = new Set(
    existing
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'))
  );

  // Find patterns we need to add
  const toAdd = patterns.filter(p => !existingLines.has(p));
  if (toAdd.length === 0) return;

  // Build new content
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const header = existing.includes('# agent-framework env ignores')
    ? ''
    : '# agent-framework env ignores\n';

  const addition = (needsNewline ? '\n' : '') + header + toAdd.map(p => `${p}\n`).join('');

  fs.writeFileSync(excludePath, existing + addition, 'utf8');
}

/**
 * Ensure repository-level git excludes for agent artifacts.
 * Call this at run start (before preflight) to prevent .agent/ and .agent-worktrees/
 * from showing as dirty even on fresh repos without a .gitignore entry.
 *
 * This writes to the MAIN repo's .git/info/exclude (not tracked, no history pollution).
 *
 * @param repoRoot - The target repository root path
 * @param patterns - Patterns to add (e.g., ['.agent', '.agent/', '.agent-worktrees'])
 */
export function ensureRepoInfoExclude(repoRoot: string, patterns: string[]): void {
  const mainGitDir = path.join(repoRoot, '.git');
  // Only proceed if this looks like a git repo
  if (!fs.existsSync(mainGitDir) || !fs.statSync(mainGitDir).isDirectory()) {
    return;
  }
  upsertInfoExclude(mainGitDir, patterns);
}

export interface WorktreeInfo {
  worktree_enabled: boolean;
  original_repo_path: string;
  effective_repo_path: string;
  base_sha: string;
  run_branch?: string;
  created_at: string;
}

/**
 * Create a git worktree for isolated run execution.
 *
 * @param originalRepoPath - The source repository path
 * @param worktreePath - Where to create the worktree (e.g., worktrees/<id>)
 * @param runBranch - Optional branch name to create/use
 * @returns WorktreeInfo with paths and base SHA
 */
export async function createWorktree(
  originalRepoPath: string,
  worktreePath: string,
  runBranch?: string
): Promise<WorktreeInfo> {
  // Get current HEAD SHA as base
  const headResult = await git(['rev-parse', 'HEAD'], originalRepoPath);
  const baseSha = headResult.stdout.trim();

  // Ensure parent directory exists
  const parentDir = path.dirname(worktreePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Remove existing worktree if present (from failed run)
  if (fs.existsSync(worktreePath)) {
    await gitOptional(['worktree', 'remove', '--force', worktreePath], originalRepoPath);
    // If git worktree remove failed, try rmdir
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  if (runBranch) {
    // Check if branch exists (gitOptional returns null on error/non-existent)
    const branchCheck = await gitOptional(
      ['rev-parse', '--verify', runBranch],
      originalRepoPath
    );

    if (branchCheck !== null) {
      // Branch exists, create worktree attached to it
      await git(['worktree', 'add', worktreePath, runBranch], originalRepoPath);
    } else {
      // Create new branch and worktree together
      await git(['worktree', 'add', '-b', runBranch, worktreePath, baseSha], originalRepoPath);
    }
  } else {
    // Detached HEAD at base SHA
    await git(['worktree', 'add', '--detach', worktreePath, baseSha], originalRepoPath);
  }

  // Validate worktree was created successfully and is clean
  const statusBefore = await git(['status', '--porcelain'], worktreePath);
  if (statusBefore.stdout.trim().length > 0) {
    throw new Error(`Newly created worktree is not clean:\n${statusBefore.stdout}`);
  }

  // Inject excludes into MAIN repo's .git/info/exclude (git only reads from there, not worktree gitdir)
  // This prevents env artifacts like node_modules symlinks from showing as untracked
  const mainGitDir = path.join(originalRepoPath, '.git');
  upsertInfoExclude(mainGitDir, [
    'node_modules',
    'node_modules/',
    '/node_modules',
  ]);

  // Symlink node_modules from original repo if present (for npm/pnpm projects)
  const originalNodeModules = path.join(originalRepoPath, 'node_modules');
  const worktreeNodeModules = path.join(worktreePath, 'node_modules');
  if (fs.existsSync(originalNodeModules) && !fs.existsSync(worktreeNodeModules)) {
    fs.symlinkSync(originalNodeModules, worktreeNodeModules, 'dir');
  }

  // Sanity check: worktree should still be clean after env setup
  const statusAfter = await git(['status', '--porcelain'], worktreePath);
  if (statusAfter.stdout.trim().length > 0) {
    throw new Error(`Worktree became dirty after env setup:\n${statusAfter.stdout}`);
  }

  return {
    worktree_enabled: true,
    original_repo_path: originalRepoPath,
    effective_repo_path: worktreePath,
    base_sha: baseSha,
    run_branch: runBranch,
    created_at: new Date().toISOString()
  };
}

/**
 * Validate that a worktree exists and is usable.
 *
 * @param worktreePath - Path to the worktree
 * @returns true if valid, false otherwise
 */
export async function validateWorktree(worktreePath: string): Promise<boolean> {
  if (!fs.existsSync(worktreePath)) {
    return false;
  }

  try {
    const result = await gitOptional(['rev-parse', '--is-inside-work-tree'], worktreePath);
    return result?.stdout?.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Remove a worktree cleanly.
 *
 * @param originalRepoPath - The source repository path
 * @param worktreePath - Path to the worktree to remove
 */
export async function removeWorktree(
  originalRepoPath: string,
  worktreePath: string
): Promise<void> {
  if (!fs.existsSync(worktreePath)) {
    return;
  }

  // Try git worktree remove first (cleaner)
  const result = await gitOptional(
    ['worktree', 'remove', '--force', worktreePath],
    originalRepoPath
  );

  // If git failed (result is null), manually remove
  if (result === null && fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
}

export interface WorktreeRecreateResult {
  info: WorktreeInfo;
  recreated: boolean;
  branchMismatch: boolean;
  nodeModulesSymlinked: boolean;
}

/**
 * Recreate a worktree from saved info (for resume).
 * Validates branch matches if worktree exists but has wrong branch.
 *
 * @param info - Saved worktree info from config snapshot
 * @param force - Allow recreation despite branch mismatch
 * @returns Result with updated info and flags, or throws if recreation fails
 */
export async function recreateWorktree(
  info: WorktreeInfo,
  force = false
): Promise<WorktreeRecreateResult> {
  // Check if worktree already exists and is valid
  if (await validateWorktree(info.effective_repo_path)) {
    // Ensure excludes are present in MAIN repo (upgrades old worktrees created before this fix)
    const mainGitDir = path.join(info.original_repo_path, '.git');
    upsertInfoExclude(mainGitDir, ['node_modules', 'node_modules/', '/node_modules']);

    // Verify branch matches if one was specified
    if (info.run_branch) {
      const currentBranchResult = await gitOptional(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        info.effective_repo_path
      );
      const currentBranch = currentBranchResult?.stdout?.trim();

      if (currentBranch && currentBranch !== info.run_branch) {
        if (!force) {
          throw new Error(
            `Branch mismatch: worktree is on '${currentBranch}' but run was on '${info.run_branch}'. ` +
            `Use --force to override.`
          );
        }
        console.warn(
          `WARNING: Branch mismatch (expected '${info.run_branch}', found '${currentBranch}'). Continuing due to --force.`
        );
        return {
          info,
          recreated: false,
          branchMismatch: true,
          nodeModulesSymlinked: fs.existsSync(path.join(info.effective_repo_path, 'node_modules'))
        };
      }
    }

    return {
      info,
      recreated: false,
      branchMismatch: false,
      nodeModulesSymlinked: fs.existsSync(path.join(info.effective_repo_path, 'node_modules'))
    };
  }

  // Recreate from original repo
  const recreatedInfo = await createWorktree(
    info.original_repo_path,
    info.effective_repo_path,
    info.run_branch
  );

  const nodeModulesPath = path.join(info.effective_repo_path, 'node_modules');
  return {
    info: recreatedInfo,
    recreated: true,
    branchMismatch: false,
    nodeModulesSymlinked: fs.existsSync(nodeModulesPath)
  };
}
