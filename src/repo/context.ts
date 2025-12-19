import path from 'node:path';
import { git, gitOptional } from './git.js';
import { RepoContext } from '../types/schemas.js';

export async function getGitRoot(repoPath: string): Promise<string> {
  const result = await git(['rev-parse', '--show-toplevel'], repoPath);
  return result.stdout.trim();
}

export async function getDefaultBranch(
  repoPath: string,
  fallback: string
): Promise<string> {
  const result = await gitOptional(
    ['symbolic-ref', 'refs/remotes/origin/HEAD'],
    repoPath
  );
  if (result?.stdout) {
    const parts = result.stdout.trim().split('/');
    const branch = parts[parts.length - 1];
    if (branch) {
      return branch;
    }
  }
  return fallback;
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const result = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
  return result.stdout.trim();
}

export async function listChangedFiles(gitRoot: string): Promise<string[]> {
  const result = await git(['status', '--porcelain'], gitRoot);
  if (!result.stdout.trim()) {
    return [];
  }
  return result.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3))
    .map((entry) => {
      const arrow = entry.indexOf('->');
      if (arrow !== -1) {
        return entry.slice(arrow + 2).trim();
      }
      return entry.trim();
    })
    .filter(Boolean);
}

export function getTouchedPackages(changedFiles: string[]): string[] {
  const packages = new Set<string>();
  for (const file of changedFiles) {
    const parts = file.split(path.sep);
    const idx = parts.indexOf('packages');
    if (idx !== -1 && parts.length > idx + 1) {
      packages.add(path.join('packages', parts[idx + 1]));
      continue;
    }
    if (parts[0] === 'package.json') {
      packages.add('root');
    }
  }
  return Array.from(packages);
}

export function toRunBranch(runId: string, slug: string): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `agent/${runId}/${safeSlug || 'task'}`;
}

export async function buildRepoContext(
  repoPath: string,
  runId: string,
  slug: string,
  defaultBranchFallback: string
): Promise<RepoContext> {
  const gitRoot = await getGitRoot(repoPath);
  const defaultBranch = await getDefaultBranch(gitRoot, defaultBranchFallback);
  const currentBranch = await getCurrentBranch(gitRoot);
  const runBranch = toRunBranch(runId, slug);
  const changedFiles = await listChangedFiles(gitRoot);
  const touchedPackages = getTouchedPackages(changedFiles);
  return {
    repo_path: repoPath,
    git_root: gitRoot,
    default_branch: defaultBranch,
    run_branch: runBranch,
    current_branch: currentBranch,
    changed_files: changedFiles,
    touched_packages: touchedPackages
  };
}
