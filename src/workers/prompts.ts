import fs from 'node:fs';
import path from 'node:path';
import { Milestone } from '../types/schemas.js';

function loadTemplate(name: string): string {
  const target = path.resolve('templates', 'prompts', name);
  return fs.readFileSync(target, 'utf-8');
}

export function buildPlanPrompt(input: {
  taskText: string;
  scopeAllowlist: string[];
}): string {
  const template = loadTemplate('planner.md');
  return [
    template,
    '',
    `Scope allowlist: ${input.scopeAllowlist.join(', ')}`,
    '(All files_expected paths must match one of these patterns)',
    '',
    'Task:',
    input.taskText,
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"milestones": [{"goal": "...", "files_expected": ["..."], "done_checks": ["..."], "risk_level": "medium"}], "risk_map": ["..."], "do_not_touch": ["..."]}',
    'END_JSON'
  ].join('\n');
}

export function buildImplementPrompt(input: {
  milestone: Milestone;
  scopeAllowlist: string[];
  scopeDenylist: string[];
  allowDeps: boolean;
  contextPack?: string;
  fixInstructions?: {
    failedCommand: string;
    errorOutput: string;
    changedFiles: string[];
    attemptNumber: number;
  };
}): string {
  const template = loadTemplate('implementer.md');
  const filesExpected = input.milestone.files_expected ?? [];
  const lines: string[] = [];

  // Context pack goes first so agent sees verification bar + patterns before acting
  if (input.contextPack) {
    lines.push(
      '## CONTEXT PACK (read first)',
      '',
      input.contextPack,
      '',
      '## END CONTEXT PACK',
      ''
    );
  }

  lines.push(
    template,
    '',
    `Milestone goal: ${input.milestone.goal}`,
    `Files to create/modify: ${filesExpected.length > 0 ? filesExpected.join(', ') : '(infer from goal)'}`,
    `Done checks: ${input.milestone.done_checks.join('; ')}`,
    `Scope allowlist: ${input.scopeAllowlist.join(', ') || 'none'}`,
    `Scope denylist: ${input.scopeDenylist.join(', ') || 'none'}`,
    `Allow deps: ${input.allowDeps ? 'yes' : 'no'}`
  );

  if (input.fixInstructions) {
    lines.push(
      '',
      '## FIX REQUIRED (Attempt ' + input.fixInstructions.attemptNumber + ')',
      '',
      'The previous implementation failed verification. Fix the error below.',
      '',
      `Failed command: ${input.fixInstructions.failedCommand}`,
      '',
      'Error output:',
      '```',
      input.fixInstructions.errorOutput.slice(0, 2000),
      '```',
      '',
      `Changed files: ${input.fixInstructions.changedFiles.join(', ') || 'none'}`,
      '',
      'Fix the error and ensure all done_checks pass.'
    );
  }

  lines.push(
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"status": "ok", "handoff_memo": "...", "commands_run": [], "observations": []}',
    'END_JSON'
  );

  return lines.join('\n');
}

export interface VerificationSummary {
  evidence_gates_passed: boolean;
  commands_required: string[];
  commands_run: Array<{ command: string; exit_code: number }>;
  commands_missing: string[];
  files_expected: string[];
  files_exist: Array<{ path: string; exists: boolean }>;
}

export function buildReviewPrompt(input: {
  milestone: Milestone;
  diffSummary: string;
  verificationOutput: string;
  verificationSummary?: VerificationSummary;
}): string {
  const template = loadTemplate('reviewer.md');
  const filesExpected = input.milestone.files_expected ?? [];

  // Build verification summary section
  let verificationSummaryText = '';
  if (input.verificationSummary) {
    verificationSummaryText = [
      '',
      '## Verification Summary (MUST CHECK)',
      '',
      '```json',
      JSON.stringify(input.verificationSummary, null, 2),
      '```',
      ''
    ].join('\n');
  } else {
    // No summary provided - reviewer must request_changes
    verificationSummaryText = [
      '',
      '## Verification Summary (MUST CHECK)',
      '',
      '```json',
      JSON.stringify({
        commands_required: ['(not provided)'],
        commands_run: [],
        commands_missing: ['(verification summary not available)'],
        files_expected: filesExpected,
        files_exist: filesExpected.map(f => ({ path: f, exists: '(not checked)' }))
      }, null, 2),
      '```',
      '',
      '⚠️ WARNING: Verification summary not available. You MUST request_changes.',
      ''
    ].join('\n');
  }

  return [
    template,
    verificationSummaryText,
    `Milestone goal: ${input.milestone.goal}`,
    `Files expected: ${filesExpected.length > 0 ? filesExpected.join(', ') : '(infer from goal)'}`,
    `Done checks: ${input.milestone.done_checks.join('; ')}`,
    '',
    'Diff summary (includes untracked new files):',
    input.diffSummary || '(no diff)',
    '',
    'Verification output:',
    input.verificationOutput || '(none)',
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"status": "approve", "changes": []}',
    'END_JSON'
  ].join('\n');
}
