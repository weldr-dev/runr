/**
 * Stop Footer - Consistent "Next Steps" block for stopped runs.
 *
 * Shows exactly 3 actions derived from the brain module for consistency
 * across front door, continue command, and stop footer.
 *
 * For review_loop_detected, also shows:
 * - Reviewer requested items
 * - Commands to satisfy
 * - Suggested intervention command
 */

import { RunState } from '../types/schemas.js';
import type { Action } from '../ux/brain.js';

const SEPARATOR = '─'.repeat(50);

/**
 * Context info extracted from run state.
 */
export interface StopContext {
  runId: string;
  stopReason: string;
  checkpointSha?: string;
  milestoneIndex: number;
  milestonesTotal: number;
  lastError?: string;
  phase?: string;
  // Extended fields for review_loop_detected
  reviewRound?: number;
  maxReviewRounds?: number;
  reviewerRequests?: string[];
  commandsToSatisfy?: string[];
}

/**
 * Next steps for JSON output.
 */
export interface NextSteps {
  resume: string;
  intervene: string;
  audit: string;
}

/**
 * Get context line based on stop reason.
 */
function getContextLine(ctx: StopContext): string | null {
  switch (ctx.stopReason) {
    case 'review_loop_detected':
      if (ctx.lastError) {
        // Extract first 2 items from error message if it contains a list
        const match = ctx.lastError.match(/(?:Unmet|Failed|Missing):\s*(.+)/i);
        if (match) {
          const items = match[1].split(/[,;]/).slice(0, 2).map(s => s.trim());
          return `Unmet: ${items.join(', ')}`;
        }
        return `Unmet: ${ctx.lastError.slice(0, 60)}...`;
      }
      return 'Unmet: review requirements not satisfied';

    case 'verification_failed':
      if (ctx.lastError) {
        const cmdMatch = ctx.lastError.match(/command.*failed|failed.*command/i);
        if (cmdMatch) {
          return `Failed: ${ctx.lastError.slice(0, 60)}`;
        }
        return `Failed: verification check`;
      }
      return 'Failed: verification check';

    case 'scope_violation':
      if (ctx.lastError) {
        // Extract file paths from error
        const files = ctx.lastError.match(/[\w./\-_]+\.\w+/g);
        if (files && files.length > 0) {
          return `Files: ${files.slice(0, 2).join(', ')}`;
        }
      }
      return 'Files: scope boundary exceeded';

    case 'stalled_timeout':
    case 'worker_call_timeout':
      return `Stalled at: ${ctx.phase || 'unknown phase'}`;

    case 'guard_fail':
    case 'preflight_failed':
      if (ctx.lastError) {
        const guardMatch = ctx.lastError.match(/guard.*failed|failed.*guard/i);
        if (guardMatch) {
          return `Guard: ${ctx.lastError.slice(0, 50)}`;
        }
      }
      return 'Guard: preflight check failed';

    default:
      // No context line for other reasons
      return null;
  }
}

/**
 * Build next steps commands.
 */
export function buildNextSteps(runId: string, stopReason: string): NextSteps {
  return {
    resume: `runr resume ${runId}`,
    intervene: `runr intervene ${runId} --reason ${stopReason || 'manual'} --note "..."`,
    audit: `runr runs audit --run ${runId}`
  };
}

/**
 * Format stop footer for console output.
 * If brainActions are provided, uses them for consistent UX across all entry points.
 * Otherwise falls back to default 3 commands (resume, intervene, audit).
 */
