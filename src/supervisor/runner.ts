import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import picomatch from 'picomatch';
import { AgentConfig, SCOPE_PRESETS } from '../config/schema.js';
import { git } from '../repo/git.js';
import { listChangedFiles } from '../repo/context.js';
import { RunStore, WorkerCallInfo } from '../store/run-store.js';
import { Milestone, RunState, WorkerStats, VerificationEvidence } from '../types/schemas.js';
import { buildImplementPrompt, buildPlanPrompt, buildReviewPrompt } from '../workers/prompts.js';
import {
  buildContextPack,
  formatContextPackForPrompt,
  writeContextPackArtifact,
  ContextPack
} from '../context/index.js';
import { runClaude } from '../workers/claude.js';
import { runCodex } from '../workers/codex.js';
import { isMockWorkerEnabled, runMockWorker } from '../workers/mock.js';
import {
  implementerOutputSchema,
  planOutputSchema,
  reviewOutputSchema
} from '../workers/schemas.js';
import { parseJsonWithSchema } from '../workers/json.js';
import { checkLockfiles, checkScope, partitionChangedFiles } from './scope-guard.js';
import { commandsForTier, selectTiersWithReasons } from './verification-policy.js';
import { runVerification } from '../verification/engine.js';
import { stopRun, updatePhase, prepareForResume } from './state-machine.js';
import { buildJournal } from '../journal/builder.js';
import { renderJournal } from '../journal/renderer.js';
import { writeReceipt, extractBaseSha, deriveTerminalState, printRunReceipt } from '../receipt/writer.js';
import {
  getActiveRuns,
  checkFileCollisions,
  formatFileCollisionError
} from './collision.js';
import {
  parseReviewFeedback,
  mapToCommand
} from '../review/check-parser.js';
import {
  validateNoChangesEvidence,
  formatEvidenceErrors
} from './evidence-gate.js';
import { normalizeOwnsPatterns, toPosixPath } from '../ownership/normalize.js';

/**
 * Check if changed files are within owned paths.
 * Only enforced when ownedPaths is non-empty.
 * Uses semantic_changed (post env partition) to avoid env noise.
 * Defensively normalizes ownedPaths to prevent caller from weakening enforcement.
 */
export interface OwnershipCheckResult {
  ok: boolean;
  owned_paths: string[];
  semantic_changed: string[];
  violating_files: string[];
}

export function checkOwnership(
  changedFiles: string[],
  ownedPaths: string[],
  envAllowlist: string[]
): OwnershipCheckResult {
  // No enforcement if no ownership declared
  if (ownedPaths.length === 0) {
    return {
      ok: true,
      owned_paths: [],
      semantic_changed: [],
      violating_files: []
    };
  }

  // Defensive normalization: ensures consistent matching even if caller passes raw patterns
  const normalizedOwned = normalizeOwnsPatterns(ownedPaths);

  // Partition to get semantic changes (exclude env artifacts)
  const { semantic_changed } = partitionChangedFiles(changedFiles, envAllowlist);

  // No semantic changes = no violation
  if (semantic_changed.length === 0) {
    return {
      ok: true,
      owned_paths: normalizedOwned,
      semantic_changed: [],
      violating_files: []
    };
  }

  // Compile ownership matchers
  const ownershipMatchers = normalizedOwned.map((p) => picomatch(p));

  // Check each semantic change against ownership
  const violating_files: string[] = [];
  for (const file of semantic_changed) {
    const posixFile = toPosixPath(file);
    const isOwned = ownershipMatchers.some((m) => m(posixFile));
    if (!isOwned) {
      violating_files.push(file);
    }
  }

  return {
    ok: violating_files.length === 0,
    owned_paths: normalizedOwned,
    semantic_changed,
    violating_files
  };
}

/**
 * Stop reasons that are eligible for auto-resume.
 * These represent transient/infrastructure failures, not logic errors.
 *
 * Explicitly NOT included:
 * - time_budget_exceeded: Creates "budget treadmill" if resumed
 * - verification_failed_max_retries: Real code issue
 * - guard_violation: Real scope/policy issue
 * - implement_blocked: Worker can't proceed
 * - *_parse_failed: Persistent format issues
 * - complete: Success, nothing to resume
 */
const AUTO_RESUMABLE_REASONS = new Set([
  'stalled_timeout',
  'worker_call_timeout'
]);

function isAutoResumable(reason: string | undefined): boolean {
  return reason !== undefined && AUTO_RESUMABLE_REASONS.has(reason);
}

/**
 * Maximum number of verification retry attempts per milestone before stopping.
 * Each retry transitions back to IMPLEMENT with fix instructions.
 */
const MAX_MILESTONE_RETRIES = 3;

const DEFAULT_STALL_TIMEOUT_MINUTES = 15;
const DEFAULT_WORKER_TIMEOUT_MINUTES = 30;

/**
 * Suggest scope presets based on violation patterns.
 * Matches violation file paths against preset patterns to recommend additions.
 */
function suggestPresetsForViolations(violations: string[]): string[] {
  const suggestions: Set<string> = new Set();

  for (const violation of violations) {
    for (const [presetName, patterns] of Object.entries(SCOPE_PRESETS)) {
      for (const pattern of patterns) {
        // Check if the violation matches the pattern
        if (picomatch.isMatch(violation, pattern)) {
          suggestions.add(presetName);
          break;
        }
      }
    }
  }

  return Array.from(suggestions);
}

/**
 * Resolve stall timeout in milliseconds.
 * Priority: AGENT_STALL_TIMEOUT_MS > STALL_TIMEOUT_MINUTES > config-based default
 */
function resolveStallTimeoutMs(config: AgentConfig): number {
  // Direct millisecond override (for fast testing)
  const msValue = Number.parseInt(process.env.AGENT_STALL_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(msValue) && msValue > 0) {
    return msValue;
  }

  // Minutes-based override
  const envValue = Number.parseInt(process.env.STALL_TIMEOUT_MINUTES ?? '', 10);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue * 60 * 1000;
  }

  // Config-based default: max(15min, verify_time + 5min)
  const verifyMinutes = Math.ceil(config.verification.max_verify_time_per_milestone / 60);
  const fallbackMinutes = Math.max(DEFAULT_STALL_TIMEOUT_MINUTES, verifyMinutes + 5);
  return fallbackMinutes * 60 * 1000;
}

/**
 * Resolve worker call timeout in milliseconds.
 * Priority: AGENT_WORKER_CALL_TIMEOUT_MS > WORKER_TIMEOUT_MINUTES > computed default
 */
function resolveWorkerTimeoutMs(stallTimeoutMs: number): number {
  // Direct millisecond override (for fast testing)
  const msValue = Number.parseInt(process.env.AGENT_WORKER_CALL_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(msValue) && msValue > 0) {
    return msValue;
  }

  // Minutes-based override
  const envValue = Number.parseInt(process.env.WORKER_TIMEOUT_MINUTES ?? '', 10);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue * 60 * 1000;
  }

  // Default: max(30min, 2x stall timeout)
  const defaultMs = DEFAULT_WORKER_TIMEOUT_MINUTES * 60 * 1000;
  return Math.max(defaultMs, stallTimeoutMs * 2);
}

/**
 * Configuration options for the supervisor loop.
 */
export interface SupervisorOptions {
  /** Run store for persisting state, timeline, and artifacts */
  runStore: RunStore;
  /** Absolute path to the target repository */
  repoPath: string;
  /** Raw task text from the task file */
  taskText: string;
  /** Parsed agent configuration */
  config: AgentConfig;
  /** Maximum runtime in minutes before stopping */
  timeBudgetMinutes: number;
  /** Maximum phase transitions before stopping */
  maxTicks: number;
  /** Whether lockfile changes are permitted */
  allowDeps: boolean;
  /** Fast path mode: skip PLAN and REVIEW phases */
  fast?: boolean;
  /** Enable automatic resume on transient failures (CLI flag overrides config) */
  autoResume?: boolean;
  /** Bypass file collision checks with active runs */
  forceParallel?: boolean;
  /** Normalized ownership patterns from task frontmatter (Phase-2 enforcement) */
  ownedPaths?: string[];
}

const DEFAULT_STOP_MEMO = [
  '# Stop Memo',
  '',
  "What's done:",
  '- ',
  '',
  "What's broken:",
  '- ',
  '',
  'Best next step (one command):',
  '- ',
  '',
  'Risk notes:',
  '- ',
  '',
  'Where to look:',
  '- '
].join('\n');

interface StopMemoParams {
  reason: string;
  runId: string;
  phase: string;
  milestoneIndex: number;
  milestonesTotal: number;
  lastError?: string;
  suggestedTime?: number;
  suggestedTicks?: number;
  scopeViolations?: string[];
  lockfileViolations?: string[];
}

