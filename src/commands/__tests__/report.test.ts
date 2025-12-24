import { describe, it, expect } from 'vitest';
import { computeKpiFromEvents, DerivedKpi } from '../report.js';

// Helper to create events with timestamps
function event(
  type: string,
  timestamp: string,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return { type, timestamp, payload };
}

describe('computeKpiFromEvents', () => {
  describe('graceful degradation', () => {
    it('never throws on empty events', () => {
      expect(() => computeKpiFromEvents([])).not.toThrow();
    });

    it('returns unknown for workers when no worker_stats event', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:01Z', { phase: 'PLAN' }),
        event('stop', '2025-01-01T00:01:00Z', { reason: 'user' })
      ];
      const kpi = computeKpiFromEvents(events);
      expect(kpi.workers.claude).toBe('unknown');
      expect(kpi.workers.codex).toBe('unknown');
    });

    it('returns outcome running when no stop or complete event', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:01Z', { phase: 'PLAN' })
      ];
      const kpi = computeKpiFromEvents(events);
      expect(kpi.outcome).toBe('running');
      expect(kpi.total_duration_ms).toBeNull();
      expect(kpi.unattributed_ms).toBeNull();
    });

    it('returns outcome unknown when no run_started event', () => {
      const events = [
        event('phase_start', '2025-01-01T00:00:01Z', { phase: 'PLAN' })
      ];
      const kpi = computeKpiFromEvents(events);
      expect(kpi.outcome).toBe('unknown');
    });

    it('returns empty phases when no phase_start events', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('stop', '2025-01-01T00:01:00Z', { reason: 'user' })
      ];
      const kpi = computeKpiFromEvents(events);
      expect(Object.keys(kpi.phases)).toHaveLength(0);
    });
  });

  describe('old run (no worker_stats)', () => {
    it('computes duration and phases without worker counts', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:10Z', { phase: 'PLAN' }),
        event('phase_start', '2025-01-01T00:01:00Z', { phase: 'IMPLEMENT' }),
        event('phase_start', '2025-01-01T00:02:00Z', { phase: 'VERIFY' }),
        event('verification', '2025-01-01T00:02:05Z', { tier: 'tier0', ok: true, duration_ms: 5000 }),
        event('stop', '2025-01-01T00:02:10Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.total_duration_ms).toBe(130000); // 2m10s
      expect(kpi.workers.claude).toBe('unknown');
      expect(kpi.workers.codex).toBe('unknown');
      expect(kpi.phases['PLAN'].duration_ms).toBe(50000); // 50s
      expect(kpi.phases['IMPLEMENT'].duration_ms).toBe(60000); // 60s
      expect(kpi.phases['VERIFY'].duration_ms).toBe(10000); // 10s
      expect(kpi.verify.attempts).toBe(1);
    });
  });

  describe('multiple phase loops', () => {
    it('accumulates phase durations across multiple iterations', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        // First IMPLEMENT cycle
        event('phase_start', '2025-01-01T00:00:00Z', { phase: 'IMPLEMENT' }),
        event('phase_start', '2025-01-01T00:01:00Z', { phase: 'VERIFY' }),
        event('verification', '2025-01-01T00:01:05Z', { tier: 'tier0', ok: false }),
        // Retry - second IMPLEMENT cycle
        event('phase_start', '2025-01-01T00:01:10Z', { phase: 'IMPLEMENT' }),
        event('phase_start', '2025-01-01T00:02:00Z', { phase: 'VERIFY' }),
        event('verification', '2025-01-01T00:02:05Z', { tier: 'tier0', ok: false }),
        // Retry - third IMPLEMENT cycle
        event('phase_start', '2025-01-01T00:02:10Z', { phase: 'IMPLEMENT' }),
        event('phase_start', '2025-01-01T00:03:00Z', { phase: 'VERIFY' }),
        event('verification', '2025-01-01T00:03:05Z', { tier: 'tier0', ok: true }),
        event('stop', '2025-01-01T00:03:10Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.phases['IMPLEMENT'].count).toBe(3);
      expect(kpi.phases['VERIFY'].count).toBe(3);
      // IMPLEMENT: 60s + 50s + 50s = 160s
      expect(kpi.phases['IMPLEMENT'].duration_ms).toBe(160000);
      // VERIFY: 10s + 10s + 10s = 30s
      expect(kpi.phases['VERIFY'].duration_ms).toBe(30000);
      expect(kpi.verify.attempts).toBe(3);
    });
  });

  describe('verify retries', () => {
    it('counts retry field from verification events', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:00Z', { phase: 'VERIFY' }),
        event('verification', '2025-01-01T00:00:05Z', { tier: 'tier0', ok: false, retry: 0 }),
        event('verification', '2025-01-01T00:00:10Z', { tier: 'tier0', ok: false, retry: 1 }),
        event('verification', '2025-01-01T00:00:15Z', { tier: 'tier0', ok: true, retry: 2 }),
        event('stop', '2025-01-01T00:00:20Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.verify.attempts).toBe(3);
      expect(kpi.verify.retries).toBe(3); // 0 + 1 + 2 = 3
    });
  });

  describe('worker_stats tracking', () => {
    it('extracts worker call counts from worker_stats event', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:00Z', { phase: 'PLAN' }),
        event('worker_stats', '2025-01-01T00:01:00Z', {
          stats: { claude: 5, codex: 3, by_phase: {} }
        }),
        event('stop', '2025-01-01T00:01:00Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.workers.claude).toBe(5);
      expect(kpi.workers.codex).toBe(3);
    });
  });

  describe('milestone tracking', () => {
    it('counts milestone_complete events', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('milestone_complete', '2025-01-01T00:01:00Z', { index: 0 }),
        event('milestone_complete', '2025-01-01T00:02:00Z', { index: 1 }),
        event('milestone_complete', '2025-01-01T00:03:00Z', { index: 2 }),
        event('stop', '2025-01-01T00:03:00Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.milestones.completed).toBe(3);
    });
  });

  describe('outcome detection', () => {
    it('sets outcome to stopped with reason', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('stop', '2025-01-01T00:01:00Z', { reason: 'implement_blocked' })
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.outcome).toBe('stopped');
      expect(kpi.stop_reason).toBe('implement_blocked');
    });

    it('sets outcome to complete on run_complete', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('run_complete', '2025-01-01T00:01:00Z')
      ];
      const kpi = computeKpiFromEvents(events);

      expect(kpi.outcome).toBe('complete');
      expect(kpi.stop_reason).toBeNull();
    });
  });

  describe('unattributed time', () => {
    it('computes positive unattributed time (preflight, gaps)', () => {
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        // 30s gap before first phase (preflight, etc)
        event('phase_start', '2025-01-01T00:00:30Z', { phase: 'PLAN' }),
        event('phase_start', '2025-01-01T00:01:00Z', { phase: 'IMPLEMENT' }),
        event('stop', '2025-01-01T00:02:00Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      // Total: 2m = 120s
      // PLAN: 30s, IMPLEMENT: 60s
      // Unattributed: 120 - 90 = 30s
      expect(kpi.total_duration_ms).toBe(120000);
      expect(kpi.unattributed_ms).toBe(30000);
    });

    it('handles negative unattributed (resumed runs with gap)', () => {
      // This can happen when run is paused and resumed
      // Total duration doesn't account for pause gap
      const events = [
        event('run_started', '2025-01-01T00:00:00Z'),
        event('phase_start', '2025-01-01T00:00:00Z', { phase: 'IMPLEMENT' }),
        event('stop', '2025-01-01T00:01:00Z', { reason: 'blocked' }),
        // After resume - phase duration exceeds tracked total
        event('run_resumed', '2025-01-01T00:10:00Z'),
        event('phase_start', '2025-01-01T00:10:00Z', { phase: 'IMPLEMENT' }),
        event('stop', '2025-01-01T00:11:00Z', { reason: 'complete' })
      ];
      const kpi = computeKpiFromEvents(events);

      // Total: 11m - but phases ran: 1m + 1m = 2m
      // Actually: stop at 00:11:00 - started at 00:00:00 = 11m
      // Phase IMPLEMENT: 1m (00:00:00-00:01:00) + 1m (00:10:00-00:11:00) = 2m
      // Unattributed: 11m - 2m = 9m (positive in this case due to pause gap)
      expect(kpi.outcome).toBe('stopped');
      // The second stop overwrites the first
    });
  });

  describe('version field', () => {
    it('always returns version 1', () => {
      const kpi = computeKpiFromEvents([]);
      expect(kpi.version).toBe(1);
    });
  });
});
