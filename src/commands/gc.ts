import fs from 'node:fs';
import path from 'node:path';

export interface GcOptions {
  dryRun: boolean;
  olderThan: number; // days
}

interface RunInfo {
  runId: string;
  runPath: string;
  worktreePath: string | null;
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
 * Scan all runs and gather worktree info
 */
function scanRuns(runsDir: string): RunInfo[] {
  const runs: RunInfo[] = [];
  const now = new Date();

  if (!fs.existsSync(runsDir)) {
    return runs;
  }

  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Skip non-run directories (run IDs are timestamps like 20251225171118)
    if (!/^\d{14}$/.test(entry.name)) continue;

    const runPath = path.join(runsDir, entry.name);
    const worktreePath = path.join(runPath, 'worktree');

    let worktreeSize = 0;
    let worktreeModified: Date | null = null;
    let ageDays: number | null = null;

    if (fs.existsSync(worktreePath)) {
      worktreeSize = getDirSize(worktreePath);
      worktreeModified = getDirModTime(worktreePath);
      if (worktreeModified) {
        ageDays = Math.floor((now.getTime() - worktreeModified.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    runs.push({
      runId: entry.name,
      runPath,
      worktreePath: fs.existsSync(worktreePath) ? worktreePath : null,
      worktreeSize,
      worktreeModified,
      ageDays
    });
  }

  return runs.sort((a, b) => a.runId.localeCompare(b.runId));
}

export async function gcCommand(options: GcOptions): Promise<void> {
  const runsDir = path.resolve('runs');
  const runs = scanRuns(runsDir);

  // Calculate totals
  const totalRuns = runs.length;
  const runsWithWorktree = runs.filter(r => r.worktreePath !== null);
  const totalWorktreeSize = runsWithWorktree.reduce((sum, r) => sum + r.worktreeSize, 0);

  // Find runs eligible for cleanup
  const eligibleForCleanup = runsWithWorktree.filter(r =>
    r.ageDays !== null && r.ageDays >= options.olderThan
  );
  const cleanupSize = eligibleForCleanup.reduce((sum, r) => sum + r.worktreeSize, 0);

  console.log('=== Disk Usage Summary ===\n');
  console.log(`Total runs: ${totalRuns}`);
  console.log(`Runs with worktree: ${runsWithWorktree.length}`);
  console.log(`Total worktree size: ${formatSize(totalWorktreeSize)}`);
  console.log('');

  if (runsWithWorktree.length > 0) {
    console.log('=== Worktree Details ===\n');
    console.log('| Run ID         | Age (days) | Size     |');
    console.log('|----------------|------------|----------|');
    for (const run of runsWithWorktree) {
      const age = run.ageDays !== null ? String(run.ageDays).padStart(10) : '       N/A';
      const size = formatSize(run.worktreeSize).padStart(8);
      console.log(`| ${run.runId} | ${age} | ${size} |`);
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
    const msg = `${options.dryRun ? '[DRY RUN] Would delete' : 'Deleting'}: ${run.runId}/worktree (${formatSize(run.worktreeSize)}, ${run.ageDays}d old)`;
    console.log(msg);

    if (!options.dryRun && run.worktreePath) {
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
