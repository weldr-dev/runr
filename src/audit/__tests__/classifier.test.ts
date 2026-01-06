/**
 * Tests for Audit Classifier
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  parseGitLog,
  classifyCommits,
  generateSummary,
  formatClassification,
  getClassificationIcon,
  type ClassifiedCommit
} from '../classifier.js';

describe('Audit Classifier', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    // Create temp directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Initialize git repo
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createCommit(message: string): string {
    fs.writeFileSync(path.join(repoPath, `file-${Date.now()}.txt`), message);
    execSync('git add .', { cwd: repoPath });
    execSync(`git commit -m "${message}"`, { cwd: repoPath });
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  }

  function createCommitWithTrailers(message: string, trailers: string[]): string {
    fs.writeFileSync(path.join(repoPath, `file-${Date.now()}.txt`), message);
    execSync('git add .', { cwd: repoPath });

    const fullMessage = message + '\n\n' + trailers.join('\n');
    execSync(`git commit -m "${fullMessage}"`, { cwd: repoPath });
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  }

  describe('parseGitLog', () => {
    it('parses commits from git log', () => {
      createCommit('First commit');
      createCommit('Second commit');

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      expect(commits).toHaveLength(1);
      expect(commits[0].subject).toBe('Second commit');
    });

    it('extracts commit metadata', () => {
      createCommit('First commit');
      createCommit('Test commit');

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      expect(commits[0].sha).toHaveLength(40);
      expect(commits[0].shortSha).toHaveLength(7);
      expect(commits[0].author).toBe('Test');
      expect(commits[0].date).toBeDefined();
    });

    it('extracts Runr-Run-Id trailer', () => {
      createCommit('First commit');
      createCommitWithTrailers('Checkpoint commit', [
        'Runr-Run-Id: 20260106120000'
      ]);

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      expect(commits[0].trailers.runrRunId).toBe('20260106120000');
    });

    it('extracts Runr-Reason trailer', () => {
      createCommit('First commit');
      createCommitWithTrailers('Intervention commit', [
        'Runr-Reason: review_loop'
      ]);

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      expect(commits[0].trailers.runrReason).toBe('review_loop');
    });

    it('handles commits without trailers', () => {
      createCommit('First commit');
      createCommit('Plain commit');

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      expect(commits[0].trailers).toEqual({});
    });

    it('returns empty array for invalid range', () => {
      createCommit('First commit');

      const commits = parseGitLog(repoPath, 'nonexistent..HEAD');
      expect(commits).toEqual([]);
    });
  });

  describe('classifyCommits', () => {
    it('classifies commits with Runr-Intervention trailer as intervention', () => {
      // Create commits with trailers directly in the test to verify classification logic
      const commits: ClassifiedCommit[] = [{
        sha: 'abc123',
        shortSha: 'abc123',
        subject: 'Manual fix',
        author: 'Test',
        date: '2026-01-06',
        classification: 'gap',
        trailers: {
          runrRunId: '20260106120000',
          runrIntervention: true
        }
      }];

      const classified = classifyCommits(commits, repoPath);

      expect(classified[0].classification).toBe('runr_intervention');
      expect(classified[0].runId).toBe('20260106120000');
    });

    it('classifies commits with only Runr-Run-Id as manual_attributed', () => {
      createCommit('Initial');
      createCommitWithTrailers('Task work', [
        'Runr-Run-Id: 20260106120000'
      ]);

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      const classified = classifyCommits(commits, repoPath);

      expect(classified[0].classification).toBe('manual_attributed');
    });

    it('classifies commits without trailers as gap', () => {
      createCommit('Initial');
      createCommit('Untracked work');

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      const classified = classifyCommits(commits, repoPath);

      expect(classified[0].classification).toBe('gap');
    });

    it('detects checkpoint from receipt.json', () => {
      createCommit('Initial');
      const sha = createCommit('Checkpoint commit');

      // Create run directory with receipt
      const runsDir = path.join(repoPath, '.runr', 'runs', '20260106120000');
      fs.mkdirSync(runsDir, { recursive: true });
      fs.writeFileSync(
        path.join(runsDir, 'receipt.json'),
        JSON.stringify({ checkpoint_sha: sha })
      );

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      const classified = classifyCommits(commits, repoPath);

      expect(classified[0].classification).toBe('runr_checkpoint');
      expect(classified[0].runId).toBe('20260106120000');
    });

    it('detects intervention from intervention receipt', () => {
      createCommit('Initial');
      createCommitWithTrailers('Manual work', [
        'Runr-Run-Id: 20260106120000'
      ]);

      // Create intervention receipt
      const interventionsDir = path.join(repoPath, '.runr', 'runs', '20260106120000', 'interventions');
      fs.mkdirSync(interventionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(interventionsDir, '20260106-120000-manual_fix.json'),
        JSON.stringify({ reason: 'manual_fix' })
      );

      const commits = parseGitLog(repoPath, 'HEAD~1..HEAD');
      const classified = classifyCommits(commits, repoPath);

      expect(classified[0].classification).toBe('runr_intervention');
    });
  });

  describe('generateSummary', () => {
    it('counts commits by classification', () => {
      const commits: ClassifiedCommit[] = [
        { sha: 'a', shortSha: 'a', subject: 'a', author: 'a', date: '', classification: 'runr_checkpoint', trailers: {} },
        { sha: 'b', shortSha: 'b', subject: 'b', author: 'a', date: '', classification: 'runr_intervention', trailers: {} },
        { sha: 'c', shortSha: 'c', subject: 'c', author: 'a', date: '', classification: 'gap', trailers: {} },
        { sha: 'd', shortSha: 'd', subject: 'd', author: 'a', date: '', classification: 'gap', trailers: {} }
      ];

      const summary = generateSummary(commits, 'test');

      expect(summary.counts.total).toBe(4);
      expect(summary.counts.runr_checkpoint).toBe(1);
      expect(summary.counts.runr_intervention).toBe(1);
      expect(summary.counts.gap).toBe(2);
    });

    it('collects gaps', () => {
      const commits: ClassifiedCommit[] = [
        { sha: 'a', shortSha: 'a', subject: 'checkpoint', author: 'a', date: '', classification: 'runr_checkpoint', trailers: {} },
        { sha: 'b', shortSha: 'b', subject: 'gap1', author: 'a', date: '', classification: 'gap', trailers: {} },
        { sha: 'c', shortSha: 'c', subject: 'gap2', author: 'a', date: '', classification: 'gap', trailers: {} }
      ];

      const summary = generateSummary(commits, 'test');

      expect(summary.gaps).toHaveLength(2);
      expect(summary.gaps[0].subject).toBe('gap1');
    });

    it('collects referenced runs', () => {
      const commits: ClassifiedCommit[] = [
        { sha: 'a', shortSha: 'a', subject: 'a', author: 'a', date: '', classification: 'runr_checkpoint', trailers: {}, runId: '20260106110000' },
        { sha: 'b', shortSha: 'b', subject: 'b', author: 'a', date: '', classification: 'runr_intervention', trailers: {}, runId: '20260106120000' },
        { sha: 'c', shortSha: 'c', subject: 'c', author: 'a', date: '', classification: 'runr_checkpoint', trailers: {}, runId: '20260106110000' }
      ];

      const summary = generateSummary(commits, 'test');

      expect(summary.runsReferenced).toHaveLength(2);
      expect(summary.runsReferenced).toContain('20260106110000');
      expect(summary.runsReferenced).toContain('20260106120000');
    });
  });

  describe('formatClassification', () => {
    it('formats checkpoint', () => {
      expect(formatClassification('runr_checkpoint')).toBe('CHECKPOINT');
    });

    it('formats intervention', () => {
      expect(formatClassification('runr_intervention')).toBe('INTERVENTION');
    });

    it('formats gap', () => {
      expect(formatClassification('gap')).toBe('GAP');
    });
  });

  describe('getClassificationIcon', () => {
    it('returns checkmark for checkpoint', () => {
      expect(getClassificationIcon('runr_checkpoint')).toBe('✓');
    });

    it('returns lightning for intervention', () => {
      expect(getClassificationIcon('runr_intervention')).toBe('⚡');
    });

    it('returns question mark for gap', () => {
      expect(getClassificationIcon('gap')).toBe('?');
    });
  });
});
