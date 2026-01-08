/**
 * Tests for brain module
 */

import { describe, it, expect } from 'vitest';
import { computeBrain, type BrainOutput } from '../brain.js';
import type { RepoState, StoppedRunInfo, OrchCursor } from '../state.js';

// Helper to create minimal RepoState
function createState(overrides: Partial<RepoState> = {}): RepoState {
  return {
    activeRun: null,
    latestRun: null,
    latestStopped: null,
    orchestration: null,
    treeStatus: 'clean',
    mode: 'flow',
    repoPath: '/test/repo',
    ...overrides,
  };
}

// Helper to create StoppedRunInfo
function createStopped(stopReason: string, overrides: Partial<StoppedRunInfo> = {}): StoppedRunInfo {
  return {
    runId: 'test-run-123',
    phase: 'STOPPED',
    stopReason,
    taskPath: '/test/task.md',
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    stopJsonPath: null,
    diagnosticsPath: null,
    ...overrides,
  };
}

// Helper to create OrchCursor
function createOrch(overrides: Partial<OrchCursor> = {}): OrchCursor {
  return {
    orchestratorId: 'orch-123',
    status: 'running',
    tracksTotal: 3,
    tracksComplete: 1,
    tracksStopped: 0,
    configPath: null,
    ...overrides,
  };
}

describe('brain', () => {
  describe('exactly 3 actions invariant', () => {
    it('returns exactly 3 actions for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for running state', () => {
      const output = computeBrain({
        state: createState({
          activeRun: {
            runId: 'run-123',
            phase: 'IMPLEMENT',
            stopReason: null,
            taskPath: '/test/task.md',
            startedAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for stopped state', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for orchestration state', () => {
      const output = computeBrain({
        state: createState({
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });
  });

  describe('action[0] is primary', () => {
    it('first action is primary for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions[0].primary).toBe(true);
      expect(output.actions[1].primary).toBe(false);
      expect(output.actions[2].primary).toBe(false);
    });

    it('first action is primary for stopped state', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions[0].primary).toBe(true);
    });
  });

  describe('precedence: STOPPED over ORCH_READY', () => {
    it('chooses stopped when both stopped and orchestration exist', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      // Should show stopped status, not orch_ready
      expect(output.status).toBe('stopped_auto');
      expect(output.continueStrategy.type).toBe('auto_resume');
    });
  });

  describe('stop reason classification', () => {
    // Auto-resume reasons
    it('classifies stalled_timeout as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
      expect(output.status).toBe('stopped_auto');
    });

    it('classifies max_ticks_reached as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('max_ticks_reached'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
    });

    it('classifies time_budget_exceeded as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('time_budget_exceeded'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
    });

    // Manual reasons
    it('classifies guard_violation as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('guard_violation'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
    });

    it('classifies scope_violation as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('scope_violation'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
    });

    it('classifies submit_conflict as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('submit_conflict'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
    });

    // Potentially auto-fixable (without commands = manual)
    it('classifies review_loop_detected without commands as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
    });

    // Auto-fixable with safe commands
    it('classifies review_loop_detected with safe commands as auto_fix', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
            { title: 'Run typecheck', command: 'npm run typecheck', why: 'Run typecheck' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_fix');
      expect(output.status).toBe('stopped_auto');
      if (output.continueStrategy.type === 'auto_fix') {
        expect(output.continueStrategy.commands).toHaveLength(2);
      }
    });

    // Auto-fixable with unsafe commands (filtered out)
    it('rejects unsafe commands in auto_fix', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Dangerous', command: 'npm test | tee log', why: 'Has pipe' },
            { title: 'Also dangerous', command: 'rm -rf /', why: 'Deletes everything' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      // No safe commands, so falls back to manual
      expect(output.continueStrategy.type).toBe('manual');
    });
  });

  describe('ledger mode restrictions', () => {
    it('requires manual intervention for auto_fix in ledger mode', () => {
      const output = computeBrain({
        state: createState({
          mode: 'ledger',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      // Ledger mode should make this manual
      expect(output.continueStrategy.type).toBe('manual');
      if (output.continueStrategy.type === 'manual') {
        expect(output.continueStrategy.blockedReason).toContain('Ledger');
      }
    });
  });

  describe('orchestration cursor', () => {
    it('suggests continue_orch when no stopped run', () => {
      const output = computeBrain({
        state: createState({
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.status).toBe('orch_ready');
      expect(output.continueStrategy.type).toBe('continue_orch');
    });
  });

  describe('clean state', () => {
    it('returns nothing strategy for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.status).toBe('clean');
      expect(output.continueStrategy.type).toBe('nothing');
    });
  });
});
