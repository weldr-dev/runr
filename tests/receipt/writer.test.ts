import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { deriveTerminalState, extractBaseSha } from '../../src/receipt/writer.js';

describe('receipt/writer', () => {
  describe('deriveTerminalState', () => {
    it('returns "complete" for complete stop_reason', () => {
      expect(deriveTerminalState('complete')).toBe('complete');
    });

    it('returns "stopped" for undefined stop_reason', () => {
      expect(deriveTerminalState(undefined)).toBe('stopped');
    });

    it('returns "stopped" for resumable stop_reasons', () => {
      expect(deriveTerminalState('stalled_timeout')).toBe('stopped');
      expect(deriveTerminalState('worker_call_timeout')).toBe('stopped');
      expect(deriveTerminalState('max_ticks_reached')).toBe('stopped');
      expect(deriveTerminalState('time_budget_exceeded')).toBe('stopped');
    });

    it('returns "failed" for failure stop_reasons', () => {
      expect(deriveTerminalState('verification_failed_max_retries')).toBe('failed');
      expect(deriveTerminalState('guard_violation')).toBe('failed');
      expect(deriveTerminalState('ownership_violation')).toBe('failed');
      expect(deriveTerminalState('plan_scope_violation')).toBe('failed');
    });
  });

  describe('extractBaseSha', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns null when config.snapshot.json is missing', () => {
      expect(extractBaseSha(tempDir)).toBeNull();
    });

    it('extracts base_sha from worktree info', () => {
      const config = {
        _worktree: {
          base_sha: 'abc123def456',
          run_branch: 'agent/test/task'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, 'config.snapshot.json'),
        JSON.stringify(config)
      );

      expect(extractBaseSha(tempDir)).toBe('abc123def456');
    });

    it('returns null when worktree has no base_sha', () => {
      const config = {
        _worktree: {
          run_branch: 'agent/test/task'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, 'config.snapshot.json'),
        JSON.stringify(config)
      );

      expect(extractBaseSha(tempDir)).toBeNull();
    });
  });
});
