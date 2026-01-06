/**
 * runr audit - View project history classified by provenance
 *
 * Shows the timeline of commits classified as:
 * - CHECKPOINT: Runr checkpoint commits with receipts
 * - INTERVENTION: Manual work recorded via runr intervene
 * - ATTRIBUTED: Has Runr trailers but no receipt
 * - GAP: No Runr attribution (audit gap)
 *
 * Usage:
 *   runr audit                           # Last 50 commits on current branch
 *   runr audit --range main~80..main     # Custom range
 *   runr audit --run <run_id>            # Commits for specific run
 *   runr audit --json                    # JSON output
 */

import { execSync } from 'node:child_process';
import {
  parseGitLog,
  classifyCommits,
  generateSummary,
  formatClassification,
  getClassificationIcon,
  type AuditSummary,
  type ClassifiedCommit
} from '../audit/classifier.js';

export interface AuditOptions {
  repo: string;
  range?: string;
  runId?: string;
  limit?: number;
  json?: boolean;
}

/**
 * Get the default branch for range.
 */
function getDefaultBranch(repoPath: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Build the git range string.
 */
function buildRange(options: AuditOptions): string {
  if (options.range) {
    return options.range;
  }

  const branch = getDefaultBranch(options.repo);
  const limit = options.limit || 50;
  return `${branch}~${limit}..${branch}`;
}

/**
 * Print table of classified commits.
 */
function printTable(commits: ClassifiedCommit[]): void {
  // Column headers
  const headers = ['', 'SHA', 'TYPE', 'RUN ID', 'SUBJECT'];

  // Calculate column widths (fixed for readability)
  const widths = [2, 7, 12, 14, 50];

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(headerLine);
  console.log('-'.repeat(headerLine.length));

  // Print rows (most recent first)
  for (const commit of commits) {
    const icon = getClassificationIcon(commit.classification);
    const type = formatClassification(commit.classification);
    const runId = commit.runId || '-';
    const subject = commit.subject.length > widths[4]
      ? commit.subject.slice(0, widths[4] - 3) + '...'
      : commit.subject;

    const row = [
      icon.padEnd(widths[0]),
      commit.shortSha.padEnd(widths[1]),
      type.padEnd(widths[2]),
      runId.padEnd(widths[3]),
      subject.padEnd(widths[4])
    ];
    console.log(row.join('  '));
  }
}

/**
 * Print summary section.
 */
function printSummary(summary: AuditSummary): void {
  const { counts, gaps, runsReferenced } = summary;

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total commits: ${counts.total}`);
  console.log(`  ✓ Checkpoints:    ${counts.runr_checkpoint}`);
  console.log(`  ⚡ Interventions:  ${counts.runr_intervention}`);
  console.log(`  ○ Attributed:     ${counts.manual_attributed}`);
  console.log(`  ? Gaps:           ${counts.gap}`);

  if (runsReferenced.length > 0) {
    console.log('');
    console.log(`Runs referenced: ${runsReferenced.length}`);
    const displayRuns = runsReferenced.slice(0, 5);
    for (const runId of displayRuns) {
      console.log(`  ${runId}`);
    }
    if (runsReferenced.length > 5) {
      console.log(`  ...${runsReferenced.length - 5} more`);
    }
  }

  // Audit health indicator
  console.log('');
  const coverage = counts.total > 0
    ? Math.round(((counts.runr_checkpoint + counts.runr_intervention) / counts.total) * 100)
    : 0;

  if (gaps.length === 0) {
    console.log(`Audit status: ✓ CLEAN (${coverage}% coverage)`);
  } else if (gaps.length <= 3) {
    console.log(`Audit status: ⚠ ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${coverage}% coverage)`);
  } else {
    console.log(`Audit status: ✗ ${gaps.length} gaps (${coverage}% coverage)`);
  }

  // Show top gaps if any
  if (gaps.length > 0) {
    console.log('');
    console.log('Top gaps (unattributed commits):');
    const displayGaps = gaps.slice(0, 5);
    for (const gap of displayGaps) {
      console.log(`  ${gap.shortSha} ${gap.subject.slice(0, 50)}`);
    }
    if (gaps.length > 5) {
      console.log(`  ...${gaps.length - 5} more`);
    }
  }
}

/**
 * Filter commits for a specific run.
 */
function filterByRun(commits: ClassifiedCommit[], runId: string): ClassifiedCommit[] {
  return commits.filter(c => c.runId === runId);
}

/**
 * Audit command: View project history by provenance.
 */
export async function auditCommand(options: AuditOptions): Promise<void> {
  const range = buildRange(options);

  // Parse git log
  let commits = parseGitLog(options.repo, range);

  if (commits.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'no_commits', range }, null, 2));
    } else {
      console.log(`No commits found in range: ${range}`);
    }
    return;
  }

  // Classify commits
  commits = classifyCommits(commits, options.repo);

  // Filter by run if specified
  if (options.runId) {
    commits = filterByRun(commits, options.runId);
    if (commits.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_commits_for_run', runId: options.runId }, null, 2));
      } else {
        console.log(`No commits found for run: ${options.runId}`);
      }
      return;
    }
  }

  // Generate summary
  const summary = generateSummary(commits, range);

  // Output
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Audit: ${range}`);
    if (options.runId) {
      console.log(`Filtered by run: ${options.runId}`);
    }
    console.log('');

    printTable(commits);
    printSummary(summary);
    console.log('');
  }
}
