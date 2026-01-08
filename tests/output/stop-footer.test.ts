/**
 * Tests for stop footer output.
 */

import { describe, it, expect } from 'vitest';
import {
  formatStopFooter,
  buildNextSteps,
  buildStopContext,
  StopContext
} from '../../src/output/stop-footer.js';
import { RunState } from '../../src/types/schemas.js';

function createMockState(overrides: Partial<RunState> = {}): RunState {
  return {
    run_id: 'test-run-123',
    repo_path: '/tmp/repo',
    phase: 'VERIFY',
    milestone_index: 1,
    milestones: [
      { goal: 'Milestone 1' },
      { goal: 'Milestone 2' },
      { goal: 'Milestone 3' }
    ],
    scope_lock: { allowlist: [], denylist: [] },
    risk_score: 0,
    retries: 0,
    milestone_retries: 0,
    phase_started_at: new Date().toISOString(),
    phase_attempt: 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    worker_stats: {
      calls: 0,
      errors: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0
    },
    stop_reason: 'verification_failed',
    ...overrides
  };
}

describe('Stop Footer', () => {
  describe('buildNextSteps', () => {
    it('should return three commands', () => {
      const steps = buildNextSteps('run-123', 'review_loop_detected');

      expect(steps.resume).toBe('runr resume run-123');
      expect(steps.intervene).toBe('runr intervene run-123 --reason review_loop_detected --note "..."');
      expect(steps.audit).toBe('runr runs audit --run run-123');
    });

    it('should use manual as default reason', () => {
      const steps = buildNextSteps('run-456', '');

      expect(steps.intervene).toContain('--reason manual');
    });
  });

  describe('buildStopContext', () => {
    it('should extract context from run state', () => {
      const state = createMockState({
        checkpoint_commit_sha: 'abc123def456',
        stop_reason: 'scope_violation',
        last_error: 'Modified file outside scope: src/forbidden.ts'
      });

      const ctx = buildStopContext(state);

      expect(ctx.runId).toBe('test-run-123');
      expect(ctx.stopReason).toBe('scope_violation');
      expect(ctx.checkpointSha).toBe('abc123def456');
      expect(ctx.milestoneIndex).toBe(1);
      expect(ctx.milestonesTotal).toBe(3);
      expect(ctx.lastError).toContain('forbidden.ts');
    });
  });

  describe('formatStopFooter', () => {
    it('should format with separator and next steps', () => {
      const ctx: StopContext = {
        runId: 'run-789',
        stopReason: 'verification_failed',
        checkpointSha: 'abc1234567890',
        milestoneIndex: 1,
        milestonesTotal: 3,
        phase: 'VERIFY'
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('STOPPED: verification_failed');
      expect(footer).toContain('Last checkpoint: abc1234');
      expect(footer).toContain('milestone 2/3');
      expect(footer).toContain('runr resume run-789');
      expect(footer).toContain('runr intervene run-789');
      expect(footer).toContain('runr runs audit --run run-789');
    });

    it('should show no checkpoint when not present', () => {
      const ctx: StopContext = {
        runId: 'run-111',
        stopReason: 'stalled_timeout',
        milestoneIndex: 0,
        milestonesTotal: 2,
        phase: 'IMPLEMENT'
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('No checkpoint');
      expect(footer).toContain('milestone 1/2');
    });

    it('should show enhanced output for review_loop_detected with data', () => {
      const ctx: StopContext = {
        runId: 'run-222',
        stopReason: 'review_loop_detected',
        milestoneIndex: 0,
        milestonesTotal: 1,
        reviewRound: 3,
        maxReviewRounds: 2,
        reviewerRequests: ['Fix type errors', 'Add test coverage'],
        commandsToSatisfy: ['npm run typecheck', 'npm test']
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('STOPPED: review_loop_detected (round 3/2)');
      expect(footer).toContain('Reviewer requested:');
      expect(footer).toContain('Fix type errors');
      expect(footer).toContain('Add test coverage');
      expect(footer).toContain('Commands to satisfy:');
      expect(footer).toContain('npm run typecheck');
      expect(footer).toContain('npm test');
      expect(footer).toContain('Suggested intervention:');
      expect(footer).toContain('runr intervene run-222');
    });

    it('should show basic review_loop_detected without enhanced data', () => {
      const ctx: StopContext = {
        runId: 'run-223',
        stopReason: 'review_loop_detected',
        milestoneIndex: 0,
        milestonesTotal: 1
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('STOPPED: review_loop_detected');
      expect(footer).toContain('Suggested intervention:');
    });

    it('should include context line for stalled_timeout', () => {
      const ctx: StopContext = {
        runId: 'run-333',
        stopReason: 'stalled_timeout',
        milestoneIndex: 0,
        milestonesTotal: 1,
        phase: 'IMPLEMENT'
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('Stalled at: IMPLEMENT');
    });

    it('should include context line for scope_violation', () => {
      const ctx: StopContext = {
        runId: 'run-444',
        stopReason: 'scope_violation',
        milestoneIndex: 0,
        milestonesTotal: 1,
        lastError: 'Modified src/forbidden.ts, src/another.ts outside scope'
      };

      const footer = formatStopFooter(ctx);

      expect(footer).toContain('Files:');
    });
  });
});
