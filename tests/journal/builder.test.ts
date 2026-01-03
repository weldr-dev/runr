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
        repo: testDir
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

    // Minimal timeline
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      JSON.stringify({
        type: 'run_started',
        at: '2026-01-01T00:00:00.000Z',
        data: { run_id: runId }
      }) + '\n' +
      JSON.stringify({
        type: 'stop',
        at: '2026-01-01T00:05:00.000Z',
        data: { reason: 'user_requested' }
      }) + '\n'
    );

    // Empty notes
    fs.writeFileSync(path.join(runDir, 'notes.jsonl'), '');

    return runDir;
  }

  it('builds journal with minimal valid run', async () => {
    const runId = '20260101000000';
    createMinimalRun(runId);

    const journal = await buildJournal(runId, testDir);

    expect(journal.schema_version).toBe('1.0');
    expect(journal.run_id).toBe(runId);
    expect(journal.status.phase).toBe('STOPPED');
    expect(journal.milestones.total).toBe(1);
    expect(journal.warnings).toEqual([]);
  });

  it('handles missing task file gracefully', async () => {
    const runId = '20260101000000';
    createMinimalRun(runId);

    const journal = await buildJournal(runId, testDir);

    expect(journal.task.path).toBeNull();
    expect(journal.task.title).toBeNull();
    expect(journal.task.goal).toBeNull();
    expect(journal.warnings.length).toBeGreaterThan(0);
    expect(journal.warnings.some(w => w.includes('Failed to extract identity'))).toBe(true);
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
    expect(journal.warnings.some(w => w.includes('Failed to extract status'))).toBe(true);
  });

  it('emits warning when checkpoint pattern fails', async () => {
    const runId = '20260101000000';
    createMinimalRun(runId);

    // Initialize git repo but don't add checkpoints
    fs.writeFileSync(path.join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.mkdirSync(path.join(testDir, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(testDir, '.git', 'refs', 'heads', 'main'), 'abc123\n');

    const journal = await buildJournal(runId, testDir);

    expect(journal.checkpoints.created).toBe(0);
    expect(journal.extraction.checkpoints).toBe('none');
  });

  it('computes duration from timestamps once', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Add precise timeline with duration
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      JSON.stringify({
        type: 'run_started',
        at: '2026-01-01T00:00:00.000Z',
        data: {}
      }) + '\n' +
      JSON.stringify({
        type: 'stop',
        at: '2026-01-01T00:02:30.000Z',
        data: { reason: 'complete' }
      }) + '\n'
    );

    const journal1 = await buildJournal(runId, testDir);

    // Wait a bit and build again - duration should be identical
    await new Promise(resolve => setTimeout(resolve, 100));
    const journal2 = await buildJournal(runId, testDir);

    expect(journal1.status.duration_seconds).toBe(150); // 2m 30s
    expect(journal2.status.duration_seconds).toBe(150); // Same
  });

  it('redacts secrets in error excerpts', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Create artifacts dir with log containing secrets
    fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'artifacts', 'test.log'),
      'Test failed\nAPI_KEY=sk-1234567890abcdef\nError: Connection timeout'
    );

    // Add verification failure to timeline
    fs.appendFileSync(
      path.join(runDir, 'timeline.jsonl'),
      JSON.stringify({
        type: 'verification_started',
        at: '2026-01-01T00:03:00.000Z',
        data: { command: 'npm test', tier: 1 }
      }) + '\n' +
      JSON.stringify({
        type: 'verification_completed',
        at: '2026-01-01T00:03:05.000Z',
        data: {
          command: 'npm test',
          tier: 1,
          passed: false,
          exit_code: 1,
          log_path: 'artifacts/test.log'
        }
      }) + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.verification.last_failure).toBeTruthy();
    expect(journal.verification.last_failure?.error_excerpt).toContain('API_KEY=[REDACTED]');
    expect(journal.verification.last_failure?.error_excerpt).not.toContain('sk-1234567890abcdef');
  });

  it('tracks verification attempts correctly', async () => {
    const runId = '20260101000000';
    const runDir = createMinimalRun(runId);

    // Add multiple verification attempts
    const events = [
      { type: 'verification_started', at: '2026-01-01T00:01:00.000Z', data: { command: 'npm test', tier: 1 } },
      { type: 'verification_completed', at: '2026-01-01T00:01:05.000Z', data: { command: 'npm test', tier: 1, passed: false, exit_code: 1 } },
      { type: 'verification_started', at: '2026-01-01T00:02:00.000Z', data: { command: 'npm test', tier: 1 } },
      { type: 'verification_completed', at: '2026-01-01T00:02:04.000Z', data: { command: 'npm test', tier: 1, passed: true, exit_code: 0 } },
      { type: 'verification_started', at: '2026-01-01T00:03:00.000Z', data: { command: 'npm test', tier: 1 } },
      { type: 'verification_completed', at: '2026-01-01T00:03:03.000Z', data: { command: 'npm test', tier: 1, passed: true, exit_code: 0 } }
    ];

    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    const journal = await buildJournal(runId, testDir);

    expect(journal.verification.summary.attempts_total).toBe(3);
    expect(journal.verification.summary.attempts_passed).toBe(2);
    expect(journal.verification.summary.attempts_failed).toBe(1);
    expect(journal.verification.summary.total_duration_seconds).toBe(12); // 5s + 4s + 3s
  });

  it('never throws on missing files', async () => {
    const runId = '20260101000000';
    const runDir = path.join(runsRoot, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // Only create state.json, nothing else
    fs.writeFileSync(
      path.join(runDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        run_id: runId,
        phase: 'STOPPED',
        milestone_index: 0,
        milestones: [],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      })
    );

    // Should not throw
    const journal = await buildJournal(runId, testDir);

    expect(journal.run_id).toBe(runId);
    expect(journal.warnings.length).toBeGreaterThan(0); // Should have warnings
  });
});