export function formatStopFooter(ctx: StopContext, brainActions?: Action[]): string {
  const lines: string[] = [];

  lines.push(SEPARATOR);

  // Header with optional round info
  if (ctx.stopReason === 'review_loop_detected' && ctx.reviewRound && ctx.maxReviewRounds) {
    lines.push(`STOPPED: ${ctx.stopReason} (round ${ctx.reviewRound}/${ctx.maxReviewRounds})`);
  } else {
    lines.push(`STOPPED: ${ctx.stopReason}`);
  }
  lines.push('');

  // Last checkpoint line
  if (ctx.checkpointSha) {
    lines.push(`Last checkpoint: ${ctx.checkpointSha.slice(0, 7)} (milestone ${ctx.milestoneIndex + 1}/${ctx.milestonesTotal})`);
  } else {
    lines.push(`No checkpoint (milestone ${ctx.milestoneIndex + 1}/${ctx.milestonesTotal})`);
  }

  // Enhanced output for review_loop_detected
  if (ctx.stopReason === 'review_loop_detected') {
    // Show reviewer requests if available
    if (ctx.reviewerRequests && ctx.reviewerRequests.length > 0) {
      lines.push('');
      lines.push('Reviewer requested:');
      ctx.reviewerRequests.slice(0, 3).forEach((req, i) => {
        lines.push(`  ${i + 1}. ${req}`);
      });
      if (ctx.reviewerRequests.length > 3) {
        lines.push(`  ... and ${ctx.reviewerRequests.length - 3} more`);
      }
    }

    // Show commands to satisfy if available
    if (ctx.commandsToSatisfy && ctx.commandsToSatisfy.length > 0) {
      lines.push('');
      lines.push('Commands to satisfy:');
      for (const cmd of ctx.commandsToSatisfy) {
        lines.push(`  ${cmd}`);
      }
    }

    // Show suggested intervention
    lines.push('');
    lines.push('Suggested intervention:');
    if (ctx.commandsToSatisfy && ctx.commandsToSatisfy.length > 0) {
      const cmdArgs = ctx.commandsToSatisfy.map(c => `--cmd "${c}"`).join(' ');
      lines.push(`  runr intervene ${ctx.runId} --reason review_loop \\`);
      lines.push(`    --note "Fixed review requests" ${cmdArgs}`);
    } else {
      lines.push(`  runr intervene ${ctx.runId} --reason review_loop \\`);
      lines.push(`    --note "Fixed review requests" --cmd "npm run build""`);
    }
  } else {
    // Context line based on stop reason (for non-review_loop cases)
    const contextLine = getContextLine(ctx);
    if (contextLine) {
      lines.push(contextLine);
    }
  }

  lines.push('');
  lines.push('Next steps:');

  if (brainActions && brainActions.length >= 3) {
    // Use brain-computed actions for consistency across UX
    for (const action of brainActions.slice(0, 3)) {
      lines.push(`  ${action.command}`);
    }
  } else {
    // Fallback to default commands
    const steps = buildNextSteps(ctx.runId, ctx.stopReason);
    lines.push(`  ${steps.resume}`);
    lines.push(`  ${steps.intervene}`);
    lines.push(`  ${steps.audit}`);
  }

  lines.push(SEPARATOR);

  return lines.join('\n');
}

/**
 * Build stop context from run state.
 * Extended version accepts optional review loop data.
 */
export function buildStopContext(
  state: RunState,
  reviewLoopData?: {
    reviewRound?: number;
    maxReviewRounds?: number;
    reviewerRequests?: string[];
    commandsToSatisfy?: string[];
  }
): StopContext {
  return {
    runId: state.run_id,
    stopReason: state.stop_reason || 'unknown',
    checkpointSha: state.checkpoint_commit_sha,
    milestoneIndex: state.milestone_index,
    milestonesTotal: state.milestones.length,
    lastError: state.last_error,
    phase: state.phase,
    // Extended review loop fields
    reviewRound: reviewLoopData?.reviewRound ?? state.review_rounds,
    maxReviewRounds: reviewLoopData?.maxReviewRounds,
    reviewerRequests: reviewLoopData?.reviewerRequests,
    commandsToSatisfy: reviewLoopData?.commandsToSatisfy
  };
}

/**
 * Print stop footer to console.
 * If reviewLoopData is provided, includes enhanced diagnostics.
 * If brainActions is provided, uses them for consistent UX (from brain module).
 */
export function printStopFooter(
  state: RunState,
  reviewLoopData?: {
    reviewRound?: number;
    maxReviewRounds?: number;
    reviewerRequests?: string[];
    commandsToSatisfy?: string[];
  },
  brainActions?: Action[]
): void {
  const ctx = buildStopContext(state, reviewLoopData);
  console.log('');
  console.log(formatStopFooter(ctx, brainActions));
}
