/**
 * Continue command behavior tests.
 *
 * P2 invariant: `runr continue` should always print helpful output,
 * especially when there's nothing to continue.
 */

import { describe, it, expect } from 'vitest';
import { computeBrain, type BrainOutput } from '../../src/ux/brain.js';
import { formatFrontDoor } from '../../src/ux/render.js';
import type { RepoState } from '../../src/ux/state.js';

// Helper to create minimal clean RepoState
function createCleanState(): RepoState {
  return {
    activeRun: null,
    latestRun: null,
    latestStopped: null,
    orchestration: null,
    treeStatus: 'clean',
    mode: 'flow',
    repoPath: '/test/repo',
  };
}

describe('continue command behavior', () => {
  describe('when nothing to continue (clean state)', () => {
    it('strategy is "nothing"', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('nothing');
    });

    it('front door shows helpful "Ready" status', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.status).toBe('clean');
      expect(output.headline).toBe('Ready');
    });

    it('primary action suggests running a task', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.actions[0].primary).toBe(true);
      expect(output.actions[0].command).toContain('runr run --task');
      expect(output.actions[0].label).toBe('Run a task');
    });

    it('rendered output is meaningful (not confusing)', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      // Force NO_COLOR to get plain text for testing
      process.env.NO_COLOR = '1';
      const rendered = formatFrontDoor(output);
      delete process.env.NO_COLOR;

      // Should show status and headline
      expect(rendered).toContain('Ready');

      // Should show the primary action
      expect(rendered).toContain('runr run --task');

      // Should include helpful hint
      expect(rendered).toContain('runr help');
    });

    it('shows "View last run" when previous run exists', () => {
      const stateWithHistory: RepoState = {
        ...createCleanState(),
        latestRun: {
          runId: 'previous-run-123',
          phase: 'COMPLETED',
          stopReason: null,
          taskPath: '/test/task.md',
          startedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T01:00:00Z',
        },
      };

      const output = computeBrain({
        state: stateWithHistory,
        stopDiagnosis: null,
        stopExplainer: null,
      });

      // Second action should be to view last run
      expect(output.actions[1].command).toContain('runr report latest');
      expect(output.actions[1].label).toBe('View last run');
    });

    it('shows "Initialize" when no previous runs', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      // Second action should be to initialize
      expect(output.actions[1].command).toBe('runr init');
      expect(output.actions[1].label).toBe('Initialize');
    });
  });

  describe('exactly 3 actions invariant for continue command', () => {
    it('clean state shows exactly 3 actions', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.actions).toHaveLength(3);
    });

    it('all action commands are valid runr commands', () => {
      const output = computeBrain({
        state: createCleanState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      for (const action of output.actions) {
        expect(action.command).toMatch(/^runr\s/);
      }
    });
  });
});
