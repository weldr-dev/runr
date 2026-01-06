/**
 * Run Receipt writer - generates receipt artifacts at terminal state
 *
 * Writes:
 * - receipt.json: baseline + checkpoint metadata
 * - diffstat.txt: git diff --stat output
 * - files.txt: list of changed files, one per line
 *
 * All operations are best-effort and never crash the run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { RunStore } from '../store/run-store.js';

export interface ReceiptJson {
  base_sha: string | null;
  checkpoint_sha: string | null;
  verification_tier: string | null;
  terminal_state: 'complete' | 'stopped' | 'failed';
  files_changed: number;
  lines_added: number;
  lines_deleted: number;
}

export interface WriteReceiptOptions {
  runStore: RunStore;
  repoPath: string;
  baseSha: string | null;
  checkpointSha: string | null;
  verificationTier: string | null;
  terminalState: 'complete' | 'stopped' | 'failed';
}

/**
 * Write receipt artifacts at terminal state.
 * Best-effort: logs warnings but never throws.
 */
export async function writeReceipt(options: WriteReceiptOptions): Promise<void> {
  const { runStore, repoPath, baseSha, checkpointSha, verificationTier, terminalState } = options;

  // If no base_sha, we can't compute diffs
  if (!baseSha) {
    console.warn('Warning: Cannot generate receipt - base_sha missing');
    return;
  }

  const headSha = checkpointSha || await getCurrentHead(repoPath);
  if (!headSha) {
    console.warn('Warning: Cannot generate receipt - unable to determine HEAD');
    return;
  }

  try {
    // Get diff stats
    const diffStats = getDiffStats(repoPath, baseSha, headSha);

    // Write receipt.json
    const receipt: ReceiptJson = {
      base_sha: baseSha,
      checkpoint_sha: checkpointSha,
      verification_tier: verificationTier,
      terminal_state: terminalState,
      files_changed: diffStats.files.length,
      lines_added: diffStats.linesAdded,
      lines_deleted: diffStats.linesDeleted
    };

    const receiptPath = path.join(runStore.path, 'receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

    // Write diffstat.txt
    const diffstatPath = path.join(runStore.path, 'diffstat.txt');
    fs.writeFileSync(diffstatPath, diffStats.diffstat);

    // Write files.txt (one file per line, capped at 500)
    const filesPath = path.join(runStore.path, 'files.txt');
    let filesContent = diffStats.files.slice(0, 500).join('\n');
    if (diffStats.files.length > 500) {
      filesContent += `\n...truncated, ${diffStats.files.length - 500} more files`;
    }
    fs.writeFileSync(filesPath, filesContent);

  } catch (err) {
    console.warn(`Warning: Failed to write receipt: ${(err as Error).message}`);
  }
}

interface DiffStats {
  files: string[];
  linesAdded: number;
  linesDeleted: number;
  diffstat: string;
}

/**
 * Get diff statistics between two commits.
 */
function getDiffStats(repoPath: string, baseSha: string, headSha: string): DiffStats {
  const files: string[] = [];
  let linesAdded = 0;
  let linesDeleted = 0;

  // Get numstat for file-level stats
  try {
    const numstat = execSync(`git diff --numstat ${baseSha}..${headSha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
    });

    for (const line of numstat.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parseInt(parts[0], 10) || 0;
        const deleted = parseInt(parts[1], 10) || 0;
        const filePath = parts[2];

        files.push(filePath);
        linesAdded += added;
        linesDeleted += deleted;
      }
    }
  } catch (err) {
    // If diff fails (e.g., no commits), return empty stats
    console.warn(`Warning: git diff --numstat failed: ${(err as Error).message}`);
  }

  // Get diffstat for human-readable summary
  let diffstat = '';
  try {
    diffstat = execSync(`git diff --stat ${baseSha}..${headSha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    }).trim();
  } catch (err) {
    console.warn(`Warning: git diff --stat failed: ${(err as Error).message}`);
  }

  return { files, linesAdded, linesDeleted, diffstat };
}

/**
 * Get the current HEAD SHA.
 */
async function getCurrentHead(repoPath: string): Promise<string | null> {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf-8'
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Extract base_sha from config.snapshot.json
 */
export function extractBaseSha(runStorePath: string): string | null {
  try {
    const configPath = path.join(runStorePath, 'config.snapshot.json');
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Check worktree info first (most common for runs)
    if (config._worktree?.base_sha) {
      return config._worktree.base_sha;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Derive terminal state from stop_reason.
 */
export function deriveTerminalState(stopReason: string | undefined): 'complete' | 'stopped' | 'failed' {
  if (!stopReason) {
    return 'stopped';
  }

  if (stopReason === 'complete') {
    return 'complete';
  }

  // These are considered failures
  const failureReasons = [
    'verification_failed_max_retries',
    'guard_violation',
    'ownership_violation',
    'plan_scope_violation'
  ];

  if (failureReasons.includes(stopReason)) {
    return 'failed';
  }

  // Everything else is a stop (can be resumed)
  return 'stopped';
}
