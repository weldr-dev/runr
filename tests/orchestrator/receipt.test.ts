/**
 * Tests for orchestration receipt generation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildReceipt,
  generateReceiptMarkdown,
  RECEIPT_SCHEMA_VERSION
} from '../../src/orchestrator/receipt.js';
import { OrchestratorState, Track } from '../../src/orchestrator/types.js';

function createMockState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  const defaultState: OrchestratorState = {
    orchestrator_id: '20260107120000',
    config_path: '/tmp/config.yaml',
    repo_root: '/tmp/repo',
    started_at: '2026-01-07T12:00:00.000Z',
    ended_at: '2026-01-07T14:30:00.000Z',
    status: 'complete',
    collision_policy: 'serialize',
    time_budget_minutes: 120,
    max_ticks: 50,
    fast: false,
    active_runs: [],
    tracks: []
  };

  return { ...defaultState, ...overrides };
}

function createMockTrack(overrides: Partial<Track> = {}): Track {
  const defaultTrack: Track = {
    id: 'track-1',
    name: 'Test Track',
    status: 'complete',
    current_step: 0,
    steps: [
      {
        task_path: '.runr/tasks/test-task.md',
        run_id: 'run-123',
        run_dir: '/tmp/.runr/runs/run-123',
        result: {
          status: 'complete',
          elapsed_ms: 60000
        }
      }
    ]
  };

  return { ...defaultTrack, ...overrides };
}

describe('Receipt Generation', () => {
  describe('buildReceipt', () => {
    it('should create receipt with correct schema version', () => {
      const state = createMockState({
        tracks: [createMockTrack()]
      });

      const receipt = buildReceipt(state, '/tmp/repo');

      expect(receipt.schema_version).toBe(RECEIPT_SCHEMA_VERSION);
      expect(receipt.orchestration_id).toBe('20260107120000');
    });

    it('should count tasks correctly', () => {
      const state = createMockState({
        tracks: [
          createMockTrack({
            steps: [
              {
                task_path: '.runr/tasks/task1.md',
                run_id: 'run-1',
                result: { status: 'complete', elapsed_ms: 1000 }
              },
              {
                task_path: '.runr/tasks/task2.md',
                run_id: 'run-2',
                result: { status: 'stopped', stop_reason: 'review_loop_detected', elapsed_ms: 2000 }
              },
              {
                task_path: '.runr/tasks/task3.md'
              }
            ]
          })
        ]
      });

      const receipt = buildReceipt(state, '/tmp/repo');

      expect(receipt.summary.tasks_total).toBe(3);
      expect(receipt.summary.tasks_completed).toBe(1);
      expect(receipt.summary.tasks_stopped).toBe(1);
      expect(receipt.summary.tasks_pending).toBe(1);
    });

    it('should aggregate stop reasons', () => {
      const state = createMockState({
        tracks: [
          createMockTrack({
            steps: [
              {
                task_path: '.runr/tasks/task1.md',
                run_id: 'run-1',
                result: { status: 'stopped', stop_reason: 'review_loop_detected', elapsed_ms: 1000 }
              },
              {
                task_path: '.runr/tasks/task2.md',
                run_id: 'run-2',
                result: { status: 'stopped', stop_reason: 'review_loop_detected', elapsed_ms: 2000 }
              },
              {
                task_path: '.runr/tasks/task3.md',
                run_id: 'run-3',
                result: { status: 'stopped', stop_reason: 'max_ticks_reached', elapsed_ms: 3000 }
              }
            ]
          })
        ]
      });

      const receipt = buildReceipt(state, '/tmp/repo');

      expect(receipt.top_stop_reasons).toHaveLength(2);
      expect(receipt.top_stop_reasons[0].reason).toBe('review_loop_detected');
      expect(receipt.top_stop_reasons[0].count).toBe(2);
      expect(receipt.top_stop_reasons[1].reason).toBe('max_ticks_reached');
      expect(receipt.top_stop_reasons[1].count).toBe(1);
    });

    it('should calculate duration correctly', () => {
      const state = createMockState({
        started_at: '2026-01-07T12:00:00.000Z',
        ended_at: '2026-01-07T14:30:00.000Z'
      });

      const receipt = buildReceipt(state, '/tmp/repo');

      // 2.5 hours = 9,000,000 ms
      expect(receipt.duration_ms).toBe(9000000);
    });
  });

  describe('generateReceiptMarkdown', () => {
    it('should generate valid markdown', () => {
      const state = createMockState({
        tracks: [createMockTrack()]
      });
      const receipt = buildReceipt(state, '/tmp/repo');

      const markdown = generateReceiptMarkdown(receipt);

      expect(markdown).toContain('# Orchestration Receipt:');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('| Metric | Value |');
      expect(markdown).toContain('## Tasks');
    });

    it('should include stop reasons section when there are stopped tasks', () => {
      const state = createMockState({
        tracks: [
          createMockTrack({
            steps: [
              {
                task_path: '.runr/tasks/task1.md',
                run_id: 'run-1',
                result: { status: 'stopped', stop_reason: 'review_loop_detected', elapsed_ms: 1000 }
              }
            ]
          })
        ]
      });
      const receipt = buildReceipt(state, '/tmp/repo');

      const markdown = generateReceiptMarkdown(receipt);

      expect(markdown).toContain('## Top Issues');
      expect(markdown).toContain('review_loop_detected');
    });

    it('should show correct task status icons', () => {
      const state = createMockState({
        tracks: [
          createMockTrack({
            steps: [
              {
                task_path: '.runr/tasks/finished.md',
                run_id: 'run-1',
                result: { status: 'complete', elapsed_ms: 1000 }
              },
              {
                task_path: '.runr/tasks/stopped.md',
                run_id: 'run-2',
                result: { status: 'stopped', stop_reason: 'test', elapsed_ms: 2000 }
              },
              {
                task_path: '.runr/tasks/pending.md'
              }
            ]
          })
        ]
      });
      const receipt = buildReceipt(state, '/tmp/repo');

      const markdown = generateReceiptMarkdown(receipt);

      expect(markdown).toContain('### ✓ finished.md');
      expect(markdown).toContain('### ⚠ stopped.md');
      expect(markdown).toContain('### ○ pending.md');
    });
  });
});
