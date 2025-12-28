/**
 * Mock worker for testing auto-resume and stall detection.
 *
 * Controlled via AGENT_MOCK_WORKER env var:
 * - "hang": Never resolves (simulates hung worker)
 * - "hang_once": First call hangs, subsequent calls succeed
 * - "delay_5s": Resolves after 5 seconds with valid output
 * - "timeout_once_then_ok": First call times out (triggers worker_call_timeout), then succeeds
 * - "no_changes_no_evidence": Returns no_changes_needed without evidence (triggers insufficient_evidence)
 * - unset/other: Not used (real workers are used)
 *
 * The mock worker returns valid JSON output for the stage being tested.
 */

import { WorkerResult } from '../types/schemas.js';
import { WorkerRunInput } from './codex.js';

// Track call count for hang_once mode
let callCount = 0;

/** Valid mock worker modes */
const MOCK_WORKER_MODES = [
  'hang',
  'hang_once',
  'delay_5s',
  'timeout_once_then_ok',
  'no_changes_no_evidence',
  'review_always_request_changes'
] as const;

/**
 * Check if mock worker mode is enabled.
 */
export function isMockWorkerEnabled(): boolean {
  const mode = process.env.AGENT_MOCK_WORKER;
  return MOCK_WORKER_MODES.includes(mode as typeof MOCK_WORKER_MODES[number]);
}

/**
 * Get mock worker mode.
 */
export function getMockWorkerMode(): string | undefined {
  return process.env.AGENT_MOCK_WORKER;
}

/**
 * Reset mock worker state (for tests).
 */
export function resetMockWorker(): void {
  callCount = 0;
}

/**
 * Generate valid JSON output based on stage.
 * This ensures the mock can produce parseable responses.
 * Uses specific prompt template markers to avoid false matches in task content.
 */
function generateValidOutput(prompt: string): string {
  // Detect stage from prompt template headers (avoids matching task content)
  if (prompt.includes('# Planner Prompt') || prompt.includes('You are the planning model')) {
    return JSON.stringify({
      milestones: [
        {
          goal: 'Mock milestone for testing',
          files_expected: ['src/test.ts'],
          done_checks: ['Build passes', 'Tests pass'],
          risk_level: 'low'
        }
      ]
    });
  }

  if (prompt.includes('# Implementer Prompt') || prompt.includes('You are the implementer')) {
    return JSON.stringify({
      status: 'ok',
      handoff_memo: 'Mock implementation complete.'
    });
  }

  if (prompt.includes('# Reviewer Prompt') || prompt.includes('You are the reviewer model')) {
    return JSON.stringify({
      status: 'approve',
      changes: []
    });
  }

  // Default response
  return JSON.stringify({ result: 'ok' });
}

/**
 * Run mock worker with configured behavior.
 */
export async function runMockWorker(input: WorkerRunInput): Promise<WorkerResult> {
  const mode = getMockWorkerMode();
  callCount++;

  console.log(`[mock-worker] Mode: ${mode}, Call: ${callCount}`);

  switch (mode) {
    case 'hang':
      // Hang for 20 seconds then fail - allows watchdog (10s intervals) to catch the 12s cap
      console.log('[mock-worker] Hanging for 20 seconds...');
      await new Promise(resolve => setTimeout(resolve, 20000));
      return {
        status: 'failed',
        commands_run: ['mock-worker'],
        observations: ['Worker timed out (mock)']
      };

    case 'hang_once':
      // First call hangs (20s), subsequent calls succeed
      if (callCount === 1) {
        console.log('[mock-worker] First call - hanging for 20 seconds...');
        await new Promise(resolve => setTimeout(resolve, 20000));
        return {
          status: 'failed',
          commands_run: ['mock-worker'],
          observations: ['Worker timed out (mock hang_once first call)']
        };
      }
      console.log('[mock-worker] Subsequent call - returning success');
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    case 'delay_5s':
      // Delay 5 seconds then succeed
      console.log('[mock-worker] Delaying 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    case 'timeout_once_then_ok':
      // First call times out (for auto-resume testing), subsequent calls succeed
      if (callCount === 1) {
        // Use AGENT_MOCK_TIMEOUT_MS for fast testing, default to 65s for compatibility
        const timeoutMs = Number.parseInt(process.env.AGENT_MOCK_TIMEOUT_MS ?? '', 10) || 65000;
        console.log(`[mock-worker] First call - sleeping ${timeoutMs}ms to trigger stall timeout...`);
        await new Promise(resolve => setTimeout(resolve, timeoutMs));
        return {
          status: 'failed',
          commands_run: ['mock-worker'],
          observations: ['Worker stall timeout (mock timeout_once_then_ok)']
        };
      }
      console.log('[mock-worker] Subsequent call - returning success');
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    case 'no_changes_no_evidence':
      // Returns no_changes_needed without evidence (triggers insufficient_evidence)
      console.log('[mock-worker] Returning no_changes_needed without evidence');
      if (input.prompt.includes('IMPLEMENT') || input.prompt.includes('implement')) {
        return {
          status: 'ok',
          commands_run: ['mock-worker'],
          observations: [JSON.stringify({
            status: 'no_changes_needed',
            handoff_memo: 'No changes needed (mock)',
            evidence: null  // Missing evidence triggers insufficient_evidence
          })]
        };
      }
      // For other phases, return normal success
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    case 'review_always_request_changes':
      // Review always returns request_changes with identical message (triggers review_loop_detected)
      // Use more specific phase detection to avoid false matches in task content
      console.log('[mock-worker] review_always_request_changes mode');
      if (input.prompt.includes('# Reviewer Prompt') || input.prompt.includes('You are the reviewer model')) {
        console.log('[mock-worker] Returning request_changes for REVIEW phase');
        return {
          status: 'ok',
          commands_run: ['mock-worker'],
          observations: [JSON.stringify({
            status: 'request_changes',
            changes: [
              'The done checks require testing the actual CLI behavior.',
              'Please run the CLI commands to confirm the implementation works.'
            ]
          })]
        };
      }
      // For PLAN and IMPLEMENT, return normal success
      console.log('[mock-worker] Returning success for non-REVIEW phase');
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    default:
      // Should not reach here if isMockWorkerEnabled() is checked first
      return {
        status: 'failed',
        commands_run: ['mock-worker'],
        observations: ['Mock worker called but not configured']
      };
  }
}