/**
 * Build a structured stop memo with clear next actions.
 * Phase 6.3: Structured Stop Output
 */
function buildStructuredStopMemo(params: StopMemoParams): string {
  const {
    reason,
    runId,
    phase,
    milestoneIndex,
    milestonesTotal,
    lastError,
    suggestedTime,
    suggestedTicks
  } = params;

  const reasonDescriptions: Record<string, string> = {
    time_budget_exceeded: 'Time budget was exhausted before completing all milestones.',
    max_ticks_reached: 'Maximum phase transitions (ticks) reached before completion.',
    stalled_timeout: 'No progress detected for too long (worker may have hung).',
    worker_call_timeout: 'Worker call exceeded maximum duration hard cap.',
    verification_failed_max_retries: 'Verification failed too many times on the same milestone.',
    implement_blocked: 'Implementer reported it could not proceed.',
    guard_violation: 'Changes violated scope or lockfile constraints.',
    ownership_violation: 'Task modified files outside its declared ownership.',
    parallel_file_collision: 'Stopped to avoid merge conflicts with another active run.',
    insufficient_evidence: 'Implementer claimed no changes needed but provided insufficient evidence.',
    plan_parse_failed: 'Planner output could not be parsed.',
    implement_parse_failed: 'Implementer output could not be parsed.',
    review_parse_failed: 'Reviewer output could not be parsed.',
    review_loop_detected: 'Reviewer requested the same changes repeatedly or max review rounds exceeded.',
    plan_scope_violation: 'Planner proposed files outside the allowed scope.',
    complete: 'Run completed successfully.'
  };

  const likelyCauses: Record<string, string> = {
    time_budget_exceeded: 'Task took longer than expected, or time budget was too short.',
    max_ticks_reached: 'Complex task with many iterations, or tick budget was too low.',
    stalled_timeout: 'Worker CLI hung, network issues, or API timeout.',
    worker_call_timeout: 'Worker process hung indefinitely. Check worker CLI health with `agent doctor`.',
    verification_failed_max_retries: 'Code changes broke tests/lint and fixes kept failing.',
    implement_blocked: 'Missing dependencies, unclear requirements, or environment issue.',
    guard_violation: 'Implementer modified files outside allowed scope.',
    ownership_violation: 'Task declared owns: paths in frontmatter but touched files outside that claim.',
    parallel_file_collision: 'Another run is expected to modify the same files. Running in parallel would create merge conflicts.',
    insufficient_evidence: 'Worker claimed work was already done without proving it. This prevents false certainty.',
    plan_parse_failed: 'Planner returned malformed JSON.',
    implement_parse_failed: 'Implementer returned malformed JSON.',
    review_parse_failed: 'Reviewer returned malformed JSON.',
    review_loop_detected: 'Implementer unable to satisfy reviewer feedback, or reviewer expectations are unclear/impossible.',
    plan_scope_violation: 'Task requires files outside allowlist. Update scope.allowlist or scope.presets in agent.config.json.'
  };

  let nextAction: string;
  if (reason === 'time_budget_exceeded') {
    nextAction = `agent resume ${runId}${suggestedTime ? ` --time ${suggestedTime}` : ''}`;
  } else if (reason === 'max_ticks_reached') {
    nextAction = `agent resume ${runId}${suggestedTicks ? ` --max-ticks ${suggestedTicks}` : ''}`;
  } else if (reason === 'parallel_file_collision') {
    nextAction = `# Wait for conflicting run to complete, then:\nagent resume ${runId}`;
  } else if (reason === 'complete') {
    nextAction = 'None - run completed successfully.';
  } else {
    nextAction = `agent resume ${runId} --force  # Review state first`;
  }

  const lines = [
    '# Stop Memo',
    '',
    '## What Happened',
    `- **Stop reason**: ${reason}`,
    `- **Phase**: ${phase}`,
    `- **Progress**: Milestone ${milestoneIndex + 1} of ${milestonesTotal}`,
    '',
    '## Description',
    reasonDescriptions[reason] || 'Unknown stop reason.',
    '',
    '## Likely Cause',
    likelyCauses[reason] || 'Unknown cause.'
  ];

  if (lastError) {
    lines.push('', '## Last Error', '```', lastError.slice(0, 500), '```');
  }

  // Add violation details for guard_violation
  if (params.scopeViolations && params.scopeViolations.length > 0) {
    lines.push('', '## Scope Violations', 'Files modified outside allowlist:');
    for (const file of params.scopeViolations.slice(0, 10)) {
      lines.push(`- \`${file}\``);
    }
    if (params.scopeViolations.length > 10) {
      lines.push(`- ... and ${params.scopeViolations.length - 10} more`);
    }
  }

  if (params.lockfileViolations && params.lockfileViolations.length > 0) {
    lines.push('', '## Lockfile Violations', 'Lockfiles modified without --allow-deps:');
    for (const file of params.lockfileViolations) {
      lines.push(`- \`${file}\``);
    }
  }

  const tipsByReason: Record<string, string> = {
    time_budget_exceeded: '- Consider increasing --time if task is complex',
    max_ticks_reached: '- ~5 ticks per milestone is typical. Increase --max-ticks for complex tasks.',
    stalled_timeout: '- Check if workers are authenticated. Run `agent doctor` to diagnose.',
    worker_call_timeout: '- Worker hung indefinitely. Check API status, network, and run `agent doctor`.',
    parallel_file_collision: '- Use `agent status --all` to see conflicting runs. If you must proceed, use --force-parallel (may require manual merge resolution).',
    insufficient_evidence: '- Worker must provide files_checked, grep_output, or commands_run to prove no changes needed. Re-run with clearer task instructions.',
    review_loop_detected: '- Check review_digest.md for the requested changes. Consider simplifying the task or adjusting verification commands.',
    plan_scope_violation: '- Add missing file patterns to scope.allowlist, or use scope.presets for common stacks (vitest, nextjs, drizzle, etc.).',
    guard_violation: '- Add missing file patterns to scope.allowlist, or use --allow-deps for lockfile changes.'
  };

  lines.push(
    '',
    '## Next Action',
    '```bash',
    nextAction,
    '```',
    '',
    '## Tips',
    tipsByReason[reason] ?? '- Review the timeline.jsonl for detailed event history.'
  );

  return lines.join('\n');
}

/**
 * Auto-write journal.md when run completes
 */
async function writeJournalOnRunComplete(
  runId: string,
  repoPath: string
): Promise<void> {
  try {
    const journal = await buildJournal(runId, repoPath);
    const markdown = renderJournal(journal);

    // Get runs root and construct journal path
    const { getRunsRoot } = await import('../store/runs-root.js');
    const runDir = path.join(getRunsRoot(repoPath), runId);
    const journalPath = path.join(runDir, 'journal.md');

    fs.writeFileSync(journalPath, markdown, 'utf-8');
    console.log(`\n✓ Case file generated: runs/${runId}/journal.md`);
  } catch (err) {
    throw new Error(`Failed to generate journal: ${(err as Error).message}`);
  }
}

/**
 * Main supervisor entry point with auto-resume support.
 *
 * Wraps runSupervisorOnce with a while loop that automatically resumes
 * on transient failures (stall_timeout, worker_call_timeout) up to a configured limit.
 *
 * Auto-resume is enabled if:
 * - options.autoResume is true (CLI flag), OR
 * - config.resilience.auto_resume is true (config file)
 *
 * @param options - Supervisor configuration including run store, config, and budgets
 */
