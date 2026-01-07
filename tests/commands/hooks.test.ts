/**
 * Tests for git hooks management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  loadActiveState,
  updateActiveState,
  clearActiveState,
  checkCommitCommand
} from '../../src/commands/hooks.js';

describe('Git Hooks', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Initialize git repo
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });

    // Create .runr directory
    fs.mkdirSync(path.join(repoPath, '.runr'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Active State Sentinel', () => {
    it('should return NONE status when no active state exists', () => {
      const state = loadActiveState(repoPath);

      expect(state.status).toBe('NONE');
      expect(state.run_id).toBeNull();
    });

    it('should update active state to RUNNING', () => {
      updateActiveState(repoPath, {
        run_id: 'test-run-123',
        status: 'RUNNING'
      });

      const state = loadActiveState(repoPath);

      expect(state.status).toBe('RUNNING');
      expect(state.run_id).toBe('test-run-123');
      expect(state.updated_at).toBeDefined();
    });

    it('should update active state to STOPPED with reason', () => {
      updateActiveState(repoPath, {
        run_id: 'test-run-456',
        status: 'STOPPED',
        stop_reason: 'review_loop_detected'
      });

      const state = loadActiveState(repoPath);

      expect(state.status).toBe('STOPPED');
      expect(state.run_id).toBe('test-run-456');
      expect(state.stop_reason).toBe('review_loop_detected');
    });

    it('should clear active state', () => {
      // First set a state
      updateActiveState(repoPath, {
        run_id: 'test-run-789',
        status: 'STOPPED',
        stop_reason: 'test'
      });

      // Then clear it
      clearActiveState(repoPath);

      const state = loadActiveState(repoPath);

      expect(state.status).toBe('NONE');
      expect(state.run_id).toBeNull();
    });

    it('should persist state to file', () => {
      updateActiveState(repoPath, {
        run_id: 'persist-test',
        status: 'RUNNING'
      });

      const filePath = path.join(repoPath, '.runr', 'active.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.run_id).toBe('persist-test');
      expect(content.status).toBe('RUNNING');
    });
  });

  describe('Check Commit Command', () => {
    let msgFile: string;

    beforeEach(() => {
      msgFile = path.join(tmpDir, 'COMMIT_EDITMSG');
    });

    it('should allow commit when no stopped run', async () => {
      fs.writeFileSync(msgFile, 'Test commit message');
      clearActiveState(repoPath);

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(0);
    });

    it('should allow commit with Runr trailers', async () => {
      fs.writeFileSync(msgFile, 'Test commit\n\nRunr-Run-Id: 20260107120000');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'test'
      });

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(0);
    });

    it('should allow commit with intervention trailer', async () => {
      fs.writeFileSync(msgFile, 'Test commit\n\nRunr-Intervention: true');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'test'
      });

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(0);
    });

    it('should skip check for merge commits', async () => {
      const mergeFile = path.join(tmpDir, 'MERGE_MSG');
      fs.writeFileSync(mergeFile, 'Merge branch');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'test'
      });

      await checkCommitCommand({ repo: repoPath, msgFile: mergeFile });

      expect(process.exitCode).toBe(0);
    });

    it('should warn in flow mode but allow commit', async () => {
      fs.writeFileSync(msgFile, 'Test commit without trailers');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'review_loop'
      });

      // Ensure flow mode (default)
      const configPath = path.join(repoPath, '.runr', 'runr.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        workflow: { mode: 'flow' }
      }));

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(0);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should block in ledger mode without trailers', async () => {
      fs.writeFileSync(msgFile, 'Test commit without trailers');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'review_loop'
      });

      // Set ledger mode
      const configPath = path.join(repoPath, '.runr', 'runr.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        workflow: { mode: 'ledger' }
      }));

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should allow in ledger mode with RUNR_ALLOW_GAP override', async () => {
      fs.writeFileSync(msgFile, 'Test commit without trailers');
      updateActiveState(repoPath, {
        run_id: 'test-run',
        status: 'STOPPED',
        stop_reason: 'review_loop'
      });

      // Set ledger mode
      const configPath = path.join(repoPath, '.runr', 'runr.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        workflow: { mode: 'ledger' }
      }));

      // Set override
      process.env.RUNR_ALLOW_GAP = '1';

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await checkCommitCommand({ repo: repoPath, msgFile });

      expect(process.exitCode).toBe(0);

      // Cleanup
      delete process.env.RUNR_ALLOW_GAP;
      errorSpy.mockRestore();
    });
  });
});
