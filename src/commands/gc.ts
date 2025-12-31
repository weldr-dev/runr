import fs from 'node:fs';
import path from 'node:path';
import { getAgentPaths } from '../store/runs-root.js';

export interface GcOptions {
  dryRun: boolean;
  olderThan: number; // days
  repo: string;
}

interface WorktreeInfo {
  runId: string;
  label: string;
  worktreePath: string;
  worktreeSize: number;
  worktreeModified: Date | null;
  ageDays: number | null;
}

/**
 * Get directory size recursively (in bytes)
 */
function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        size += getDirSize(itemPath);
      } else if (item.isFile()) {
        const stat = fs.statSync(itemPath);
        size += stat.size;
      }
    }
  } catch {
    // Ignore errors (permission denied, etc.)
  }
  return size;
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * Get modification time of directory (most recent file)
 */
function getDirModTime(dirPath: string): Date | null {
  try {
    const stat = fs.statSync(dirPath);
    return stat.mtime;
  } catch {
    return null;
  }
}

/**
 * Recursively delete a directory
 */
function rmDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Scan worktrees (current and legacy) and gather usage info
 */
function listRunIds(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{14}$/.test(entry.name))
    .map(entry => entry.name);
}

function scanWorktrees(runsDir: string, worktreesDir: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const now = new Date();
  const runIds = new Set([...listRunIds(runsDir), ...listRunIds(worktreesDir)]);

  for (const runId of runIds) {
    const newPath = path.join(worktreesDir, runId);
    const legacyPath = path.join(runsDir, runId, 'worktree');

    const candidates: Array<{ path: string; label: string }> = [];
    if (fs.existsSync(newPath)) {
      candidates.push({ path: newPath, label: runId });
    }
    if (fs.existsSync(legacyPath)) {
      const label = candidates.length > 0 ? `${runId} (legacy)` : `${runId} (legacy)`;
      candidates.push({ path: legacyPath, label });
    }

    for (const candidate of candidates) {
      const worktreeSize = getDirSize(candidate.path);
      const worktreeModified = getDirModTime(candidate.path);
      const ageDays = worktreeModified
        ? Math.floor((now.getTime() - worktreeModified.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      worktrees.push({
        runId,
        label: candidate.label,
        worktreePath: candidate.path,
        worktreeSize,
        worktreeModified,
        ageDays
      });
    }
  }

  return worktrees.sort((a, b) => a.runId.localeCompare(b.runId));
}

export async function gcCommand(options: GcOptions): Promise<void> {
  const paths = getAgentPaths(options.repo);
  const worktrees = scanWorktrees(paths.runs_dir, paths.worktrees_dir);

  // Calculate totals
  const totalRuns = worktrees.length;
  const totalWorktreeSize = worktrees.reduce((sum, r) => sum + r.worktreeSize, 0);

  // Find runs eligible for cleanup
  const eligibleForCleanup = worktrees.filter(r =>
    r.ageDays !== null && r.ageDays >= options.olderThan
  );
  const cleanupSize = eligibleForCleanup.reduce((sum, r) => sum + r.worktreeSize, 0);

  console.log('=== Disk Usage Summary ===\n');
  console.log(`Total worktrees: ${totalRuns}`);
  console.log(`Total worktree size: ${formatSize(totalWorktreeSize)}`);
  console.log('');

  if (worktrees.length > 0) {
    console.log('=== Worktree Details ===\n');
    console.log('| Worktree        | Age (days) | Size     |');
    console.log('|-----------------|------------|----------|');
    for (const run of worktrees) {
      const age = run.ageDays !== null ? String(run.ageDays).padStart(10) : '       N/A';
      const size = formatSize(run.worktreeSize).padStart(8);
      console.log(`| ${run.label} | ${age} | ${size} |`);
    }
    console.log('');
  }

  if (eligibleForCleanup.length === 0) {
    console.log(`No worktrees older than ${options.olderThan} days found.`);
    return;
  }

  console.log(`=== Cleanup ${options.dryRun ? '(DRY RUN)' : ''} ===\n`);
  console.log(`Found ${eligibleForCleanup.length} worktrees older than ${options.olderThan} days`);
  console.log(`Total size to reclaim: ${formatSize(cleanupSize)}\n`);

  for (const run of eligibleForCleanup) {
    const msg = `${options.dryRun ? '[DRY RUN] Would delete' : 'Deleting'}: ${run.label} (${formatSize(run.worktreeSize)}, ${run.ageDays}d old)`;
    console.log(msg);

    if (!options.dryRun) {
      rmDir(run.worktreePath);
    }
  }

  console.log('');
  if (options.dryRun) {
    console.log(`Dry run complete. Use without --dry-run to actually delete.`);
  } else {
    console.log(`Cleanup complete. Reclaimed ${formatSize(cleanupSize)}.`);
  }
}
