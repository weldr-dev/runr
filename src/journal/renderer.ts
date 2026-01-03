/**
 * Markdown renderer for journal.json
 *
 * Converts machine-readable journal data into human-readable markdown.
 */

import type { JournalJson } from './types.js';

/**
 * Render journal.json as markdown
 */
export function renderJournal(journal: JournalJson): string {
  const sections: string[] = [];

  // Header
  sections.push(renderHeader(journal));

  // Metadata
  sections.push(renderMetadata(journal));

  // Task
  if (journal.task.title || journal.task.goal) {
    sections.push(renderTask(journal));
  }

  // Milestones & Checkpoints
  sections.push(renderMilestones(journal));

  // Verification
  if (journal.verification.summary.attempts_total > 0) {
    sections.push(renderVerification(journal));
  }

  // Changes
  if (journal.changes.files_changed !== null && journal.changes.files_changed > 0) {
    sections.push(renderChanges(journal));
  }

  // Next Action
  if (journal.next_action) {
    sections.push(renderNextAction(journal.next_action));
  }

  // Notes
  sections.push(renderNotes(journal));

  // Warnings (if any)
  if (journal.warnings.length > 0) {
    sections.push(renderWarnings(journal.warnings));
  }

  // Footer (extraction metadata)
  sections.push(renderFooter(journal));

  return sections.join('\n\n---\n\n');
}

function renderHeader(journal: JournalJson): string {
  const title = journal.task.title || `Run ${journal.run_id}`;
  const statusEmoji = getStatusEmoji(journal.status.terminal_state);

  return `# ${statusEmoji} ${title}\n\n**Run ID:** \`${journal.run_id}\`  \n**Status:** ${journal.status.phase} (${journal.status.terminal_state})`;
}

function getStatusEmoji(state: string): string {
  switch (state) {
    case 'complete':
      return '✅';
    case 'stopped':
      return '⏸️';
    case 'running':
      return '🏃';
    default:
      return '❓';
  }
}

function renderMetadata(journal: JournalJson): string {
  const lines: string[] = ['## Metadata'];

  if (journal.status.timestamps.started_at) {
    lines.push(`- **Started:** ${formatTimestamp(journal.status.timestamps.started_at)}`);
  }

  if (journal.status.timestamps.ended_at) {
    lines.push(`- **Ended:** ${formatTimestamp(journal.status.timestamps.ended_at)}`);
  }

  if (journal.status.duration_seconds !== null) {
    lines.push(`- **Duration:** ${formatDuration(journal.status.duration_seconds)}`);
  }

  if (journal.status.stop_reason) {
    lines.push(`- **Stop Reason:** ${journal.status.stop_reason}`);
  }

  if (journal.resumed_from) {
    lines.push(`- **Resumed From:** Run ${journal.resumed_from.run_id} @ \`${journal.resumed_from.checkpoint_sha.substring(0, 7)}\``);
  }

  return lines.join('\n');
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function renderTask(journal: JournalJson): string {
  const lines: string[] = ['## Task'];

  if (journal.task.title) {
    lines.push(`**Title:** ${journal.task.title}`);
  }

  if (journal.task.goal) {
    lines.push(`\n**Goal:**\n${journal.task.goal}`);
  }

  if (journal.task.path) {
    lines.push(`\n**Task File:** \`${journal.task.path}\``);
  }

  return lines.join('\n');
}

function renderMilestones(journal: JournalJson): string {
  const lines: string[] = ['## Milestones'];

  const { attempted, total, verified } = journal.milestones;
  lines.push(`- **Attempted:** ${attempted}/${total}`);
  lines.push(`- **Verified:** ${verified}/${total}`);
  lines.push(`- **Checkpoints:** ${journal.checkpoints.created}`);

  if (journal.checkpoints.list.length > 0) {
    lines.push('\n### Checkpoint History');
    for (const cp of journal.checkpoints.list) {
      const shortSha = cp.sha.substring(0, 7);
      const timestamp = formatTimestamp(cp.created_at);
      lines.push(`- **Milestone ${cp.milestone_index}:** \`${shortSha}\` (${timestamp})`);
    }
  }

  return lines.join('\n');
}

function renderVerification(journal: JournalJson): string {
  const lines: string[] = ['## Verification'];

  const { attempts_total, attempts_passed, attempts_failed, total_duration_seconds } = journal.verification.summary;

  lines.push(`- **Attempts:** ${attempts_total} (${attempts_passed} passed, ${attempts_failed} failed)`);
  lines.push(`- **Total Duration:** ${formatDuration(total_duration_seconds)}`);

  if (journal.verification.last_failure) {
    const { command, exit_code, error_excerpt, log_path } = journal.verification.last_failure;
    lines.push('\n### Last Failure');
    lines.push(`**Command:** \`${command}\``);
    lines.push(`**Exit Code:** ${exit_code}`);
    lines.push(`**Log:** \`${log_path}\``);
    lines.push('\n**Error Excerpt:**\n```');
    lines.push(error_excerpt);
    lines.push('```');
  }

  return lines.join('\n');
}

function renderChanges(journal: JournalJson): string {
  const lines: string[] = ['## Changes'];

  if (journal.base_sha && journal.head_sha) {
    const baseShort = journal.base_sha.substring(0, 7);
    const headShort = journal.head_sha.substring(0, 7);
    lines.push(`**Range:** \`${baseShort}..${headShort}\``);
  }

  const { files_changed, insertions, deletions } = journal.changes;
  lines.push(`- **Files Changed:** ${files_changed}`);
  lines.push(`- **Insertions:** +${insertions}`);
  lines.push(`- **Deletions:** -${deletions}`);

  if (journal.changes.top_files && journal.changes.top_files.length > 0) {
    lines.push('\n### Top Files');
    for (const file of journal.changes.top_files) {
      lines.push(`- **${file.path}:** +${file.insertions} -${file.deletions}`);
    }
  }

  if (journal.changes.diff_stat) {
    lines.push('\n### Diff Stat');
    lines.push('```');
    lines.push(journal.changes.diff_stat);
    lines.push('```');
  }

  return lines.join('\n');
}

function renderNextAction(nextAction: NonNullable<JournalJson['next_action']>): string {
  const lines: string[] = ['## Next Action'];

  lines.push(`**${nextAction.title}**`);
  lines.push(`\n*${nextAction.why}*`);
  lines.push(`\n\`\`\`bash\n${nextAction.command}\n\`\`\``);

  return lines.join('\n');
}

function renderNotes(journal: JournalJson): string {
  const lines: string[] = ['## Notes'];

  if (journal.notes.count === 0) {
    lines.push('*No notes recorded*');
  } else {
    lines.push(`**Count:** ${journal.notes.count}`);
    lines.push(`**File:** \`${journal.notes.path}\``);
    lines.push('\n*Run `runr note` to view notes in chronological order*');
  }

  return lines.join('\n');
}

function renderWarnings(warnings: string[]): string {
  const lines: string[] = ['## ⚠️ Extraction Warnings'];

  lines.push('The following issues occurred during journal extraction:');
  lines.push('');
  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }

  return lines.join('\n');
}

function renderFooter(journal: JournalJson): string {
  const lines: string[] = [];

  lines.push(`*Generated by ${journal.generated_by} on ${formatTimestamp(journal.generated_at)}*`);
  lines.push(`*Data sources: checkpoints=${journal.extraction.checkpoints}, verification=${journal.extraction.verification}, next_action=${journal.extraction.next_action}*`);

  return lines.join('  \n');
}
