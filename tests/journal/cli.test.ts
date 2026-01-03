import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { journalCommand, noteCommand } from '../../src/commands/journal.js';

describe('Journal CLI commands', () => {
  let testDir: string;
  let runsRoot: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-cli-test-'));
    runsRoot = path.join(testDir, '.runr', 'runs');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createTestRun(runId: string) {
    const runDir = path.join(runsRoot, runId);
    fs.mkdirSync(runDir, { recursive: true });

    fs.writeFileSync(
      path.join(runDir, 'config.snapshot.json'),
      JSON.stringify({
        agent: { name: 'test', version: '1' },
        _worktree: {
          original_repo_path: testDir,
          base_sha: 'abc123'
        }
      })
    );

    fs.writeFileSync(
      path.join(runDir, 'state.json'),
      JSON.stringify({
        schema_version: 1,
        run_id: runId,
        phase: 'STOPPED',
        milestone_index: 0,
        milestones: [{ title: 'M1' }],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:05:00.000Z'
      })
    );

    const timeline = [
      { seq: 1, type: 'run_started', timestamp: '2026-01-01T00:00:00.000Z', source: 'supervisor', payload: {} },
      { seq: 2, type: 'stop', timestamp: '2026-01-01T00:05:00.000Z', source: 'supervisor', payload: { reason: 'complete' } }
    ];
    fs.writeFileSync(
      path.join(runDir, 'timeline.jsonl'),
      timeline.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    fs.writeFileSync(path.join(runDir, 'notes.jsonl'), '');

    return runDir;
  }

  it('runr journal defaults to latest run when no ID provided', async () => {
    // Create two runs
    createTestRun('20260101000000');
    createTestRun('20260102000000'); // Latest

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await journalCommand({ repo: testDir });

      // Should generate journal for latest run
      expect(logs.some(l => l.includes('20260102000000'))).toBe(true);
      expect(fs.existsSync(path.join(runsRoot, '20260102000000', 'journal.md'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('runr note writes to latest run notes.jsonl', async () => {
    const runId = '20260101000000';
    const runDir = createTestRun(runId);
    const notesPath = path.join(runDir, 'notes.jsonl');

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await noteCommand('Test note message', { repo: testDir });

      // Should write to notes file
      const notesContent = fs.readFileSync(notesPath, 'utf-8');
      const notes = notesContent.split('\n').filter(l => l.trim());

      expect(notes.length).toBe(1);
      const note = JSON.parse(notes[0]);
      expect(note.message).toBe('Test note message');
      expect(note.timestamp).toBeDefined();

      // Should show confirmation
      expect(logs.some(l => l.includes('Note added'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('runr journal --force regenerates even when up to date', async () => {
    const runId = '20260101000000';
    const runDir = createTestRun(runId);
    const journalPath = path.join(runDir, 'journal.md');

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(' ');
    };

    try {
      // First generation
      await journalCommand({ repo: testDir, runId });
      expect(fs.existsSync(journalPath)).toBe(true);

      const firstMtime = fs.statSync(journalPath).mtimeMs;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Regenerate with --force
      await journalCommand({ repo: testDir, runId, force: true });

      const secondMtime = fs.statSync(journalPath).mtimeMs;

      // File should have been regenerated (newer mtime)
      expect(secondMtime).toBeGreaterThan(firstMtime);
    } finally {
      console.log = originalLog;
    }
  });

  it('runr note with --run-id targets specific run', async () => {
    const run1Dir = createTestRun('20260101000000');
    const run2Dir = createTestRun('20260102000000');

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      // Add note to first run explicitly
      await noteCommand('Note for run 1', { repo: testDir, runId: '20260101000000' });

      // Only first run should have note
      const run1Notes = fs.readFileSync(path.join(run1Dir, 'notes.jsonl'), 'utf-8');
      const run2Notes = fs.readFileSync(path.join(run2Dir, 'notes.jsonl'), 'utf-8');

      expect(run1Notes.split('\n').filter(l => l.trim()).length).toBe(1);
      expect(run2Notes.split('\n').filter(l => l.trim()).length).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });
});
