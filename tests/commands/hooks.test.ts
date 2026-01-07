/**
 * Tests for git hooks management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  loadActiveState,
  updateActiveState,
  clearActiveState
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
});
