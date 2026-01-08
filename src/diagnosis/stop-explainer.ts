/**
 * Stop Diagnostics - Explains why a run stopped and suggests fixes.
 *
 * When review_loop_detected or other STOPPED states occur, this module
 * analyzes the timeline and provides actionable guidance.
 */

import fs from 'node:fs';
import path from 'node:path';

// Suggested action for fixing the stop reason
export interface SuggestedAction {
  command?: string;  // CLI command to run
  edit?: string;     // File to edit
  description: string;
}

// Full diagnostics structure
export interface StopDiagnostics {
  stop_reason: string;
  explanation: string;

  // For review_loop_detected
  loop_count?: number;
  last_review_requests?: string[];
  last_evidence_provided?: string[];
  unmet_checks?: string[];

  // For stalled_timeout
  last_activity_at?: string;
  time_since_activity_ms?: number;

  // For all stop reasons
  suggested_actions: SuggestedAction[];
}

// Timeline event type (simplified for parsing)
interface TimelineEvent {
  timestamp: string;
  event_type: string;
  phase?: string;
  status?: string;
  details?: Record<string, any>;
  content?: string;
  response?: string;
}

/**
 * Parse timeline.jsonl file
 */
export function parseTimeline(timelinePath: string): TimelineEvent[] {
  if (!fs.existsSync(timelinePath)) {
    return [];
  }

  const content = fs.readFileSync(timelinePath, 'utf-8');
  const events: TimelineEvent[] = [];

  for (const line of content.split('\n')) {
    if (line.trim()) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
  }

  return events;
}

/**
 * Extract review loop context from timeline
 */
export function extractReviewLoopContext(events: TimelineEvent[]): {
  loopCount: number;
  reviewRequests: string[];
  evidenceProvided: string[];
} {
  const reviewEvents = events.filter(e =>
    e.event_type === 'worker_response' && e.phase === 'review'
  );

  const implementEvents = events.filter(e =>
    e.event_type === 'worker_response' && e.phase === 'implement'
  );

  // Count review rounds
  const loopCount = Math.max(1, reviewEvents.length);

  // Extract review requests (look for common patterns)
  const reviewRequests: string[] = [];
  for (const event of reviewEvents.slice(-3)) {
    const content = event.response || event.content || '';
    // Look for requests in review feedback
    const requestPatterns = [
      /include (.+?) (output|evidence|in evidence)/gi,
      /run (.+?) (and provide|and show|to verify)/gi,
      /provide (.+?) (evidence|output)/gi,
      /missing (.+?) (output|evidence)/gi,
    ];
    for (const pattern of requestPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        reviewRequests.push(...matches.slice(0, 2));
      }
    }
  }

  // Extract evidence provided
  const evidenceProvided: string[] = [];
  for (const event of implementEvents.slice(-3)) {
    const content = event.response || event.content || '';
    // Look for evidence mentions
    if (content.includes('typecheck')) evidenceProvided.push('typecheck');
    if (content.includes('test') && content.includes('pass')) evidenceProvided.push('tests');
    if (content.includes('build')) evidenceProvided.push('build');
  }

  return {
    loopCount,
    reviewRequests: [...new Set(reviewRequests)].slice(0, 5),
    evidenceProvided: [...new Set(evidenceProvided)]
  };
}

/**
 * Generate unmet checks based on review context
 */
export function generateUnmetChecks(
  reviewRequests: string[],
  evidenceProvided: string[]
): string[] {
  const unmet: string[] = [];

  // Check for common verification patterns
  const checkPatterns = [
    { keyword: 'typecheck', check: 'typecheck_output_missing' },
    { keyword: 'test', check: 'test_output_missing' },
    { keyword: 'build', check: 'build_output_missing' },
    { keyword: 'lint', check: 'lint_output_missing' },
    { keyword: 'coverage', check: 'test_coverage_not_reported' },
  ];

  for (const { keyword, check } of checkPatterns) {
    const requested = reviewRequests.some(r => r.toLowerCase().includes(keyword));
    const provided = evidenceProvided.includes(keyword);
    if (requested && !provided) {
      unmet.push(check);
    }
  }

  // If nothing specific found but we have review requests, add generic
  if (unmet.length === 0 && reviewRequests.length > 0) {
    unmet.push('evidence_incomplete');
  }

  return unmet;
}

/**
 * Generate suggested actions based on stop reason
 */
