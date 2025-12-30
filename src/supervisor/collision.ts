/**
 * File collision detection for parallel runs.
 *
 * Two-stage collision prevention:
 * 1. Pre-PLAN: Coarse check on allowlist patterns (warn-only)
 * 2. Post-PLAN: Precise check on files_expected (STOP by default)
 */

import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { getRunsRoot } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';

export interface ActiveRun {
  runId: string;
  phase: string;
  allowlist: string[];
  predictedTouchFiles: string[];
  updatedAt: string;
}

export interface AllowlistOverlap {
  runId: string;
  overlappingPatterns: string[];
}

export interface FileCollision {
  runId: string;
  collidingFiles: string[];
  phase?: string;
  updatedAt?: string;
}

export interface CollisionCheckResult {
  hasCollision: boolean;
  allowlistOverlaps: AllowlistOverlap[];
  fileCollisions: FileCollision[];
}

/**
 * Get all active (non-stopped) runs from the runs directory.
 */
export function getActiveRuns(repoPath: string, excludeRunId?: string): ActiveRun[] {
  const runsRoot = getRunsRoot(repoPath);

  if (!fs.existsSync(runsRoot)) {
    return [];
  }

  const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const activeRuns: ActiveRun[] = [];

  for (const runId of runDirs) {
    if (runId === excludeRunId) continue;

    const statePath = path.join(runsRoot, runId, 'state.json');
    if (!fs.existsSync(statePath)) continue;

    try {
      const stateRaw = fs.readFileSync(statePath, 'utf-8');
      const state: RunState = JSON.parse(stateRaw);

      // Only include running runs (not STOPPED)
      if (state.phase === 'STOPPED') continue;

      // Extract predicted touch files from milestones
      const predictedTouchFiles = extractPredictedTouchFiles(state);

      activeRuns.push({
        runId,
        phase: state.phase,
        allowlist: state.scope_lock?.allowlist ?? [],
        predictedTouchFiles,
        updatedAt: state.updated_at ?? ''
      });
    } catch {
      // Skip runs with invalid state
    }
  }

  return activeRuns;
}

/**
 * Extract union of all files_expected from milestones.
 */
function extractPredictedTouchFiles(state: RunState): string[] {
  const files = new Set<string>();

  for (const milestone of state.milestones) {
    for (const file of milestone.files_expected ?? []) {
      files.add(file);
    }
  }

  return Array.from(files);
}

/**
 * Check if two allowlist patterns could overlap.
 * Uses picomatch to test pattern intersection.
 */
export function patternsOverlap(pattern1: string, pattern2: string): boolean {
  // If patterns are identical, they definitely overlap
  if (pattern1 === pattern2) return true;

  // Extract base paths (before glob characters)
  const base1 = getPatternBase(pattern1);
  const base2 = getPatternBase(pattern2);

  // If one base is a prefix of the other, they could overlap
  if (base1.startsWith(base2) || base2.startsWith(base1)) {
    return true;
  }

  // Check if pattern1 could match pattern2's base or vice versa
  const matcher1 = picomatch(pattern1);
  const matcher2 = picomatch(pattern2);

  // Test representative paths
  if (matcher1(base2) || matcher2(base1)) {
    return true;
  }

  return false;
}

/**
 * Get the non-glob prefix of a pattern.
 */
function getPatternBase(pattern: string): string {
  const globIndex = pattern.search(/[*?[\]]/);
  if (globIndex === -1) return pattern;
  const base = pattern.slice(0, globIndex);
  // Remove trailing slash if present
  return base.replace(/\/$/, '');
}

/**
 * Stage 1: Check for allowlist pattern overlaps (coarse, warn-only).
 */
export function checkAllowlistOverlaps(
  newAllowlist: string[],
  activeRuns: ActiveRun[]
): AllowlistOverlap[] {
  const overlaps: AllowlistOverlap[] = [];

  for (const run of activeRuns) {
    const overlappingPatterns: string[] = [];

    for (const newPattern of newAllowlist) {
      for (const existingPattern of run.allowlist) {
        if (patternsOverlap(newPattern, existingPattern)) {
          overlappingPatterns.push(`${newPattern} ∩ ${existingPattern}`);
        }
      }
    }

    if (overlappingPatterns.length > 0) {
      overlaps.push({
        runId: run.runId,
        overlappingPatterns: [...new Set(overlappingPatterns)]
      });
    }
  }

  return overlaps;
}