export async function runSupervisorLoop(options: SupervisorOptions): Promise<void> {
  // Determine if auto-resume is enabled (CLI flag overrides config)
  const autoResumeEnabled = options.autoResume ?? options.config.resilience?.auto_resume ?? false;

  if (!autoResumeEnabled) {
    // No auto-resume, just run once
    await runSupervisorOnce(options);
    return;
  }

  const maxResumes = options.config.resilience?.max_auto_resumes ?? 1;
  const delays = options.config.resilience?.auto_resume_delays_ms ?? [30000, 120000, 300000];

  // Track consecutive same-stop-reason to detect loops
  let lastStopReason: string | undefined;
  let consecutiveSameStops = 0;
  const MAX_CONSECUTIVE_SAME_STOPS = 2; // Cut off if same reason 2x in a row

  // Auto-resume loop
  let currentAttempt = 0; // Track which auto-resume attempt we're on (0 = initial run)

  while (true) {
    await runSupervisorOnce(options);

    // Check final state after loop completes
    const finalState = options.runStore.readState();
    const stopReason = finalState.stop_reason;
    const autoResumeCount = finalState.auto_resume_count ?? 0;

    // Emit auto_resume_result for metrics (only after auto-resume attempts, not initial run)
    if (currentAttempt > 0) {
      const outcome = stopReason === 'complete' ? 'completed' : 'stopped_again';
      options.runStore.appendEvent({
        type: 'auto_resume_result',
        source: 'supervisor',
        payload: {
          attempt: currentAttempt,
          outcome,
          stop_reason: stopReason ?? undefined
        }
      });
    }

    // Check if this stop reason is auto-resumable
    if (!isAutoResumable(stopReason)) {
      if (stopReason && stopReason !== 'complete') {
        options.runStore.appendEvent({
          type: 'auto_resume_skipped',
          source: 'supervisor',
          payload: {
            reason: stopReason,
            resumable: false,
            auto_resume_count: autoResumeCount
          }
        });
      }
      break;
    }

    // Check if we've hit the auto-resume cap
    if (autoResumeCount >= maxResumes) {
      options.runStore.appendEvent({
        type: 'auto_resume_exhausted',
        source: 'supervisor',
        payload: {
          count: autoResumeCount,
          max: maxResumes,
          reason: stopReason
        }
      });
      console.log(`\nAuto-resume cap reached (${autoResumeCount}/${maxResumes}). Manual intervention required.`);
      console.log(`Tip: Use \`agent resume ${finalState.run_id}\` to continue manually.\n`);
      break;
    }

    // Same-stop-repeat protection: cut off if same reason repeats too many times
    if (stopReason === lastStopReason) {
      consecutiveSameStops++;
      if (consecutiveSameStops >= MAX_CONSECUTIVE_SAME_STOPS) {
        options.runStore.appendEvent({
          type: 'auto_resume_loop_detected',
          source: 'supervisor',
          payload: {
            reason: stopReason,
            consecutive_count: consecutiveSameStops,
            auto_resume_count: autoResumeCount
          }
        });
        console.log(`\nAuto-resume loop detected: ${stopReason} repeated ${consecutiveSameStops}x. Stopping.`);
        console.log(`Tip: Investigate root cause before resuming manually.\n`);
        break;
      }
    } else {
      consecutiveSameStops = 1;
    }
    lastStopReason = stopReason;

    // Calculate backoff delay
    const delayMs = delays[Math.min(autoResumeCount, delays.length - 1)];

    options.runStore.appendEvent({
      type: 'auto_resume_scheduled',
      source: 'supervisor',
      payload: {
        attempt: autoResumeCount + 1,
        max: maxResumes,
        delay_ms: delayMs,
        reason: stopReason,
        previous_stop_reason: stopReason,
        resume_phase: finalState.last_successful_phase
      }
    });

    console.log(`\nAuto-resuming in ${Math.round(delayMs / 1000)}s (attempt ${autoResumeCount + 1}/${maxResumes})...`);

    await sleep(delayMs);

    // Prepare state for resume
    const resumedState = prepareForResume(finalState, { incrementAutoResumeCount: true });
    options.runStore.writeState(resumedState);

    options.runStore.appendEvent({
      type: 'auto_resume_started',
      source: 'supervisor',
      payload: {
        attempt: autoResumeCount + 1,
        run_id: finalState.run_id,
        previous_stop_reason: stopReason,
        resume_phase: resumedState.phase
      }
    });

    console.log(`Auto-resume started. Resuming from phase: ${resumedState.phase}\n`);
    // Loop continues, runSupervisorOnce will be called again
  }
}

/**
 * Single execution of the supervisor loop (no auto-resume).
 *
 * Executes up to `maxTicks` phase transitions, stopping early if:
 * - Time budget is exceeded
 * - Run reaches STOPPED phase
 * - A phase handler stops the run (e.g., guard violation, max retries)
 *
 * Phase flow: INIT -> PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> CHECKPOINT -> FINALIZE
 *
 * @param options - Supervisor configuration including run store, config, and budgets
 */
async function runSupervisorOnce(options: SupervisorOptions): Promise<void> {
  const startTime = Date.now();
  const stallTimeoutMs = resolveStallTimeoutMs(options.config);
  let lastProgressAt = Date.now();
  let stalled = false;

  const recordProgress = (state: RunState): RunState => {
    const now = new Date().toISOString();
    lastProgressAt = Date.now();
    return {
      ...state,
      last_progress_at: now,
      updated_at: now
    };
  };

  // Worker calls can take 5-20 minutes; use longer timeout when worker is in-flight
  // Configurable via WORKER_TIMEOUT_MINUTES env var (default: 30min or 2x stall timeout)
  const workerTimeoutMs = resolveWorkerTimeoutMs(stallTimeoutMs);

  // Hard cap on worker call duration (prevents infinite in-flight)
  const maxWorkerCallMs = (options.config.resilience?.max_worker_call_minutes ?? 45) * 60 * 1000;

  const watchdog = setInterval(() => {
    if (stalled) return;

    const lastWorkerCall = options.runStore.getLastWorkerCall();
    const lastEvent = options.runStore.getLastEvent();

    // Check if worker is in-flight (started after last progress)
    let workerInFlight = false;
    let workerStartedAt = 0;
    let workerCallDurationMs = 0;
    if (lastWorkerCall?.at) {
      workerStartedAt = new Date(lastWorkerCall.at).getTime();
      workerInFlight = workerStartedAt > lastProgressAt;
      workerCallDurationMs = Date.now() - workerStartedAt;
    }

    // Hard cap: if worker call exceeds max duration, force stop
    // This catches hung workers that never return
    if (workerInFlight && workerCallDurationMs >= maxWorkerCallMs) {
      stalled = true;
      const current = options.runStore.readState();
      const stopped = stopRun(current, 'worker_call_timeout');
      options.runStore.writeState(stopped);
      options.runStore.appendEvent({
        type: 'stop',
        source: 'supervisor',
        payload: {
          reason: 'worker_call_timeout',
          phase: current.phase,
          milestone_index: current.milestone_index,
          last_worker_call: lastWorkerCall,
          worker_call_duration_ms: workerCallDurationMs,
          max_worker_call_ms: maxWorkerCallMs
        }
      });
      const memo = buildStructuredStopMemo({
        reason: 'worker_call_timeout',
        runId: current.run_id,
        phase: current.phase,
        milestoneIndex: current.milestone_index,
        milestonesTotal: current.milestones.length,
        lastError: `Worker call exceeded ${options.config.resilience?.max_worker_call_minutes ?? 45} minute hard cap`
      });
      writeStopMemo(options.runStore, memo);
      return;
    }

    const elapsedMs = Date.now() - lastProgressAt;
    const effectiveTimeoutMs = workerInFlight ? workerTimeoutMs : stallTimeoutMs;

    if (elapsedMs < effectiveTimeoutMs) return;

    stalled = true;
    const current = options.runStore.readState();
    const stopped = stopRun(current, 'stalled_timeout');
    options.runStore.writeState(stopped);
    options.runStore.appendEvent({
      type: 'stop',
      source: 'supervisor',
      payload: {
        reason: 'stalled_timeout',
        phase: current.phase,
        milestone_index: current.milestone_index,
        last_event_type: lastEvent?.type ?? null,
        last_worker_call: lastWorkerCall ?? null,
        worker_in_flight: workerInFlight,
        elapsed_ms: elapsedMs,
        timeout_ms: effectiveTimeoutMs
      }
    });
    writeStopMemo(options.runStore, DEFAULT_STOP_MEMO);
  }, 10000);

  let ticksUsed = 0;

  try {
    for (let tick = 0; tick < options.maxTicks; tick += 1) {
      ticksUsed = tick + 1;

      if (stalled) {
        break;
      }

      let state = options.runStore.readState();
      if (state.phase === 'STOPPED') {
        break;
      }

      const elapsedMinutes = (Date.now() - startTime) / 60000;
      if (elapsedMinutes >= options.timeBudgetMinutes) {
        state = stopRun(state, 'time_budget_exceeded');
        options.runStore.writeState(state);
        options.runStore.appendEvent({
          type: 'stop',
          source: 'supervisor',
          payload: { reason: 'time_budget_exceeded', ticks_used: ticksUsed }
        });
        const memo = buildStructuredStopMemo({
          reason: 'time_budget_exceeded',
          runId: state.run_id,
          phase: state.phase,
          milestoneIndex: state.milestone_index,
          milestonesTotal: state.milestones.length,
          lastError: state.last_error,
          suggestedTime: Math.ceil(options.timeBudgetMinutes * 1.5),
          suggestedTicks: options.maxTicks
        });
        writeStopMemo(options.runStore, memo);
        console.log(
          `\nTime budget exceeded (${Math.floor(elapsedMinutes)}/${options.timeBudgetMinutes} min) at milestone ${state.milestone_index + 1}/${state.milestones.length}.`
        );
        console.log(`Tip: Use \`agent resume ${state.run_id} --time ${Math.ceil(options.timeBudgetMinutes * 1.5)}\` to continue with more time.\n`);
        break;
      }

      state = recordProgress(state);
      options.runStore.writeState(state);

      state = await runPhase(state, options);
      if (stalled) {
        break;
      }

      state = recordProgress(state);
      options.runStore.writeState(state);
    }

    // Check if we exited due to maxTicks (run not complete, not stalled, not time-exceeded)
    if (!stalled) {
      let finalState = options.runStore.readState();
      if (finalState.phase !== 'STOPPED') {
        // Mark as stopped with max_ticks_reached reason (resumable, not a failure)
        finalState = stopRun(finalState, 'max_ticks_reached');
        options.runStore.writeState(finalState);
        options.runStore.appendEvent({
          type: 'max_ticks_reached',
          source: 'supervisor',
          payload: {
            ticks_used: ticksUsed,
            max_ticks: options.maxTicks,
            phase: finalState.phase,
            milestone_index: finalState.milestone_index,
            milestones_total: finalState.milestones.length
          }
        });
        const memo = buildStructuredStopMemo({
          reason: 'max_ticks_reached',
          runId: finalState.run_id,
          phase: finalState.phase,
          milestoneIndex: finalState.milestone_index,
          milestonesTotal: finalState.milestones.length,
          lastError: finalState.last_error,
          suggestedTicks: Math.ceil(options.maxTicks * 1.5)
        });
        writeStopMemo(options.runStore, memo);
        console.log(
          `\nMax ticks reached (${ticksUsed}/${options.maxTicks}) at milestone ${finalState.milestone_index + 1}/${finalState.milestones.length}.`
        );
        console.log(`Tip: ~5 ticks per milestone. Use \`agent resume ${finalState.run_id} --max-ticks ${Math.ceil(options.maxTicks * 1.5)}\` to continue.\n`);
      }
    }
  } finally {
    clearInterval(watchdog);

    // Auto-write journal.md when run reaches terminal state
    try {
      const finalState = options.runStore.readState();
      if (finalState.phase === 'STOPPED') {
        await writeJournalOnRunComplete(finalState.run_id, options.repoPath);
      }
    } catch (err) {
      // Never crash on journal generation failure
      console.warn(`Warning: Failed to generate journal: ${(err as Error).message}`);
    }

    // Auto-write receipt artifacts at terminal state and print Run Receipt
    try {
      const finalState = options.runStore.readState();
      if (finalState.phase === 'STOPPED') {
        const baseSha = extractBaseSha(options.runStore.path);
        const terminalState = deriveTerminalState(finalState.stop_reason);
        const verificationTier = finalState.last_verification_evidence?.tiers_run?.[0] ?? null;

        const result = await writeReceipt({
          runStore: options.runStore,
          repoPath: options.repoPath,
          baseSha,
          checkpointSha: finalState.checkpoint_commit_sha ?? null,
          verificationTier,
          terminalState,
          stopReason: finalState.stop_reason,
          runId: finalState.run_id
        });

        // Print Run Receipt to console
        if (result) {
          // Read diffstat for console output
          const diffstatPath = path.join(options.runStore.path, 'diffstat.txt');
          const diffstat = fs.existsSync(diffstatPath)
            ? fs.readFileSync(diffstatPath, 'utf-8')
            : '';

          // Get integration branch from config
          const integrationBranch = options.config?.workflow?.integration_branch ?? 'main';

          printRunReceipt({
            runId: finalState.run_id,
            terminalState,
            stopReason: finalState.stop_reason,
            receipt: result.receipt,
            patchPath: result.patchPath,
            compressed: result.compressed,
            diffstat,
            integrationBranch
          });
        }
      }
    } catch (err) {
      // Never crash on receipt generation failure
      console.warn(`Warning: Failed to generate receipt: ${(err as Error).message}`);
    }
  }
}

