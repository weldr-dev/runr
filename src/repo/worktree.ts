import fs from 'node:fs';
import path from 'node:path';
import { git, gitOptional } from './git.js';

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
 * @param worktreePath - Where to create the worktree (e.g., runs/<id>/worktree)
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

  // Validate worktree was created successfully (git throws on error)
  await git(['status', '--porcelain'], worktreePath);

  // Symlink node_modules from original repo if present (for npm/pnpm projects)
  const originalNodeModules = path.join(originalRepoPath, 'node_modules');
  const worktreeNodeModules = path.join(worktreePath, 'node_modules');
  if (fs.existsSync(originalNodeModules) && !fs.existsSync(worktreeNodeModules)) {
    fs.symlinkSync(originalNodeModules, worktreeNodeModules, 'dir');
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