/**
 * Stage 2: Check for exact file collisions (precise, STOP by default).
 */
export function checkFileCollisions(
  newTouchFiles: string[],
  activeRuns: ActiveRun[]
): FileCollision[] {
  const collisions: FileCollision[] = [];
  const newFilesSet = new Set(newTouchFiles);

  for (const run of activeRuns) {
    const collidingFiles: string[] = [];

    for (const file of run.predictedTouchFiles) {
      if (newFilesSet.has(file)) {
        collidingFiles.push(file);
      }
    }

    if (collidingFiles.length > 0) {
      collisions.push({
        runId: run.runId,
        collidingFiles,
        phase: run.phase,
        updatedAt: run.updatedAt
      });
    }
  }

  return collisions;
}

/**
 * Full collision check (both stages).
 */
export function checkCollisions(
  newAllowlist: string[],
  newTouchFiles: string[],
  activeRuns: ActiveRun[]
): CollisionCheckResult {
  const allowlistOverlaps = checkAllowlistOverlaps(newAllowlist, activeRuns);
  const fileCollisions = checkFileCollisions(newTouchFiles, activeRuns);

  return {
    hasCollision: fileCollisions.length > 0,
    allowlistOverlaps,
    fileCollisions
  };
}

/**
 * Format collision warning for console output.
 */
export function formatAllowlistWarning(overlaps: AllowlistOverlap[]): string {
  if (overlaps.length === 0) return '';

  const lines = [
    'WARNING: Allowlist overlap detected with active runs:',
    ''
  ];

  for (const overlap of overlaps) {
    lines.push(`  Run ${overlap.runId}:`);
    for (const pattern of overlap.overlappingPatterns.slice(0, 5)) {
      lines.push(`    - ${pattern}`);
    }
    if (overlap.overlappingPatterns.length > 5) {
      lines.push(`    ... and ${overlap.overlappingPatterns.length - 5} more`);
    }
  }

  lines.push('');
  lines.push('Consider waiting for active runs or use --force-parallel to proceed.');

  return lines.join('\n');
}

/**
 * Format age from ISO timestamp to human-readable string.
 */
function formatAge(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return '';
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return '';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Format collision error for console output.
 */
export function formatFileCollisionError(collisions: FileCollision[]): string {
  if (collisions.length === 0) return '';

  const lines = [
    'ERROR: This run will stop to avoid merge conflicts.',
    ''
  ];

  for (const collision of collisions) {
    const ageStr = formatAge(collision.updatedAt);
    const phaseStr = collision.phase ? `, ${collision.phase}` : '';
    const contextStr = ageStr || phaseStr ? ` (${[collision.phase, ageStr].filter(Boolean).join(', ')})` : '';

    const fileCount = collision.collidingFiles.length;
    const showCount = Math.min(3, fileCount);
    lines.push(`Conflicts with: ${collision.runId}${contextStr}`);
    lines.push(`  ${fileCount} file${fileCount > 1 ? 's' : ''} overlap${showCount < fileCount ? ` (showing ${showCount})` : ''}:`);

    for (const file of collision.collidingFiles.slice(0, showCount)) {
      lines.push(`    - ${file}`);
    }
  }

  lines.push('');
  lines.push('Options:');
  lines.push(`  1. Wait for run ${collisions[0].runId} to complete (recommended)`);
  lines.push('  2. Re-run with --force-parallel (may require manual merge resolution)');

  return lines.join('\n');
}

/**
 * Get collision summary for status display.
 * Returns diagnostic labels: 'none', 'allowlist' (pattern overlap), 'collision' (file conflict).
 */
export function getCollisionRisk(
  runAllowlist: string[],
  runTouchFiles: string[],
  activeRuns: ActiveRun[]
): 'none' | 'allowlist' | 'collision' {
  const result = checkCollisions(runAllowlist, runTouchFiles, activeRuns);

  if (result.fileCollisions.length > 0) {
    return 'collision';
  }

  if (result.allowlistOverlaps.length > 0) {
    return 'allowlist';
  }

  return 'none';
}