export function generateSuggestedActions(
  stopReason: string,
  runId: string,
  unmetChecks: string[]
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  if (stopReason === 'review_loop_detected') {
    // Add specific commands based on unmet checks
    for (const check of unmetChecks) {
      switch (check) {
        case 'typecheck_output_missing':
          actions.push({
            command: `npm run typecheck 2>&1 | tee .runr/runs/${runId}/typecheck.log`,
            description: 'Run typecheck and capture output'
          });
          break;
        case 'test_output_missing':
          actions.push({
            command: `npm test 2>&1 | tee .runr/runs/${runId}/test.log`,
            description: 'Run tests and capture output'
          });
          break;
        case 'build_output_missing':
          actions.push({
            command: `npm run build 2>&1 | tee .runr/runs/${runId}/build.log`,
            description: 'Run build and capture output'
          });
          break;
        case 'lint_output_missing':
          actions.push({
            command: `npm run lint 2>&1 | tee .runr/runs/${runId}/lint.log`,
            description: 'Run lint and capture output'
          });
          break;
      }
    }

    // Always suggest resume or intervene
    actions.push({
      command: `runr resume ${runId}`,
      description: 'Resume the run after fixing issues'
    });

    actions.push({
      command: `runr intervene ${runId} --reason review_loop --note "Fixed manually" --cmd "npm run build"`,
      description: 'Record manual intervention and continue'
    });
  } else if (stopReason === 'stalled_timeout') {
    actions.push({
      command: `runr resume ${runId}`,
      description: 'Resume the run (may have recovered)'
    });
    actions.push({
      command: `runr intervene ${runId} --reason stalled_timeout --note "Completed manually"`,
      description: 'Record manual completion'
    });
  } else if (stopReason === 'verification_failed') {
    actions.push({
      command: `npm run build && npm test`,
      description: 'Fix failing verification commands'
    });
    actions.push({
      command: `runr resume ${runId}`,
      description: 'Resume after fixing'
    });
  }

  return actions;
}

/**
 * Generate stop diagnostics from timeline
 */
export function generateStopDiagnostics(
  runStorePath: string,
  runId: string,
  stopReason: string
): StopDiagnostics {
  const timelinePath = path.join(runStorePath, 'timeline.jsonl');
  const events = parseTimeline(timelinePath);

  // Base diagnostics
  const diagnostics: StopDiagnostics = {
    stop_reason: stopReason,
    explanation: getExplanation(stopReason),
    suggested_actions: []
  };

  if (stopReason === 'review_loop_detected') {
    const context = extractReviewLoopContext(events);
    diagnostics.loop_count = context.loopCount;
    diagnostics.last_review_requests = context.reviewRequests;
    diagnostics.last_evidence_provided = context.evidenceProvided;
    diagnostics.unmet_checks = generateUnmetChecks(
      context.reviewRequests,
      context.evidenceProvided
    );
  } else if (stopReason === 'stalled_timeout') {
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      diagnostics.last_activity_at = lastEvent.timestamp;
      diagnostics.time_since_activity_ms = Date.now() - new Date(lastEvent.timestamp).getTime();
    }
  }

  diagnostics.suggested_actions = generateSuggestedActions(
    stopReason,
    runId,
    diagnostics.unmet_checks || []
  );

  return diagnostics;
}

/**
 * Get human-readable explanation for stop reason
 */
function getExplanation(stopReason: string): string {
  switch (stopReason) {
    case 'review_loop_detected':
      return 'The run exceeded the maximum review rounds without passing all checks. ' +
        'The reviewer kept requesting changes that were not fully addressed.';
    case 'stalled_timeout':
      return 'The run timed out waiting for a response from the worker. ' +
        'The worker may have hung or encountered an unrecoverable error.';
    case 'verification_failed':
      return 'The verification commands failed. The implementation may have errors ' +
        'that need to be fixed before the run can continue.';
    case 'scope_violation':
      return 'The implementation attempted to modify files outside the allowed scope. ' +
        'Update the task scope or intervene to record the necessary changes.';
    default:
      return `The run stopped with reason: ${stopReason}`;
  }
}

/**
 * Write diagnostics to file
 */
export function writeStopDiagnostics(
  runStorePath: string,
  diagnostics: StopDiagnostics
): string {
  const diagnosticsPath = path.join(runStorePath, 'stop_diagnostics.json');
  fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2));
  return diagnosticsPath;
}

/**
 * Print diagnostics to console
 */
export function printStopDiagnostics(runId: string, diagnostics: StopDiagnostics): void {
  console.log('');
  console.log(`Run ${runId} STOPPED: ${diagnostics.stop_reason}`);
  console.log('');
  console.log('Diagnostics:');

  if (diagnostics.loop_count) {
    console.log(`  Loop count: ${diagnostics.loop_count}`);
  }

  if (diagnostics.last_review_requests && diagnostics.last_review_requests.length > 0) {
    console.log(`  Last reviewer requests:`);
    for (const req of diagnostics.last_review_requests) {
      console.log(`    - "${req}"`);
    }
  }

  if (diagnostics.unmet_checks && diagnostics.unmet_checks.length > 0) {
    console.log('');
    console.log('  Unmet checks:');
    for (const check of diagnostics.unmet_checks) {
      console.log(`    - ${check}`);
    }
  }

  if (diagnostics.time_since_activity_ms) {
    const mins = Math.round(diagnostics.time_since_activity_ms / 60000);
    console.log(`  Time since last activity: ${mins} minutes`);
  }

  if (diagnostics.suggested_actions.length > 0) {
    console.log('');
    console.log('  Suggested actions:');
    diagnostics.suggested_actions.forEach((action, i) => {
      console.log(`    ${i + 1}. ${action.description}`);
      if (action.command) {
        console.log(`       Run: ${action.command}`);
      }
      if (action.edit) {
        console.log(`       Edit: ${action.edit}`);
      }
    });
  }

  console.log('');
}