/**
 * Dispatches to the appropriate phase handler based on current state.
 * Returns updated state after phase execution.
 *
 * Fast path mode (--fast):
 * - INIT → IMPLEMENT (skip PLAN)
 * - VERIFY → CHECKPOINT (skip REVIEW)
 */
async function runPhase(state: RunState, options: SupervisorOptions): Promise<RunState> {
  switch (state.phase) {
    case 'PLAN':
      return handlePlan(state, options);
    case 'IMPLEMENT':
      return handleImplement(state, options);
    case 'VERIFY':
      return handleVerify(state, options);
    case 'REVIEW':
      return handleReview(state, options);
    case 'CHECKPOINT':
      return handleCheckpoint(state, options);
    case 'FINALIZE':
      return handleFinalize(state, options);
    case 'INIT':
      // Fast path: skip PLAN, go directly to IMPLEMENT
      if (options.fast) {
        options.runStore.appendEvent({
          type: 'fast_path_skip',
          source: 'supervisor',
          payload: { skipped_phase: 'PLAN', reason: 'fast_mode' }
        });
        return updatePhase(state, 'IMPLEMENT');
      }
      return updatePhase(state, 'PLAN');
    default:
      return state;
  }
}

/**
 * PLAN phase: Invokes the planner worker to generate milestones from the task.
 * Validates that all files_expected are within the scope allowlist.
 * Writes plan.md artifact and transitions to IMPLEMENT on success.
 */
async function handlePlan(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'PLAN' }
  });

  const prompt = buildPlanPrompt({
    taskText: options.taskText,
    scopeAllowlist: state.scope_lock.allowlist
  });
  const planWorker = options.config.phases.plan;
  const parsed = await callWorkerJson({
    prompt,
    repoPath: options.repoPath,
    workerType: planWorker,
    workers: options.config.workers,
    schema: planOutputSchema,
    runStore: options.runStore,
    stage: 'plan'
  });

  // Check if we were stopped while waiting for worker (e.g., stall watchdog)
  const lateStopPlan = checkForLateResult(options, 'plan', parsed.worker);
  if (lateStopPlan) return lateStopPlan;

  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: parsed.worker,
      payload: {
        stage: 'plan',
        parser_context: 'plan',
        retry_count: parsed.retry_count ?? 0,
        error: parsed.error,
        output_snippet: snippet(parsed.output)
      }
    });
    return stopWithError(state, options, 'plan_parse_failed', parsed.error ?? 'Unknown error');
  }

  const plan = parsed.data;

  // Sanity check: all files_expected must be within allowlist
  const scopeViolations = validateFilesExpected(plan.milestones, state.scope_lock.allowlist);
  if (scopeViolations.length > 0) {
    // Infer expected root prefix from first allowlist pattern for debugging
    const expectedPrefix = state.scope_lock.allowlist[0]?.replace(/\*.*$/, '') || '';
    // Suggest presets that would cover the violation patterns
    const suggestedPresets = suggestPresetsForViolations(scopeViolations);

    options.runStore.appendEvent({
      type: 'plan_scope_violation',
      source: 'supervisor',
      payload: {
        violations: scopeViolations,
        allowlist: state.scope_lock.allowlist,
        expected_prefix: expectedPrefix,
        suggested_presets: suggestedPresets,
        hint: `All files_expected must start with a path matching allowlist patterns`
      }
    });

    // Build actionable error message
    let errorMessage = `Planner produced files_expected outside allowlist: ${scopeViolations.join(', ')}`;
    if (suggestedPresets.length > 0) {
      errorMessage += `. Try adding presets: [${suggestedPresets.join(', ')}] to scope.presets in agent.config.json`;
    }

    return stopWithError(state, options, 'plan_scope_violation', errorMessage);
  }

  // Stage 2: Post-PLAN file collision check (STOP by default)
  if (!options.forceParallel) {
    // Extract union of all files_expected from milestones
    const expectedFiles: string[] = [];
    for (const milestone of plan.milestones) {
      if (milestone.files_expected) {
        expectedFiles.push(...milestone.files_expected);
      }
    }

    // Get active runs (excluding this run)
    const activeRuns = getActiveRuns(options.repoPath, state.run_id);

    if (activeRuns.length > 0 && expectedFiles.length > 0) {
      const fileCollisions = checkFileCollisions(expectedFiles, activeRuns);

      if (fileCollisions.length > 0) {
        options.runStore.appendEvent({
          type: 'parallel_file_collision',
          source: 'supervisor',
          payload: {
            stage: 'post_plan',
            predicted_files: expectedFiles,
            collisions: fileCollisions.map(c => ({
              run_id: c.runId,
              colliding_files: c.collidingFiles,
              run_phase: c.phase,
              run_updated_at: c.updatedAt
            }))
          }
        });
        const collisionSummary = fileCollisions
          .map(c => `Run ${c.runId}: ${c.collidingFiles.slice(0, 3).join(', ')}${c.collidingFiles.length > 3 ? ` (+${c.collidingFiles.length - 3} more)` : ''}`)
          .join('; ');
        console.error('\n' + formatFileCollisionError(fileCollisions));
        return stopWithError(
          state,
          options,
          'parallel_file_collision',
          `File collision detected with active runs: ${collisionSummary}`
        );
      }
    }
  }

  const updated: RunState = {
    ...state,
    milestones: plan.milestones,
    worker_stats: incrementWorkerStats(state.worker_stats, parsed.worker, 'plan')
  };

  options.runStore.writePlan(JSON.stringify(plan, null, 2));
  options.runStore.appendEvent({
    type: 'plan_generated',
    source: parsed.worker,
    payload: plan
  });

  return updatePhase(updated, 'IMPLEMENT');
}

