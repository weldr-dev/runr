import { describe, it, expect } from 'vitest';
import { renderJournal } from '../../src/journal/renderer.js';
import type { JournalJson } from '../../src/journal/types.js';

describe('renderJournal', () => {
  const baseJournal: JournalJson = {
    schema_version: '1.0',
    generated_by: 'runr@0.3.1',
    generated_at: '2026-01-02T12:00:00.000Z',
    run_id: 'test123',
    repo_root: '/test/repo',
    base_sha: 'abc1234567890123456789012345678901234567',
    head_sha: 'def1234567890123456789012345678901234567',
    task: {
      path: '/test/task.md',
      sha256: 'hash123',
      title: 'Test Task',
      goal: 'Test goal'
    },
    status: {
      phase: 'STOPPED',
      terminal_state: 'stopped',
      stop_reason: 'user_requested',
      duration_seconds: 120,
      timestamps: {
        started_at: '2026-01-02T12:00:00.000Z',
        ended_at: '2026-01-02T12:02:00.000Z'
      }
    },
    milestones: {
      attempted: 2,
      total: 3,
      verified: 1
    },
    checkpoints: {
      created: 2,
      list: [
        {
          milestone_index: 1,
          title: 'Milestone 1',
          sha: 'abc1234567890123456789012345678901234567',
          created_at: '2026-01-02T12:01:00.000Z'
        },
        {
          milestone_index: 2,
          title: 'Milestone 2',
          sha: 'def1234567890123456789012345678901234567',
          created_at: '2026-01-02T12:02:00.000Z'
        }
      ],
      last_sha: 'def1234567890123456789012345678901234567'
    },
    verification: {
      summary: {
        attempts_total: 5,
        attempts_passed: 3,
        attempts_failed: 2,
        total_duration_seconds: 30
      },
      last_failure: null
    },
    changes: {
      base_sha: 'abc1234567890123456789012345678901234567',
      head_sha: 'def1234567890123456789012345678901234567',
      files_changed: 2,
      insertions: 50,
      deletions: 10,
      top_files: [
        { path: 'src/test.ts', insertions: 40, deletions: 5 },
        { path: 'README.md', insertions: 10, deletions: 5 }
      ],
      diff_stat: 'src/test.ts | 45 ++++++++++\nREADME.md | 15 ++++-\n2 files changed, 50 insertions(+), 10 deletions(-)'
    },
    next_action: {
      title: 'Run tests',
      command: 'npm test',
      why: 'Verify changes'
    },
    notes: {
      count: 0,
      path: 'notes.jsonl'
    },
    resumed_from: null,
    extraction: {
      checkpoints: 'git_log_v1',
      verification: 'timeline_v1',
      next_action: 'derived'
    },
    warnings: []
  };

  it('renders header with status emoji and title', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('# ⏸️ Test Task');
    expect(markdown).toContain('**Run ID:** `test123`');
    expect(markdown).toContain('**Status:** STOPPED (stopped)');
  });

  it('renders metadata section with timestamps and duration', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Metadata');
    expect(markdown).toContain('**Started:** 2026-01-02 12:00:00 UTC');
    expect(markdown).toContain('**Ended:** 2026-01-02 12:02:00 UTC');
    expect(markdown).toContain('**Duration:** 2m 0s');
    expect(markdown).toContain('**Stop Reason:** user_requested');
  });

  it('renders task section with goal', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Task');
    expect(markdown).toContain('**Title:** Test Task');
    expect(markdown).toContain('**Goal:**\nTest goal');
    expect(markdown).toContain('**Task File:** `/test/task.md`');
  });

  it('renders milestones with checkpoint history', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Milestones');
    expect(markdown).toContain('**Attempted:** 2/3');
    expect(markdown).toContain('**Verified:** 1/3');
    expect(markdown).toContain('**Checkpoints:** 2');
    expect(markdown).toContain('### Checkpoint History');
    expect(markdown).toContain('**Milestone 1:** `abc1234`');
    expect(markdown).toContain('**Milestone 2:** `def1234`');
  });

  it('renders verification section', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Verification');
    expect(markdown).toContain('**Attempts:** 5 (3 passed, 2 failed)');
    expect(markdown).toContain('**Total Duration:** 30s');
  });

  it('renders verification with last failure', () => {
    const journalWithFailure = {
      ...baseJournal,
      verification: {
        summary: {
          attempts_total: 5,
          attempts_passed: 3,
          attempts_failed: 2,
          total_duration_seconds: 30
        },
        last_failure: {
          command: 'npm test',
          exit_code: 1,
          error_excerpt: 'Test failed: expected 2 to equal 3',
          log_path: 'artifacts/test.log'
        }
      }
    };

    const markdown = renderJournal(journalWithFailure);

    expect(markdown).toContain('### Last Failure');
    expect(markdown).toContain('**Command:** `npm test`');
    expect(markdown).toContain('**Exit Code:** 1');
    expect(markdown).toContain('Test failed: expected 2 to equal 3');
  });

  it('renders changes section with diff stat', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Changes');
    expect(markdown).toContain('**Range:** `abc1234..def1234`');
    expect(markdown).toContain('**Files Changed:** 2');
    expect(markdown).toContain('**Insertions:** +50');
    expect(markdown).toContain('**Deletions:** -10');
    expect(markdown).toContain('### Top Files');
    expect(markdown).toContain('**src/test.ts:** +40 -5');
    expect(markdown).toContain('### Diff Stat');
  });

  it('renders next action section', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Next Action');
    expect(markdown).toContain('**Run tests**');
    expect(markdown).toContain('*Verify changes*');
    expect(markdown).toContain('```bash\nnpm test\n```');
  });

  it('renders notes section when no notes', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('## Notes');
    expect(markdown).toContain('*No notes recorded*');
  });

  it('renders notes section when notes exist', () => {
    const journalWithNotes = {
      ...baseJournal,
      notes: {
        count: 5,
        path: 'notes.jsonl'
      }
    };

    const markdown = renderJournal(journalWithNotes);

    expect(markdown).toContain('**Count:** 5');
    expect(markdown).toContain('**File:** `notes.jsonl`');
    expect(markdown).toContain('*Run `runr note` to view notes');
  });

  it('renders warnings section when warnings exist', () => {
    const journalWithWarnings = {
      ...baseJournal,
      warnings: ['Failed to extract checkpoints', 'Missing timeline data']
    };

    const markdown = renderJournal(journalWithWarnings);

    expect(markdown).toContain('## ⚠️ Extraction Warnings');
    expect(markdown).toContain('- Failed to extract checkpoints');
    expect(markdown).toContain('- Missing timeline data');
  });

  it('does not render warnings section when no warnings', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).not.toContain('⚠️ Extraction Warnings');
  });

  it('renders footer with generation metadata', () => {
    const markdown = renderJournal(baseJournal);

    expect(markdown).toContain('*Generated by runr@0.3.1 on 2026-01-02 12:00:00 UTC*');
    expect(markdown).toContain('*Data sources: checkpoints=git_log_v1, verification=timeline_v1, next_action=derived*');
  });

  it('handles complete status with emoji', () => {
    const completedJournal = {
      ...baseJournal,
      status: {
        ...baseJournal.status,
        terminal_state: 'complete' as const
      }
    };

    const markdown = renderJournal(completedJournal);

    expect(markdown).toContain('# ✅ Test Task');
  });

  it('handles running status with emoji', () => {
    const runningJournal = {
      ...baseJournal,
      status: {
        ...baseJournal.status,
        terminal_state: 'running' as const
      }
    };

    const markdown = renderJournal(runningJournal);

    expect(markdown).toContain('# 🏃 Test Task');
  });

  it('formats duration with hours', () => {
    const longRunJournal = {
      ...baseJournal,
      status: {
        ...baseJournal.status,
        duration_seconds: 7265 // 2h 1m 5s
      }
    };

    const markdown = renderJournal(longRunJournal);

    expect(markdown).toContain('**Duration:** 2h 1m 5s');
  });

  it('skips task section when no title or goal', () => {
    const noTaskJournal = {
      ...baseJournal,
      task: {
        path: null,
        sha256: null,
        title: null,
        goal: null
      }
    };

    const markdown = renderJournal(noTaskJournal);

    expect(markdown).not.toContain('## Task');
  });

  it('skips verification section when no attempts', () => {
    const noVerificationJournal = {
      ...baseJournal,
      verification: {
        summary: {
          attempts_total: 0,
          attempts_passed: 0,
          attempts_failed: 0,
          total_duration_seconds: 0
        },
        last_failure: null
      }
    };

    const markdown = renderJournal(noVerificationJournal);

    expect(markdown).not.toContain('## Verification');
  });

  it('skips changes section when no files changed', () => {
    const noChangesJournal = {
      ...baseJournal,
      changes: {
        base_sha: null,
        head_sha: null,
        files_changed: null,
        insertions: null,
        deletions: null,
        top_files: null,
        diff_stat: null
      }
    };

    const markdown = renderJournal(noChangesJournal);

    expect(markdown).not.toContain('## Changes');
  });

  it('skips next action section when null', () => {
    const noActionJournal = {
      ...baseJournal,
      next_action: null
    };

    const markdown = renderJournal(noActionJournal);

    expect(markdown).not.toContain('## Next Action');
  });

  it('renders resumed_from when present', () => {
    const resumedJournal = {
      ...baseJournal,
      resumed_from: {
        run_id: 'previous123',
        checkpoint_sha: 'abc1234567890123456789012345678901234567'
      }
    };

    const markdown = renderJournal(resumedJournal);

    expect(markdown).toContain('**Resumed From:** Run previous123 @ `abc1234`');
  });
});
