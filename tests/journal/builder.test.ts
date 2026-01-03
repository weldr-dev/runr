import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildJournal } from '../../src/journal/builder.js';

describe('buildJournal', () => {
  let testDir: string;
  let runsRoot: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
    runsRoot = path.join(testDir, '.runr', 'runs');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createMinimalRun(runId: string) {
    const runDir = path.join(runsRoot, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // Minimal config snapshot
    fs.writeFileSync(
      path.join(runDir, 'config.snapshot.json'),
      JSON.stringify({
        agent: { name: 'test', version: '1' },
        _worktree: {
          original_repo_path: testDir,
          base_sha: 'abc1234567890123456789012345678901234567'
        }
      })
    );

    // Minimal state
    fs.writeFileSync(
      path.join(runDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        run_id: runId,
        phase: 'STOPPED',
        milestone_index: 0,
        milestones: [
          { title: 'M1', files_expected: [], verification_tier: 0 }
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:05:00.000Z'
      })
    );

    // Minimal timeline with real event structure (timeline uses 'timestamp' not 'at')
    const timeline = [
      { seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: { run_id: runId } },
      { seq: 2, type: 'stop', timestamp: '2026-01-01T00:05:00.000Z', source: 'supervisor', payload: { reason: 'user_requested' } }
    ];
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      timeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    // Empty notes
    fs.writeFileSync(path.join(runDir, 'notes.jsonl'), '');

    return runDir;
  }

  it('generates valid schema v1.0 journal', async () => {
    const runId = '20260101000000';
    createMinimalRun(runId);

    const journal = await buildJournal(runId, testDir);

    expect(journal.schema_version).toBe('1.0');
    expect(journal.run_id).toBe(runId);
    expect(journal.generated_by).toMatch(/^runr@/);
    expect(journal.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(journal.repo_root).toBe(testDir);
  });

  it('extracts milestone counts correctly', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Update state with multiple milestones
    fs.writeFileSync(
      path.join(runDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        run_id: runId,
        phase: 'STOPPED',
        milestone_index: 2, // 0-based, so attempted = 3
        milestones: [
          { title: 'M1' },
          { title: 'M2' },
          { title: 'M3' },
          { title: 'M4' }
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:05:00.000Z'
      })
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.milestones.attempted).toBe(3); // milestone_index + 1
    expect(journal.milestones.total).toBe(4);
    expect(journal.milestones.verified).toBe(0); // Always 0 for stopped runs
  });

  it('computes duration from timeline timestamps', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    const timeline = [
      { seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: {} },
      { seq: 2, type: 'stop', timestamp: '2026-01-01T00:02:30.000Z', source: 'supervisor', payload: { reason: 'complete' } }
    ];
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      timeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.status.duration_seconds).toBe(150); // 2m 30s
    expect(journal.status.timestamps.started_at).toBe('2026-01-01T00:00:00.000Z');
    expect(journal.status.timestamps.ended_at).toBe('2026-01-01T00:02:30.000Z');
  });

  it('tracks verification attempts from real timeline events', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Real verification event structure from actual runs
    const timeline = [
      { seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: {} },
      {
        seq: 2,
        type: 'verification',
        timestamp: '2026-01-01T00:01:00.000Z',
        source: 'supervisor',
        payload: {
          ok: false,
          tier: 'tier1',
          duration_ms: 5000,
          command_results: [{ command: 'npm test', exit_code: 1, passed: false }]
        }
      },
      {
        seq: 3,
        type: 'verification',
        timestamp: '2026-01-01T00:02:00.000Z',
        source: 'supervisor',
        payload: {
          ok: true,
          tier: 'tier1',
          duration_ms: 4000,
          command_results: [{ command: 'npm test', exit_code: 0, passed: true }]
        }
      },
      { seq: 4, type: 'stop', timestamp: '2026-01-01T00:03:00.000Z', source: 'supervisor', payload: { reason: 'complete' } }
    ];

    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      timeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.verification.summary.attempts_total).toBe(2);
    expect(journal.verification.summary.attempts_passed).toBe(1);
    expect(journal.verification.summary.attempts_failed).toBe(1);
    expect(journal.verification.summary.total_duration_seconds).toBe(9); // 5s + 4s
  });

  it('handles missing timeline gracefully', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);
    fs.unlinkSync(path.join(runDir, 'timeline.jsonl'));

    const journal = await buildJournal(runId, testDir);

    expect(journal.status.phase).toBe('STOPPED'); // From state.json
    expect(journal.status.timestamps.started_at).toBeNull();
    expect(journal.status.timestamps.ended_at).toBeNull();
    expect(journal.verification.summary.attempts_total).toBe(0);
    // Timeline extraction doesn't fail, just returns nulls
  });

  it('handles missing state.json gracefully', async () => {
    const runId = '20260101000000';
    const runDir = path.join(runsRoot, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // Only timeline
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      JSON.stringify({ seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: {} }) + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.run_id).toBe(runId);
    expect(journal.milestones.total).toBe(0);
    expect(journal.warnings.length).toBeGreaterThan(0);
  });

  it('never throws on completely missing run directory', async () => {
    const runId = '20260101999999';

    // Should not throw
    const journal = await buildJournal(runId, testDir);

    expect(journal.run_id).toBe(runId);
    expect(journal.warnings.length).toBeGreaterThan(0);
  });

  it('includes extraction metadata', async () => {
    const runId = '20260101000000';
    createMinimalRun(runId);

    const journal = await buildJournal(runId, testDir);

    expect(journal.extraction).toBeDefined();
    expect(journal.extraction.checkpoints).toBe('none'); // No git setup
    expect(journal.extraction.verification).toBe('none'); // No verification events
    expect(journal.extraction.next_action).toBe('none'); // No stop.json or next action
  });

  it('counts notes correctly', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Add some notes
    const notes = [
      { timestamp: '2026-01-01T00:01:00.000Z', message: 'Note 1' },
      { timestamp: '2026-01-01T00:02:00.000Z', message: 'Note 2' },
      { timestamp: '2026-01-01T00:03:00.000Z', message: 'Note 3' }
    ];
    fs.writeFileSync(
      path.join(runDir, 'notes.jsonl'),
      notes.map(n => JSON.stringify(n)).join('\n') + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.notes.count).toBe(3);
    expect(journal.notes.path).toBe('notes.jsonl');
  });

  it('redacts secrets in error excerpts when verification fails', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Create log with secret
    fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'artifacts', 'tests_tier1.log'),
      'Test failed\nAPI_KEY=sk-1234567890abcdef\nError: Connection timeout'
    );

    // Add failed verification
    const timeline = [
      { seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: {} },
      {
        seq: 2,
        type: 'verification',
        timestamp: '2026-01-01T00:01:00.000Z',
        source: 'supervisor',
        payload: {
          ok: false,
          tier: 'tier1',
          duration_ms: 5000,
          command_results: [{ command: 'npm test', exit_code: 1, passed: false }]
        }
      },
      { seq: 3, type: 'stop', timestamp: '2026-01-01T00:02:00.000Z', source: 'supervisor', payload: { reason: 'verification_failed' } }
    ];
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      timeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.verification.last_failure).toBeTruthy();
    expect(journal.verification.last_failure?.error_excerpt).toContain('API_KEY=[REDACTED]');
    expect(journal.verification.last_failure?.error_excerpt).not.toContain('sk-1234567890abcdef');
  });
});