/**
 * IMPLEMENT phase: Invokes the implementer worker to execute the current milestone.
 * Includes fix instructions if retrying after verification failure.
 * Validates scope and lockfile guards after implementation.
 * Writes handoff memo and transitions to VERIFY on success.
 */
async function handleImplement(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'IMPLEMENT' }
  });

  const milestone = state.milestones[state.milestone_index];
  if (!milestone) {
    return stopWithError(state, options, 'milestone_missing', 'No milestone found.');
  }

  // Build context pack if enabled via env var (avoids config schema changes)
  const enableContextPack = process.env.CONTEXT_PACK === '1';
  let pack: ContextPack | null = null;

  if (enableContextPack) {
    // Extract references from task text (simple pattern matching for v1)
    const references: Array<{ pattern: string; hint?: string }> = [];
    const taskLower = options.taskText.toLowerCase();
    if (taskLower.includes('rng') && taskLower.includes('deckbuilder')) {
      references.push({ pattern: 'RNG pattern from deckbuilder' });
    }
    if (taskLower.includes('rng pattern')) {
      references.push({ pattern: 'RNG pattern' });
    }

    pack = buildContextPack({
      repoRoot: options.repoPath,
      targetRoot: state.scope_lock.allowlist[0]?.replace('/**', '') ?? options.repoPath,
      config: {
        verification: options.config.verification,
        scope: {
          allowlist: state.scope_lock.allowlist,
          denylist: state.scope_lock.denylist
        },
        lockfiles: options.config.scope?.lockfiles
      },
      references,
      allowDeps: options.allowDeps
    });
  }

  // Persist context pack artifact (enabled pack or disabled stub)
  writeContextPackArtifact(options.runStore.path, pack);

  const contextPackText = pack ? formatContextPackForPrompt(pack) : undefined;

  const prompt = buildImplementPrompt({
    milestone,
    scopeAllowlist: state.scope_lock.allowlist,
    scopeDenylist: state.scope_lock.denylist,
    allowDeps: options.allowDeps,
    contextPack: contextPackText,
    fixInstructions: state.last_verify_failure
      ? {
          failedCommand: state.last_verify_failure.failedCommand,
          errorOutput: state.last_verify_failure.errorOutput,
          changedFiles: state.last_verify_failure.changedFiles,
          attemptNumber: state.milestone_retries + 1
        }
      : undefined
  });

  const implementWorker = options.config.phases.implement;
  const parsed = await callWorkerJson({
    prompt,
    repoPath: options.repoPath,
    workerType: implementWorker,
    workers: options.config.workers,
    schema: implementerOutputSchema,
    runStore: options.runStore,
    stage: 'implement'
  });

  // Check if we were stopped while waiting for worker (e.g., stall watchdog)
  const lateStopImplement = checkForLateResult(options, 'implement', parsed.worker);
  if (lateStopImplement) return lateStopImplement;

  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: parsed.worker,
      payload: {
        stage: 'implement',
        parser_context: 'implement',
        retry_count: parsed.retry_count ?? 0,
        error: parsed.error,
        output_snippet: snippet(parsed.output)
      }
    });
    return stopWithError(state, options, 'implement_parse_failed', parsed.error ?? 'Unknown error');
  }

  const implementer = parsed.data;
  options.runStore.writeMemo(
    `milestone_${String(state.milestone_index + 1).padStart(2, '0')}_handoff.md`,
    implementer.handoff_memo
  );

  // Handle no_changes_needed with evidence validation
  if (implementer.status === 'no_changes_needed') {
    const evidenceResult = validateNoChangesEvidence(
      implementer.evidence,
      state.scope_lock.allowlist
    );

    if (!evidenceResult.ok) {
      options.runStore.appendEvent({
        type: 'no_changes_evidence_failed',
        source: parsed.worker,
        payload: {
          errors: evidenceResult.errors,
          evidence_provided: implementer.evidence ?? null
        }
      });
      const errorDetails = formatEvidenceErrors(evidenceResult);
      return stopWithError(state, options, 'insufficient_evidence', errorDetails);
    }

    // Evidence validated - log success and skip to CHECKPOINT (no changes to verify)
    options.runStore.appendEvent({
      type: 'no_changes_evidence_ok',
      source: parsed.worker,
      payload: {
        satisfied_by: evidenceResult.satisfied_by,
        evidence: implementer.evidence
      }
    });

    options.runStore.appendEvent({
      type: 'implement_complete',
      source: parsed.worker,
      payload: {
        changed_files: [],
        handoff_memo: implementer.handoff_memo,
        no_changes_needed: true,
        evidence_satisfied_by: evidenceResult.satisfied_by
      }
    });

    // Skip VERIFY since no changes were made, go directly to CHECKPOINT
    const updatedWithStats: RunState = {
      ...state,
      worker_stats: incrementWorkerStats(state.worker_stats, parsed.worker, 'implement')
    };
    return updatePhase(updatedWithStats, 'CHECKPOINT');
  }

  // Handle blocked/failed status
  if (implementer.status !== 'ok') {
    return stopWithError(state, options, 'implement_blocked', implementer.handoff_memo);
  }

  const changedFiles = await listChangedFiles(options.repoPath);

  // Record ignored files for forensics (journal)
  const { getIgnoredChangesSummary } = await import('../repo/context.js');
  const ignoredSummary = await getIgnoredChangesSummary(options.repoPath);
  if (ignoredSummary.ignored_count > 0 || ignoredSummary.ignore_check_status === 'failed') {
    options.runStore.appendEvent({
      type: 'ignored_changes',
      source: 'supervisor',
      payload: ignoredSummary
    });
  }

  const scopeCheck = checkScope(
    changedFiles,
    state.scope_lock.allowlist,
    state.scope_lock.denylist
  );
  const lockfileCheck = checkLockfiles(
    changedFiles,
    options.config.scope.lockfiles,
    options.allowDeps
  );

  if (!scopeCheck.ok || !lockfileCheck.ok) {
    const allViolations = [...scopeCheck.violations, ...lockfileCheck.violations];
    const errorMessage = allViolations.length > 0
      ? `Guard violation: ${allViolations.slice(0, 5).join(', ')}${allViolations.length > 5 ? ` (+${allViolations.length - 5} more)` : ''}`
      : 'Guard violation detected.';

    options.runStore.appendEvent({
      type: 'guard_violation',
      source: 'supervisor',
      payload: {
        scope_violations: scopeCheck.violations,
        lockfile_violations: lockfileCheck.violations
      }
    });

    // Build structured stop memo with violation details
    const memo = buildStructuredStopMemo({
      reason: 'guard_violation',
      runId: state.run_id,
      phase: state.phase,
      milestoneIndex: state.milestone_index,
      milestonesTotal: state.milestones.length,
      lastError: errorMessage,
      scopeViolations: scopeCheck.violations,
      lockfileViolations: lockfileCheck.violations
    });

    const updated = stopRun({
      ...state,
      last_error: errorMessage
    }, 'guard_violation');
    options.runStore.appendEvent({
      type: 'stop',
      source: 'supervisor',
      payload: { reason: 'guard_violation', error: errorMessage }
    });
    writeStopMemo(options.runStore, memo);
    return updated;
  }

  // Phase-2 ownership enforcement: only when owns is declared
  if (options.ownedPaths && options.ownedPaths.length > 0) {
    const ownershipCheck = checkOwnership(
      changedFiles,
      options.ownedPaths,
      options.config.scope.env_allowlist ?? []
    );

    if (!ownershipCheck.ok) {
      options.runStore.appendEvent({
        type: 'ownership_violation',
        source: 'supervisor',
        payload: {
          owned_paths: ownershipCheck.owned_paths,
          semantic_changed: ownershipCheck.semantic_changed,
          violating_files: ownershipCheck.violating_files
        }
      });
      return stopWithError(
        state,
        options,
        'ownership_violation',
        `Task modified files outside declared ownership: ${ownershipCheck.violating_files.join(', ')}`
      );
    }
  }

  options.runStore.appendEvent({
    type: 'implement_complete',
    source: parsed.worker,
    payload: {
      changed_files: changedFiles,
      handoff_memo: implementer.handoff_memo
    }
  });

  const updatedWithStats: RunState = {
    ...state,
    worker_stats: incrementWorkerStats(state.worker_stats, parsed.worker, 'implement')
  };

  return updatePhase(updatedWithStats, 'VERIFY');
}

