/**
 * Render module - terminal formatting for the UX layer.
 *
 * This module formats BrainOutput for display in the terminal.
 */

import type { BrainOutput, Action } from './brain.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/**
 * Check if stdout supports colors.
 */
function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

/**
 * Apply color if supported.
 */
function color(text: string, code: string): string {
  if (!supportsColor()) return text;
  return `${code}${text}${colors.reset}`;
}

/**
 * Format status indicator with color.
 */
function formatStatus(status: BrainOutput['status']): string {
  switch (status) {
    case 'running':
      return color('●', colors.green) + ' ' + color('RUNNING', colors.bold);
    case 'stopped_auto':
      return color('○', colors.yellow) + ' ' + color('STOPPED', colors.bold) + color(' (auto-fix available)', colors.dim);
    case 'stopped_manual':
      return color('○', colors.red) + ' ' + color('STOPPED', colors.bold) + color(' (manual needed)', colors.dim);
    case 'orch_ready':
      return color('◐', colors.cyan) + ' ' + color('ORCHESTRATION', colors.bold);
    case 'clean':
      return color('○', colors.dim) + ' ' + color('Ready', colors.bold);
  }
}

/**
 * Format a single action.
 */
function formatAction(action: Action, index: number): string {
  const num = color(`${index + 1})`, colors.dim);
  const cmd = action.primary
    ? color(action.command, colors.cyan + colors.bold)
    : color(action.command, colors.cyan);

  const parts = [`  ${num} ${cmd}`];

  if (action.rationale) {
    parts.push(color(`     # ${action.rationale}`, colors.dim));
  }

  return parts.join('\n');
}

/**
 * Format the front door output.
 */
export function formatFrontDoor(output: BrainOutput): string {
  const lines: string[] = [];

  // Status line
  lines.push(formatStatus(output.status));
  lines.push('');

  // Headline
  lines.push(output.headline);

  // Summary lines
  if (output.summaryLines.length > 0) {
    for (const line of output.summaryLines) {
      lines.push(color(line, colors.dim));
    }
  }

  lines.push('');

  // Actions
  lines.push(color('Next:', colors.bold));
  for (let i = 0; i < output.actions.length; i++) {
    lines.push(formatAction(output.actions[i], i));
  }

  lines.push('');

  // Hint
  lines.push(color("Tip: run 'runr help' for full command list.", colors.dim));

  return lines.join('\n');
}

/**
 * Format a compact status line (for scripts/pipes).
 */
export function formatStatusLine(output: BrainOutput): string {
  const statusMap = {
    running: 'RUNNING',
    stopped_auto: 'STOPPED_AUTO',
    stopped_manual: 'STOPPED_MANUAL',
    orch_ready: 'ORCH_READY',
    clean: 'CLEAN',
  };

  return `${statusMap[output.status]}: ${output.headline}`;
}

/**
 * Format output as JSON (for scripts).
 */
export function formatJson(output: BrainOutput): string {
  return JSON.stringify({
    status: output.status,
    headline: output.headline,
    summary: output.summaryLines,
    actions: output.actions.map(a => ({
      label: a.label,
      command: a.command,
      primary: a.primary,
    })),
    continue_strategy: output.continueStrategy,
  }, null, 2);
}
