/**
 * Run Receipt writer - generates receipt artifacts at terminal state
 *
 * Writes:
 * - receipt.json: baseline + checkpoint metadata
 * - diff.patch (or diff.patch.gz if compressed)
 * - diffstat.txt: git diff --stat output (always uncompressed)
 * - files.txt: list of changed files, one per line
 * - transcript.meta.json: pointer when transcript not captured
 *
 * Compression triggers (any one):
 * - Diff size > 50KB
 * - Changed lines > 2000
 * - Changed files > 100
 *
 * All operations are best-effort and never crash the run.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import type { RunStore } from '../store/run-store.js';

// Compression thresholds per spec
const COMPRESSION_SIZE_BYTES = 50 * 1024; // 50KB
const COMPRESSION_LINES = 2000;
const COMPRESSION_FILES = 100;

export interface ReceiptJson {
  base_sha: string | null;
  checkpoint_sha: string | null;
  verification_tier: string | null;
  terminal_state: 'complete' | 'stopped' | 'failed';
  files_changed: number;
  lines_added: number;
  lines_deleted: number;
  /** Tracks which artifacts were written - never points to missing files */
  artifacts_written: {
    diff_patch: boolean;
    diff_patch_gz: boolean;
    diffstat: boolean;
    files: boolean;
    transcript_log: boolean;
    transcript_meta: boolean;
  };
}

export interface WriteReceiptOptions {
  runStore: RunStore;
  repoPath: string;
  baseSha: string | null;
  checkpointSha: string | null;
  verificationTier: string | null;
  terminalState: 'complete' | 'stopped' | 'failed';
  stopReason?: string;
  runId: string;
}

export interface WriteReceiptResult {
  receipt: ReceiptJson;
  patchPath: string; // diff.patch or diff.patch.gz
  compressed: boolean;
}

/**
 * Write receipt artifacts at terminal state.
 * Best-effort: logs warnings but never throws.
 * Returns result for console output, or null on failure.
 */
