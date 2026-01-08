/**
 * Tests for Stop Diagnostics module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseTimeline,
  extractReviewLoopContext,
  generateUnmetChecks,
  generateSuggestedActions,
  generateStopDiagnostics,
  writeStopDiagnostics
} from '../stop-explainer.js';

describe('Stop Diagnostics', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseTimeline', () => {
    it('parses valid timeline.jsonl', () => {
      const timelinePath = path.join(tmpDir, 'timeline.jsonl');
      fs.writeFileSync(timelinePath, [
        '{"timestamp":"2026-01-06T12:00:00Z","event_type":"run_started"}',
        '{"timestamp":"2026-01-06T12:01:00Z","event_type":"worker_response","phase":"review"}'
      ].join('\n'));

      const events = parseTimeline(timelinePath);
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('run_started');
      expect(events[1].phase).toBe('review');
    });

    it('returns empty array for missing file', () => {
      const events = parseTimeline('/nonexistent/path');
      expect(events).toEqual([]);
    });

    it('skips malformed lines', () => {
      const timelinePath = path.join(tmpDir, 'timeline.jsonl');
      fs.writeFileSync(timelinePath, [
        '{"event_type":"valid"}',
        'not json',
        '{"event_type":"also_valid"}'
      ].join('\n'));

      const events = parseTimeline(timelinePath);
      expect(events).toHaveLength(2);
    });
  });

  describe('extractReviewLoopContext', () => {
    it('counts review rounds', () => {
      const events = [
        { timestamp: '', event_type: 'worker_response', phase: 'review' },
        { timestamp: '', event_type: 'worker_response', phase: 'implement' },
        { timestamp: '', event_type: 'worker_response', phase: 'review' },
        { timestamp: '', event_type: 'worker_response', phase: 'implement' },
        { timestamp: '', event_type: 'worker_response', phase: 'review' },
      ];

      const context = extractReviewLoopContext(events);
      expect(context.loopCount).toBe(3);
    });

    it('extracts evidence from implement events', () => {
      const events = [
        { timestamp: '', event_type: 'worker_response', phase: 'implement', response: 'typecheck passed' },
        { timestamp: '', event_type: 'worker_response', phase: 'implement', response: 'all tests pass' },
      ];

      const context = extractReviewLoopContext(events);
      expect(context.evidenceProvided).toContain('typecheck');
      expect(context.evidenceProvided).toContain('tests');
    });
  });

  describe('generateUnmetChecks', () => {
    it('identifies missing typecheck output', () => {
      const requests = ['include typecheck output'];
      const provided: string[] = [];

      const unmet = generateUnmetChecks(requests, provided);
      expect(unmet).toContain('typecheck_output_missing');
    });

    it('identifies missing test output', () => {
      const requests = ['run test and show results'];
      const provided: string[] = [];

      const unmet = generateUnmetChecks(requests, provided);
      expect(unmet).toContain('test_output_missing');
    });

    it('returns empty when evidence matches requests', () => {
      const requests = ['include typecheck output'];
      const provided = ['typecheck'];

      const unmet = generateUnmetChecks(requests, provided);
      expect(unmet).not.toContain('typecheck_output_missing');
    });
  });

  describe('generateSuggestedActions', () => {
    it('suggests typecheck command for missing typecheck', () => {
      const actions = generateSuggestedActions(
        'review_loop_detected',
        'test-run-id',
        ['typecheck_output_missing']
      );

      const typecheckAction = actions.find(a => a.command?.includes('typecheck'));
      expect(typecheckAction).toBeDefined();
    });

    it('suggests resume command', () => {
      const actions = generateSuggestedActions(
        'review_loop_detected',
        'test-run-id',
        []
      );

      const resumeAction = actions.find(a => a.command?.includes('resume'));
      expect(resumeAction).toBeDefined();
    });

    it('suggests intervene command', () => {
      const actions = generateSuggestedActions(
        'review_loop_detected',
        'test-run-id',
        []
      );

      const interveneAction = actions.find(a => a.command?.includes('intervene'));
      expect(interveneAction).toBeDefined();
    });
  });

  describe('generateStopDiagnostics', () => {
    it('generates diagnostics for review_loop_detected', () => {
      const timelinePath = path.join(tmpDir, 'timeline.jsonl');
      fs.writeFileSync(timelinePath, [
        '{"timestamp":"2026-01-06T12:00:00Z","event_type":"worker_response","phase":"review"}',
        '{"timestamp":"2026-01-06T12:01:00Z","event_type":"worker_response","phase":"implement"}'
      ].join('\n'));

      const diagnostics = generateStopDiagnostics(tmpDir, 'test-run', 'review_loop_detected');

      expect(diagnostics.stop_reason).toBe('review_loop_detected');
      expect(diagnostics.explanation).toContain('review rounds');
      expect(diagnostics.loop_count).toBeGreaterThanOrEqual(1);
      expect(diagnostics.suggested_actions.length).toBeGreaterThan(0);
    });

    it('generates diagnostics for stalled_timeout', () => {
      const timelinePath = path.join(tmpDir, 'timeline.jsonl');
      fs.writeFileSync(timelinePath, [
        '{"timestamp":"2026-01-06T12:00:00Z","event_type":"run_started"}'
      ].join('\n'));

      const diagnostics = generateStopDiagnostics(tmpDir, 'test-run', 'stalled_timeout');

      expect(diagnostics.stop_reason).toBe('stalled_timeout');
      expect(diagnostics.explanation).toContain('timed out');
      expect(diagnostics.last_activity_at).toBeDefined();
    });
  });

  describe('writeStopDiagnostics', () => {
    it('writes diagnostics to file', () => {
      const diagnostics = {
        stop_reason: 'review_loop_detected',
        explanation: 'Test explanation',
        loop_count: 3,
        suggested_actions: []
      };

      const writtenPath = writeStopDiagnostics(tmpDir, diagnostics);

      expect(fs.existsSync(writtenPath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(writtenPath, 'utf-8'));
      expect(written.stop_reason).toBe('review_loop_detected');
      expect(written.loop_count).toBe(3);
    });
  });
});