/**
 * VERIFY phase: Runs verification commands based on tier selection.
 * Selects tiers based on risk triggers and milestone risk level.
 * On failure, retries up to MAX_MILESTONE_RETRIES times before stopping.
 * Writes verification logs and transitions to REVIEW on success.
 */
async function handleVerify(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'VERIFY' }
  });

  const changedFiles = await listChangedFiles(options.repoPath);
  const isLastMilestone = state.milestone_index === state.milestones.length - 1;
  const selection = selectTiersWithReasons(options.config.verification, {
    changed_files: changedFiles,
    risk_level: state.milestones[state.milestone_index]?.risk_level ?? 'medium',
    is_milestone_end: isLastMilestone,
    is_run_end: isLastMilestone
  });

  const results: string[] = [];
  const start = Date.now();

  // Compute verification cwd (default to repo root)
  const verifyCwd = options.config.verification.cwd
    ? path.join(options.repoPath, options.config.verification.cwd)
    : options.repoPath;

  // Track all commands required and run for evidence
  const allCommandsRequired: string[] = [];
  const allCommandsRun: Array<{ command: string; exit_code: number }> = [];
  const tiersRun: Array<'tier0' | 'tier1' | 'tier2'> = [];

  for (const tier of selection.tiers) {
    const elapsed = (Date.now() - start) / 1000;
    const remaining = options.config.verification.max_verify_time_per_milestone - elapsed;
    if (remaining <= 0) {
      results.push(`Tier ${tier} skipped: time budget exceeded.`);
      break;
    }

    const commands = commandsForTier(options.config.verification, tier);
    allCommandsRequired.push(...commands);

    if (commands.length === 0) {
      results.push(`Tier ${tier}: no commands configured.`);
      continue;
    }

    tiersRun.push(tier);

    const verifyResult = await runVerification(
      tier,
      commands,
      verifyCwd,
      Math.floor(remaining)
    );

    // Track individual command results
    for (const cmdResult of verifyResult.command_results) {
      allCommandsRun.push({
        command: cmdResult.command,
        exit_code: cmdResult.exit_code
      });
    }

    const artifactName = `tests_${tier}.log`;
    options.runStore.writeArtifact(artifactName, verifyResult.output);
    results.push(`Tier ${tier}: ${verifyResult.ok ? 'ok' : 'failed'}`);

    options.runStore.appendEvent({
      type: 'verification',
      source: 'verifier',
      payload: {
        tier,
        ok: verifyResult.ok,
        commands,
        command_results: verifyResult.command_results,
        duration_ms: verifyResult.duration_ms
      }
    });

    if (!verifyResult.ok) {
      // Check if we've exceeded retry limit
      if (state.milestone_retries >= MAX_MILESTONE_RETRIES) {
        options.runStore.appendEvent({
          type: 'verify_failed_max_retries',
          source: 'verifier',
          payload: {
            tier,
            retries: state.milestone_retries,
            max_retries: MAX_MILESTONE_RETRIES
          }
        });
        return stopWithError(state, options, 'verification_failed_max_retries', verifyResult.output);
      }

      // Record failure and retry
      const changedFiles = await listChangedFiles(options.repoPath);
      const failedCommand = commands.join(' && ');

      options.runStore.appendEvent({
        type: 'verify_failed_retry',
        source: 'verifier',
        payload: {
          tier,
          failed_command: failedCommand,
          retry_count: state.milestone_retries + 1,
          max_retries: MAX_MILESTONE_RETRIES
        }
      });

      const updated: RunState = {
        ...state,
        milestone_retries: state.milestone_retries + 1,
        last_verify_failure: {
          failedCommand,
          errorOutput: verifyResult.output,
          changedFiles,
          tier
        }
      };

      return updatePhase(updated, 'IMPLEMENT');
    }
  }

  // Compute missing commands (required but not run)
  const commandsRunSet = new Set(allCommandsRun.map(c => c.command));
  const commandsMissing = allCommandsRequired.filter(c => !commandsRunSet.has(c));

  // Build verification evidence for REVIEW phase
  const verificationEvidence: VerificationEvidence = {
    commands_required: allCommandsRequired,
    commands_run: allCommandsRun,
    commands_missing: commandsMissing,
    tiers_run: tiersRun
  };

  options.runStore.appendEvent({
    type: 'verify_complete',
    source: 'verifier',
    payload: {
      results,
      tier_reasons: selection.reasons,
      verification_evidence: verificationEvidence
    }
  });

  // Clear verify failure on success and store verification evidence
  const cleared: RunState = {
    ...state,
    last_verify_failure: undefined,
    last_verification_evidence: verificationEvidence
  };

  // Fast path: skip REVIEW, go directly to CHECKPOINT
  if (options.fast) {
    options.runStore.appendEvent({
      type: 'fast_path_skip',
      source: 'supervisor',
      payload: { skipped_phase: 'REVIEW', reason: 'fast_mode' }
    });
    return updatePhase(cleared, 'CHECKPOINT');
  }

  return updatePhase(cleared, 'REVIEW');
}

/**
 * REVIEW phase: Invokes the reviewer worker to evaluate the implementation.
 * Provides diff summary and verification output for review context.
 * On approval, transitions to CHECKPOINT; on rejection, returns to IMPLEMENT.
 */