export async function writeReceipt(options: WriteReceiptOptions): Promise<WriteReceiptResult | null> {
  const { runStore, repoPath, baseSha, checkpointSha, verificationTier, terminalState, runId } = options;

  // If no base_sha, we can't compute diffs
  if (!baseSha) {
    console.warn('Warning: Cannot generate receipt - base_sha missing');
    return null;
  }

  const headSha = checkpointSha || await getCurrentHead(repoPath);
  if (!headSha) {
    console.warn('Warning: Cannot generate receipt - unable to determine HEAD');
    return null;
  }

  try {
    // Get diff stats and patch
    const diffStats = getDiffStats(repoPath, baseSha, headSha);
    const patchContent = generatePatch(repoPath, baseSha, headSha);

    // Determine if compression needed
    const totalLines = diffStats.linesAdded + diffStats.linesDeleted;
    const shouldCompress =
      patchContent.length > COMPRESSION_SIZE_BYTES ||
      totalLines > COMPRESSION_LINES ||
      diffStats.files.length > COMPRESSION_FILES;

    // Track which artifacts we write
    const artifactsWritten = {
      diff_patch: false,
      diff_patch_gz: false,
      diffstat: false,
      files: false,
      transcript_log: false,
      transcript_meta: false
    };

    // Write diff.patch or diff.patch.gz
    let patchPath: string;
    if (shouldCompress) {
      patchPath = path.join(runStore.path, 'diff.patch.gz');
      const compressed = zlib.gzipSync(Buffer.from(patchContent, 'utf-8'));
      fs.writeFileSync(patchPath, compressed);
      artifactsWritten.diff_patch_gz = true;
    } else {
      patchPath = path.join(runStore.path, 'diff.patch');
      fs.writeFileSync(patchPath, patchContent);
      artifactsWritten.diff_patch = true;
    }

    // Write diffstat.txt (always uncompressed)
    const diffstatPath = path.join(runStore.path, 'diffstat.txt');
    fs.writeFileSync(diffstatPath, diffStats.diffstat);
    artifactsWritten.diffstat = true;

    // Write files.txt (one file per line, capped at 500)
    const filesPath = path.join(runStore.path, 'files.txt');
    let filesContent = diffStats.files.slice(0, 500).join('\n');
    if (diffStats.files.length > 500) {
      filesContent += `\n...truncated, ${diffStats.files.length - 500} more files`;
    }
    fs.writeFileSync(filesPath, filesContent);
    artifactsWritten.files = true;

    // Check for existing transcript.log
    const transcriptLogPath = path.join(runStore.path, 'transcript.log');
    if (fs.existsSync(transcriptLogPath)) {
      artifactsWritten.transcript_log = true;
    } else {
      // Write transcript.meta.json (transcript captured by operator)
      const transcriptMetaPath = path.join(runStore.path, 'transcript.meta.json');
      const now = new Date().toISOString();
      const transcriptMeta = {
        captured_by: 'claude_code',
        session_id: runId,
        started_at: now, // Best-effort, we don't have exact start time
        ended_at: now,
        path_hint: null,
        note: 'Transcript captured by operator'
      };
      fs.writeFileSync(transcriptMetaPath, JSON.stringify(transcriptMeta, null, 2));
      artifactsWritten.transcript_meta = true;
    }

    // Write receipt.json (includes artifacts_written for self-documentation)
    const receipt: ReceiptJson = {
      base_sha: baseSha,
      checkpoint_sha: checkpointSha,
      verification_tier: verificationTier,
      terminal_state: terminalState,
      files_changed: diffStats.files.length,
      lines_added: diffStats.linesAdded,
      lines_deleted: diffStats.linesDeleted,
      artifacts_written: artifactsWritten
    };

    const receiptPath = path.join(runStore.path, 'receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

    return {
      receipt,
      patchPath: shouldCompress ? 'diff.patch.gz' : 'diff.patch',
      compressed: shouldCompress
    };

  } catch (err) {
    console.warn(`Warning: Failed to write receipt: ${(err as Error).message}`);
    return null;
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
 * Generate patch content using robust git diff flags.
 * Per spec: --patch --binary --find-renames
 */
function generatePatch(repoPath: string, baseSha: string, headSha: string): string {
  try {
    return execSync(`git diff --patch --binary --find-renames ${baseSha}..${headSha}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large diffs
    });
  } catch (err) {
    console.warn(`Warning: git diff --patch failed: ${(err as Error).message}`);
    return '';
  }
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
 * Print Run Receipt to console.
 * Format per spec:
 *   Run <id> [<status>] <icon>
 *
 *   Changes:
 *     <file>  +N  -N
 *     ...up to 20 files...
 *
 *   Checkpoint: <sha> (verified: <tier>)  # if exists
 *
 *   Review:  .runr/runs/<id>/diff.patch
 *   Submit:  runr submit <id> --to <branch> --dry-run
 */
export interface PrintReceiptOptions {
  runId: string;
  terminalState: 'complete' | 'stopped' | 'failed';
  stopReason?: string;
  receipt: ReceiptJson;
  patchPath: string;
  compressed: boolean;
  diffstat: string;
  integrationBranch?: string;
}

export function printRunReceipt(options: PrintReceiptOptions): void {
  const {
    runId,
    terminalState,
    stopReason,
    receipt,
    patchPath,
    compressed,
    diffstat,
    integrationBranch = 'main'
  } = options;

  // Status icon
  const icon = terminalState === 'complete' ? '✓' : terminalState === 'failed' ? '✗' : '⏸';
  const statusLabel = stopReason && stopReason !== 'complete' ? `stopped: ${stopReason}` : terminalState;

  console.log('');
  console.log(`Run ${runId} [${statusLabel}] ${icon}`);
  console.log('');

  // Changes section - parse diffstat for top 20 files
  if (diffstat && diffstat.trim()) {
    console.log('Changes:');
    const lines = diffstat.split('\n').filter(line => line.includes('|'));
    const displayLines = lines.slice(0, 20);
    for (const line of displayLines) {
      console.log(`  ${line.trim()}`);
    }
    if (lines.length > 20) {
      console.log(`  ...${lines.length - 20} more files`);
    }
    console.log('');
  }

  // Checkpoint section
  if (receipt.checkpoint_sha) {
    const shortSha = receipt.checkpoint_sha.slice(0, 7);
    const verifiedNote = receipt.verification_tier
      ? ` (verified: ${receipt.verification_tier})`
      : '';
    console.log(`Checkpoint: ${shortSha}${verifiedNote}`);
    console.log('');
  }

  // Next actions
  const runDir = `.runr/runs/${runId}`;
  const patchFile = compressed ? 'diff.patch.gz (large changeset)' : patchPath;
  console.log(`Review:  ${runDir}/${patchFile}`);

  // Context-aware next action
  if (terminalState === 'complete') {
    console.log(`Submit:  runr submit ${runId} --to ${integrationBranch} --dry-run`);
  } else if (terminalState === 'stopped') {
    console.log(`Resume:  runr resume ${runId}`);
  } else {
    console.log(`Bundle:  runr runs bundle ${runId}`);
  }
  console.log('');
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
