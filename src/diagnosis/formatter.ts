/**
 * Formatter for human-readable diagnosis output.
 */

import { StopDiagnosisJson, DiagnosisCategory } from './types.js';

/**
 * Human-readable descriptions for each diagnosis category.
 */
const categoryDescriptions: Record<DiagnosisCategory, string> = {
  auth_expired: 'Worker authentication expired or invalid.',
  verification_cwd_mismatch: 'Verification commands ran in the wrong directory.',
  scope_violation: 'Files were modified outside the allowed scope.',
  lockfile_restricted: 'Lockfile was modified but dependency changes are not allowed.',
  verification_failure: 'Tests, linting, or type checks failed.',
  worker_parse_failure: 'Worker returned malformed or unparseable response.',
  stall_timeout: 'No progress detected for too long.',
  max_ticks_reached: 'Reached maximum phase transitions before completion.',
  time_budget_exceeded: 'Ran out of allocated time.',
  guard_violation_dirty: 'Working directory has uncommitted changes.',
  ownership_violation: 'Task modified files outside its declared owns: paths.',
  unknown: 'Could not determine specific cause.'
};

/**
 * Format diagnosis as human-readable markdown.
 */
export function formatStopMarkdown(diagnosis: StopDiagnosisJson): string {
  const lines: string[] = [];

  // Header
  lines.push('# Stop Diagnosis');
  lines.push('');

  // What happened
  lines.push('## What Happened');
  lines.push('');
  lines.push(`- **Run ID**: ${diagnosis.run_id}`);
  lines.push(`- **Outcome**: ${diagnosis.outcome}`);
  lines.push(`- **Stop Reason**: ${diagnosis.stop_reason ?? 'N/A'}`);
  lines.push('');

  // Probable cause
  lines.push('## Probable Cause');
  lines.push('');
  lines.push(`**${formatCategory(diagnosis.primary_diagnosis)}** (${Math.round(diagnosis.confidence * 100)}% confidence)`);
  lines.push('');
  lines.push(categoryDescriptions[diagnosis.primary_diagnosis]);
  lines.push('');

  // Evidence
  if (diagnosis.signals.length > 0) {
    lines.push('## Evidence');
    lines.push('');
    for (const signal of diagnosis.signals.slice(0, 5)) {
      const snippet = signal.snippet ? `: ${signal.snippet}` : '';
      lines.push(`- **${signal.source}** → ${signal.pattern}${snippet}`);
    }
    lines.push('');
  }

  // Next actions
  if (diagnosis.next_actions.length > 0) {
    lines.push('## Do This Next');
    lines.push('');
    for (let i = 0; i < Math.min(diagnosis.next_actions.length, 4); i++) {
      const action = diagnosis.next_actions[i];
      lines.push(`### ${i + 1}. ${action.title}`);
      lines.push('');
      if (action.command) {
        lines.push('```bash');
        lines.push(action.command);
        lines.push('```');
        lines.push('');
      }
      lines.push(`*${action.why}*`);
      lines.push('');
    }
  }

  // Escalation
  lines.push('## If It Repeats');
  lines.push('');
  lines.push(getEscalationAdvice(diagnosis.primary_diagnosis));
  lines.push('');

  // Related artifacts
  if (Object.keys(diagnosis.related_artifacts).length > 0) {
    lines.push('## Related Artifacts');
    lines.push('');
    if (diagnosis.related_artifacts.report) {
      lines.push(`- **Report**: \`${diagnosis.related_artifacts.report}\``);
    }
    if (diagnosis.related_artifacts.timeline) {
      lines.push(`- **Timeline**: \`${diagnosis.related_artifacts.timeline}\``);
    }
    if (diagnosis.related_artifacts.verify_logs) {
      lines.push(`- **Verify Logs**: \`${diagnosis.related_artifacts.verify_logs}\``);
    }
    if (diagnosis.related_artifacts.worker_output) {
      lines.push(`- **Worker Output**: \`${diagnosis.related_artifacts.worker_output}\``);
    }
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Diagnosed at ${diagnosis.diagnosed_at}*`);

  return lines.join('\n');
}

/**
 * Format category as human-readable title.
 */
function formatCategory(category: DiagnosisCategory): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get escalation advice for repeated failures.
 */
function getEscalationAdvice(category: DiagnosisCategory): string {
  switch (category) {
    case 'auth_expired':
      return 'Check OAuth token expiry settings. Consider re-authenticating before long runs.';
    case 'verification_cwd_mismatch':
      return 'Review your agent.config.json verification section. The cwd must match where package.json lives.';
    case 'scope_violation':
      return 'Consider if the task scope is too narrow. You may need to expand allowlist or break into smaller tasks.';
    case 'lockfile_restricted':
      return 'If the task genuinely needs new dependencies, use --allow-deps. Otherwise, reword the task.';
    case 'verification_failure':
      return 'The implementation may have fundamental issues. Review the test output carefully and consider adjusting requirements.';
    case 'worker_parse_failure':
      return 'This may indicate an API issue. Try with a different worker or simpler task prompts.';
    case 'stall_timeout':
      return 'Persistent stalls may indicate infrastructure issues. Check network, API quotas, and worker health.';
    case 'max_ticks_reached':
      return 'If runs consistently hit tick limits, the task may be too complex. Consider breaking into smaller milestones.';
    case 'time_budget_exceeded':
      return 'For complex tasks, allocate more time upfront: --time 120 or higher.';
    case 'guard_violation_dirty':
      return 'Always use --worktree for runs on repos with active development.';
    default:
      return 'Review the timeline and logs carefully. Open an issue if the problem persists.';
  }
}