async function handleReview(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'REVIEW' }
  });

  const milestone = state.milestones[state.milestone_index];
  if (!milestone) {
    return stopWithError(state, options, 'milestone_missing', 'No milestone found.');
  }

  // Intent-to-add untracked files so git diff shows their content
  // This makes review see actual file contents, not just "untracked: foo.ts"
  await git(['add', '-N', '.'], options.repoPath);

  const diffSummary = await git(['diff', '--stat'], options.repoPath);
  const diffContent = await git(['diff'], options.repoPath);
  // Truncate diff content to avoid overwhelming the reviewer
  const truncatedDiff = diffContent.stdout.length > 8000
    ? diffContent.stdout.slice(0, 8000) + '\n... (truncated)'
    : diffContent.stdout;

  const verifyLogPath = path.join(options.runStore.path, 'artifacts', 'tests_tier0.log');
  const verificationOutput = fs.existsSync(verifyLogPath)
    ? fs.readFileSync(verifyLogPath, 'utf-8')
    : '';

  // Build verification summary for evidence gating
  const filesExpected = milestone.files_expected ?? [];
  const filesExist = filesExpected.map(f => ({
    path: f,
    exists: fs.existsSync(path.join(options.repoPath, f))
  }));

  const verificationEvidence = state.last_verification_evidence;

  // Compute single boolean for easy reviewer compliance
  const commandsMissing = verificationEvidence?.commands_missing ?? ['(no verification evidence available)'];
  const allCommandsPassed = verificationEvidence?.commands_run?.every(c => c.exit_code === 0) ?? false;
  const allFilesExist = filesExist.every(f => f.exists);
  const evidenceGatesPassed =
    commandsMissing.length === 0 &&
    allCommandsPassed &&
    allFilesExist &&
    (verificationEvidence?.commands_run?.length ?? 0) > 0;

  const verificationSummary = {
    evidence_gates_passed: evidenceGatesPassed,
    commands_required: verificationEvidence?.commands_required ?? [],
    commands_run: verificationEvidence?.commands_run ?? [],
    commands_missing: commandsMissing,
    files_expected: filesExpected,
    files_exist: filesExist
  };

  const combinedDiff = [diffSummary.stdout.trim(), '', truncatedDiff].filter(Boolean).join('\n');
  const prompt = buildReviewPrompt({
    milestone,
    diffSummary: combinedDiff,
    verificationOutput,
    verificationSummary
  });

  const reviewWorker = options.config.phases.review;
  const parsed = await callWorkerJson({
    prompt,
    repoPath: options.repoPath,
    workerType: reviewWorker,
    workers: options.config.workers,
    schema: reviewOutputSchema,
    runStore: options.runStore,
    stage: 'review'
  });

  // Check if we were stopped while waiting for worker (e.g., stall watchdog)
  const lateStopReview = checkForLateResult(options, 'review', parsed.worker);
  if (lateStopReview) return lateStopReview;

  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: parsed.worker,
      payload: {
        stage: 'review',
        parser_context: 'review',
        retry_count: parsed.retry_count ?? 0,
        error: parsed.error,
        output_snippet: snippet(parsed.output)
      }
    });
    return stopWithError(state, options, 'review_parse_failed', parsed.error ?? 'Unknown error');
  }

  const review = parsed.data;
  options.runStore.appendEvent({
    type: 'review_complete',
    source: parsed.worker,
    payload: review
  });

  const updatedWithStats: RunState = {
    ...state,
    worker_stats: incrementWorkerStats(state.worker_stats, parsed.worker, 'review')
  };

  if (review.status === 'request_changes' || review.status === 'reject') {
    // Compute fingerprint of review changes for loop detection
    const changesText = review.changes.join('\n');
    const fingerprint = crypto.createHash('sha256').update(changesText).digest('hex').slice(0, 16);

    // Increment review rounds and check for loops
    const currentRounds = (updatedWithStats.review_rounds ?? 0) + 1;
    const maxRounds = options.config.resilience?.max_review_rounds ?? 2;
    const lastFingerprint = updatedWithStats.last_review_fingerprint;

    // Detect loop: same fingerprint twice in a row OR exceeded max rounds
    const sameFingerprint = lastFingerprint === fingerprint;
    const exceededRounds = currentRounds > maxRounds;

    if (sameFingerprint || exceededRounds) {
      const reason = sameFingerprint ? 'identical_review_feedback' : 'max_review_rounds_exceeded';

      // Parse review changes to extract actionable commands
      const parsedReview = parseReviewFeedback(changesText);
      const reviewerRequests = review.changes.slice(0, 5);
      const commandsToSatisfy = parsedReview.commandsToSatisfy;

      options.runStore.appendEvent({
        type: 'review_loop_detected',
        source: 'supervisor',
        payload: {
          milestone_index: state.milestone_index,
          review_rounds: currentRounds,
          max_review_rounds: maxRounds,
          same_fingerprint: sameFingerprint,
          last_changes: review.changes.slice(0, 2), // First 2 items for context
          // Enhanced fields for diagnostics
          reviewer_requests: reviewerRequests,
          commands_to_satisfy: commandsToSatisfy
        }
      });

      // Write enhanced review digest for debugging
      const digestLines = [
        '# Review Digest',
        '',
        `**Milestone:** ${state.milestone_index + 1} of ${state.milestones.length}`,
        `**Review Rounds:** ${currentRounds} (max: ${maxRounds})`,
        `**Stop Reason:** ${reason}`,
        '',
        '## Reviewer Requested Changes',
        '',
        ...review.changes.map((change, i) => `${i + 1}. ${change}`),
        ''
      ];

      // Add commands to satisfy section if we found any
      if (commandsToSatisfy.length > 0) {
        digestLines.push('## Commands to Satisfy');
        digestLines.push('');
        digestLines.push('Run these commands to address the requested changes:');
        digestLines.push('');
        digestLines.push('```bash');
        commandsToSatisfy.forEach(cmd => digestLines.push(cmd));
        digestLines.push('```');
        digestLines.push('');
      }

      // Add suggested intervention
      digestLines.push('## Suggested Intervention');
      digestLines.push('');
      if (commandsToSatisfy.length > 0) {
        const cmdArgs = commandsToSatisfy.map(c => `--cmd "${c}"`).join(' ');
        digestLines.push('```bash');
        digestLines.push(`runr intervene ${state.run_id} --reason review_loop \\`);
        digestLines.push(`  --note "Fixed review requests" ${cmdArgs}`);
        digestLines.push('```');
      } else {
        digestLines.push('```bash');
        digestLines.push(`runr intervene ${state.run_id} --reason review_loop \\`);
        digestLines.push(`  --note "Fixed review requests" --cmd "npm run build"`);
        digestLines.push('```');
      }

      digestLines.push('');
      digestLines.push('## Status');
      digestLines.push(`- **Verdict:** ${review.status}`);

      options.runStore.writeMemo('review_digest.md', digestLines.join('\n'));

      const errorMsg = sameFingerprint
        ? `Identical review feedback detected after ${currentRounds} rounds. Manual intervention required.`
        : `Review loop detected after ${currentRounds} rounds (max: ${maxRounds}). Manual intervention required.`;

      return stopWithError(updatedWithStats, options, 'review_loop_detected', errorMsg);
    }

    // Update state with new review_rounds and fingerprint
    const stateWithReviewTracking: RunState = {
      ...updatedWithStats,
      review_rounds: currentRounds,
      last_review_fingerprint: fingerprint
    };

    options.runStore.writeMemo(
      `milestone_${String(state.milestone_index + 1).padStart(2, '0')}_review.md`,
      changesText
    );
    return updatePhase(stateWithReviewTracking, 'IMPLEMENT');
  }

  return updatePhase(updatedWithStats, 'CHECKPOINT');
}

/**
 * CHECKPOINT phase: Commits changes and advances to the next milestone.
 * Creates a git commit with standardized message format.
 * If more milestones remain, transitions to IMPLEMENT; otherwise FINALIZE.
 */
async function handleCheckpoint(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'CHECKPOINT' }
  });

  const status = await git(['status', '--porcelain'], options.repoPath);
  if (status.stdout.trim().length > 0) {
    await git(['add', '-A'], options.repoPath);
    const message = `chore(runr): checkpoint ${state.run_id} milestone ${state.milestone_index}`;
    await git(['commit', '-m', message], options.repoPath);
  }

  const shaResult = await git(['rev-parse', 'HEAD'], options.repoPath);
  const sha = shaResult.stdout.trim();

  // Write checkpoint metadata sidecar (best-effort)
  let sidecarWritten = false;
  try {
    const { writeCheckpointMetadata } = await import('../store/checkpoint-metadata.js');
    await writeCheckpointMetadata({
      repoPath: options.repoPath,
      sha,
      runId: state.run_id,
      milestoneIndex: state.milestone_index,
      milestone: state.milestones[state.milestone_index],
      // Optional fields from last_verification_evidence (safe access)
      tier: state.last_verification_evidence?.tiers_run?.[0],
      verificationCommands: state.last_verification_evidence?.commands_run?.map(c => c.command) ?? undefined
    });
    sidecarWritten = true;
  } catch (error) {
    // Best-effort: don't fail run if sidecar write fails
    options.runStore.appendEvent({
      type: 'checkpoint_sidecar_write_failed',
      source: 'supervisor',
      payload: {
        sha,
        path: path.join(options.repoPath, '.runr', 'checkpoints', `${sha}.json`),
        error: String(error)
      }
    });
  }

  const nextIndex = state.milestone_index + 1;
  const updated: RunState = {
    ...state,
    checkpoint_commit_sha: sha,
    milestone_index: nextIndex,
    milestone_retries: 0,
    last_verify_failure: undefined,
    review_rounds: 0, // Reset for next milestone
    last_review_fingerprint: undefined // Reset for next milestone
  };

  options.runStore.appendEvent({
    type: 'checkpoint_complete',
    source: 'supervisor',
    payload: {
      commit: updated.checkpoint_commit_sha,
      milestone_index: state.milestone_index,
      sidecar_written: sidecarWritten
    }
  });

  if (nextIndex >= updated.milestones.length) {
    return updatePhase(updated, 'FINALIZE');
  }

  return updatePhase(updated, 'IMPLEMENT');
}

/**
 * FINALIZE phase: Writes summary, emits worker stats, and stops the run.
 * Called when all milestones are complete.
 */
async function handleFinalize(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'FINALIZE' }
  });

  const stats = state.worker_stats;
  const summary = [
    '# Summary',
    '',
    'Run completed.',
    '',
    '## Worker Stats',
    '',
    `| Worker | Total | Plan | Implement | Review |`,
    `|--------|-------|------|-----------|--------|`,
    `| Claude | ${stats.claude} | ${stats.by_phase.plan.claude} | ${stats.by_phase.implement.claude} | ${stats.by_phase.review.claude} |`,
    `| Codex  | ${stats.codex} | ${stats.by_phase.plan.codex} | ${stats.by_phase.implement.codex} | ${stats.by_phase.review.codex} |`
  ].join('\n');
  options.runStore.writeSummary(summary);

  // Emit worker stats event for easy querying
  options.runStore.appendEvent({
    type: 'worker_stats',
    source: 'supervisor',
    payload: stats
  });

  // Write completion artifact for meta-agent coordination
  const completePayload = {
    run_id: state.run_id,
    status: 'complete',
    phase: 'FINALIZE',
    progress: {
      milestone: state.milestones.length,
      of: state.milestones.length
    },
    worker_stats: stats,
    ts: new Date().toISOString()
  };
  options.runStore.writeMemo('complete.json', JSON.stringify(completePayload, null, 2));

  writeStopMemo(options.runStore, DEFAULT_STOP_MEMO);

  return stopRun(state, 'complete');
}

function stopWithError(
  state: RunState,
  options: SupervisorOptions,
  reason: string,
  error: string
): RunState {
  const updated = stopRun({
    ...state,
    last_error: error
  }, reason);
  options.runStore.appendEvent({
    type: 'stop',
    source: 'supervisor',
    payload: { reason, error }
  });
  writeStopMemo(options.runStore, DEFAULT_STOP_MEMO);
  return updated;
}

function writeStopMemo(runStore: RunStore, content: string): void {
  runStore.writeMemo('stop.md', content);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(baseMs: number): number {
  // Add 0-50% random jitter
  return baseMs + Math.random() * baseMs * 0.5;
}

/**
 * Check if run was stopped while waiting for a worker (e.g., by stall watchdog).
 * Returns the current state if stopped, null otherwise.
 * If stopped, logs a late_worker_result_ignored event.
 */
function checkForLateResult(
  options: SupervisorOptions,
  stage: 'plan' | 'implement' | 'review',
  workerType: string
): RunState | null {
  const currentState = options.runStore.readState();
  if (currentState.phase === 'STOPPED') {
    options.runStore.appendEvent({
      type: 'late_worker_result_ignored',
      source: 'supervisor',
      payload: { stage, worker: workerType }
    });
    return currentState;
  }
  return null;
}

// Jitter delays for parse retries: 250ms, 1s
const RETRY_DELAYS_MS = [250, 1000];

type InfraFailureReason = 'parse' | 'auth' | 'network' | 'rate_limit';

function classifyInfraOutput(output: string): 'auth' | 'network' | 'rate_limit' | 'unknown' {
  const lower = output.toLowerCase();

  // Auth errors
  if (lower.includes('oauth') || lower.includes('token expired') ||
      lower.includes('authentication') || lower.includes('login') ||
      lower.includes('401') || lower.includes('unauthorized') ||
      lower.includes('not authenticated') || lower.includes('sign in')) {
    return 'auth';
  }

  // Network errors
  if (lower.includes('enotfound') || lower.includes('econnrefused') ||
      lower.includes('network') || lower.includes('timeout') ||
      lower.includes('econnreset') || lower.includes('socket')) {
    return 'network';
  }

  // Rate limit errors
  if (lower.includes('rate limit') || lower.includes('429') ||
      lower.includes('too many requests') || lower.includes('quota')) {
    return 'rate_limit';
  }

  return 'unknown';
}

function resolveInfraReason(output?: string): InfraFailureReason {
  if (!output) return 'parse';
  const category = classifyInfraOutput(output);
  return category === 'unknown' ? 'parse' : category;
}

async function runWorkerWithRetries<S extends z.ZodTypeAny>(input: {
  prompt: string;
  retryPrompt: string;
  repoPath: string;
  workerType: 'claude' | 'codex';
  workers: AgentConfig['workers'];
  schema: S;
  runStore: RunStore;
  stage: string;
}): Promise<{
  data?: z.infer<S>;
  error?: string;
  output?: string;
  rawOutputs?: string[];
  retry_count?: number;
  worker: 'claude' | 'codex';
}> {
  const worker = input.workers[input.workerType];

  // Use mock worker if enabled (for testing stall detection)
  const useMock = isMockWorkerEnabled();
  const runWorker = useMock
    ? runMockWorker
    : (input.workerType === 'claude' ? runClaude : runCodex);
  const rawOutputs: string[] = [];
  let lastError: string | undefined;
  let lastOutput: string | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      // Check if run was stopped by watchdog before retrying
      const currentState = input.runStore.readState();
      if (currentState.phase === 'STOPPED') {
        break;
      }
      const delayMs = jitter(RETRY_DELAYS_MS[attempt - 1]);
      await sleep(delayMs);
    }

    const callInfo: WorkerCallInfo = {
      worker: input.workerType,
      stage: input.stage,
      attempt: attempt + 1,
      at: new Date().toISOString()
    };
    input.runStore.recordWorkerCall(callInfo);

    const runResult = await runWorker({
      prompt: attempt === 0 ? input.prompt : input.retryPrompt,
      repo_path: input.repoPath,
      worker
    });

    // Check if run was stopped by watchdog during worker call
    const postCallState = input.runStore.readState();
    if (postCallState.phase === 'STOPPED') {
      break;
    }

    const output = runResult.observations.join('\n');
    rawOutputs.push(output);
    lastOutput = output;

    const parsed = parseJsonWithSchema(output, input.schema);
    if (parsed.data) {
      return { data: parsed.data, output, retry_count: attempt, rawOutputs, worker: input.workerType };
    }
    lastError = parsed.error ?? lastError;
  }

  logRawOutputsToArtifact(input.runStore, input.stage, input.workerType, rawOutputs);

  return {
    error: lastError ?? 'JSON parse failed after retries',
    output: lastOutput ?? rawOutputs[rawOutputs.length - 1],
    rawOutputs,
    retry_count: RETRY_DELAYS_MS.length,
    worker: input.workerType
  };
}

/**
 * Unified worker call that dispatches to the appropriate worker based on config.
 * This allows phases to be configured to use either Claude or Codex.
 *
 * Retry policy (N=2): up to 2 retries with jitter delays (250ms, 1s).
 * Returns raw outputs for artifact logging on failure.
 */
async function callWorkerJson<S extends z.ZodTypeAny>(input: {
  prompt: string;
  repoPath: string;
  workerType: 'claude' | 'codex';
  workers: AgentConfig['workers'];
  schema: S;
  runStore: RunStore;
  stage: string;
}): Promise<{
  data?: z.infer<S>;
  error?: string;
  output?: string;
  rawOutputs?: string[];
  retry_count?: number;
  worker: 'claude' | 'codex';
}> {
  const retryPrompt = `${input.prompt}\n\nOutput JSON only between BEGIN_JSON and END_JSON. No other text.`;
  const primary = await runWorkerWithRetries({
    prompt: input.prompt,
    retryPrompt,
    repoPath: input.repoPath,
    workerType: input.workerType,
    workers: input.workers,
    schema: input.schema,
    runStore: input.runStore,
    stage: input.stage
  });

  if (primary.data) {
    return primary;
  }

  const fallbackWorker = input.workerType === 'claude' ? 'codex' : 'claude';
  if (!input.workers[fallbackWorker]) {
    return primary;
  }

  const reason = resolveInfraReason(primary.output);
  input.runStore.appendEvent({
    type: 'worker_fallback',
    source: 'supervisor',
    payload: {
      stage: input.stage,
      from: input.workerType,
      to: fallbackWorker,
      reason
    }
  });

  return runWorkerWithRetries({
    prompt: input.prompt,
    retryPrompt,
    repoPath: input.repoPath,
    workerType: fallbackWorker,
    workers: input.workers,
    schema: input.schema,
    runStore: input.runStore,
    stage: input.stage
  });
}

function snippet(output?: string): string {
  if (!output) {
    return '';
  }
  const trimmed = output.trim();
  if (trimmed.length <= 800) {
    return trimmed;
  }
  return `${trimmed.slice(0, 800)}...`;
}

/**
 * Log raw worker outputs to artifact for debugging parse failures.
 * Writes last 2KB of each attempt to help diagnose malformed responses.
 */
function logRawOutputsToArtifact(
  runStore: RunStore,
  stage: string,
  worker: string,
  rawOutputs: string[] | undefined
): void {
  if (!rawOutputs || rawOutputs.length === 0) return;

  const MAX_BYTES = 2048;
  const lines: string[] = [`# Raw Worker Outputs (${stage})`, ''];

  for (let i = 0; i < rawOutputs.length; i++) {
    const output = rawOutputs[i];
    const label = i === 0 ? 'Initial attempt' : `Retry ${i}`;
    const tail = output.length > MAX_BYTES
      ? output.slice(-MAX_BYTES)
      : output;

    lines.push(`## ${label}`);
    lines.push('```');
    lines.push(tail);
    lines.push('```');
    lines.push('');
  }

  runStore.writeArtifact(`raw-outputs-${stage}-${worker}.md`, lines.join('\n'));
}

/**
 * Increment worker stats for a given worker and phase.
 */
function incrementWorkerStats(
  stats: WorkerStats,
  worker: 'claude' | 'codex',
  phase: 'plan' | 'implement' | 'review'
): WorkerStats {
  return {
    ...stats,
    [worker]: stats[worker] + 1,
    by_phase: {
      ...stats.by_phase,
      [phase]: {
        ...stats.by_phase[phase],
        [worker]: stats.by_phase[phase][worker] + 1
      }
    }
  };
}

/**
 * Validate that all files_expected in milestones are within the allowlist.
 * Returns array of violating file paths.
 */
function validateFilesExpected(milestones: Milestone[], allowlist: string[]): string[] {
  const matchers = allowlist.map((pattern) => picomatch(pattern));
  const violations: string[] = [];
  for (const milestone of milestones) {
    const files = milestone.files_expected ?? [];
    for (const file of files) {
      const inScope = matchers.some((match) => match(file));
      if (!inScope) {
        violations.push(file);
      }
    }
  }
  return violations;
}
