import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import picomatch from 'picomatch';
import { AgentConfig } from '../config/schema.js';
import { git } from '../repo/git.js';
import { listChangedFiles } from '../repo/context.js';
import { RunStore } from '../store/run-store.js';
import { Milestone, RunState, WorkerStats } from '../types/schemas.js';
import { buildImplementPrompt, buildPlanPrompt, buildReviewPrompt } from '../workers/prompts.js';
import { buildContextPack, formatContextPackForPrompt } from '../context/index.js';
import { runClaude } from '../workers/claude.js';
import { runCodex } from '../workers/codex.js';
import {
  implementerOutputSchema,
  planOutputSchema,
  reviewOutputSchema
} from '../workers/schemas.js';
import { parseJsonWithSchema } from '../workers/json.js';
import { checkLockfiles, checkScope } from './scope-guard.js';
import { commandsForTier, selectTiersWithReasons } from './verification-policy.js';
import { runVerification } from '../verification/engine.js';
import { stopRun, updatePhase } from './state-machine.js';

/**
 * Maximum number of verification retry attempts per milestone before stopping.
 * Each retry transitions back to IMPLEMENT with fix instructions.
 */
const MAX_MILESTONE_RETRIES = 3;

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

/**
 * Main supervisor loop that orchestrates the agent through phases.
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
export async function runSupervisorLoop(options: SupervisorOptions): Promise<void> {
  const startTime = Date.now();

  for (let tick = 0; tick < options.maxTicks; tick += 1) {
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
        payload: { reason: 'time_budget_exceeded' }
      });
      writeStopMemo(options.runStore, DEFAULT_STOP_MEMO);
      break;
    }

    state = await runPhase(state, options);
    options.runStore.writeState(state);
  }
}

/**
 * Dispatches to the appropriate phase handler based on current state.
 * Returns updated state after phase execution.
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
    schema: planOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: planWorker,
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
    options.runStore.appendEvent({
      type: 'plan_scope_violation',
      source: 'supervisor',
      payload: {
        violations: scopeViolations,
        allowlist: state.scope_lock.allowlist,
        expected_prefix: expectedPrefix,
        hint: `All files_expected must start with a path matching allowlist patterns`
      }
    });
    return stopWithError(
      state,
      options,
      'plan_scope_violation',
      `Planner produced files_expected outside allowlist: ${scopeViolations.join(', ')}`
    );
  }

  const updated: RunState = {
    ...state,
    milestones: plan.milestones,
    worker_stats: incrementWorkerStats(state.worker_stats, planWorker, 'plan')
  };

  options.runStore.writePlan(JSON.stringify(plan, null, 2));
  options.runStore.appendEvent({
    type: 'plan_generated',
    source: planWorker,
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
  let contextPackText: string | undefined;

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

    const pack = buildContextPack({
      repoRoot: options.repoPath,
      targetRoot: state.scope_lock.allowlist[0]?.replace('/**', '') ?? options.repoPath,
      config: {
        verification: options.config.verification,
        scope: {
          allowlist: state.scope_lock.allowlist,
          denylist: state.scope_lock.denylist
        }
      },
      references
    });

    contextPackText = formatContextPackForPrompt(pack);
  }

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
    schema: implementerOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: implementWorker,
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

  if (implementer.status !== 'ok') {
    return stopWithError(state, options, 'implement_blocked', implementer.handoff_memo);
  }

  const changedFiles = await listChangedFiles(options.repoPath);
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
    options.runStore.appendEvent({
      type: 'guard_violation',
      source: 'supervisor',
      payload: {
        scope_violations: scopeCheck.violations,
        lockfile_violations: lockfileCheck.violations
      }
    });
    return stopWithError(state, options, 'guard_violation', 'Guard violation detected.');
  }

  options.runStore.appendEvent({
    type: 'implement_complete',
    source: implementWorker,
    payload: {
      changed_files: changedFiles,
      handoff_memo: implementer.handoff_memo
    }
  });

  const updatedWithStats: RunState = {
    ...state,
    worker_stats: incrementWorkerStats(state.worker_stats, implementWorker, 'implement')
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
  const selection = selectTiersWithReasons(options.config.verification, {
    changed_files: changedFiles,
    risk_level: state.milestones[state.milestone_index]?.risk_level ?? 'medium',
    is_milestone_end: false,
    is_run_end: false
  });

  const results: string[] = [];
  const start = Date.now();
  for (const tier of selection.tiers) {
    const elapsed = (Date.now() - start) / 1000;
    const remaining = options.config.verification.max_verify_time_per_milestone - elapsed;
    if (remaining <= 0) {
      results.push(`Tier ${tier} skipped: time budget exceeded.`);
      break;
    }

    const commands = commandsForTier(options.config.verification, tier);
    if (commands.length === 0) {
      results.push(`Tier ${tier}: no commands configured.`);
      continue;
    }

    const verifyResult = await runVerification(
      tier,
      commands,
      options.repoPath,
      Math.floor(remaining)
    );
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

  options.runStore.appendEvent({
    type: 'verify_complete',
    source: 'verifier',
    payload: {
      results,
      tier_reasons: selection.reasons
    }
  });

  // Clear verify failure on success
  const cleared: RunState = {
    ...state,
    last_verify_failure: undefined
  };

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

  const combinedDiff = [diffSummary.stdout.trim(), '', truncatedDiff].filter(Boolean).join('\n');
  const prompt = buildReviewPrompt({
    milestone,
    diffSummary: combinedDiff,
    verificationOutput
  });

  const reviewWorker = options.config.phases.review;
  const parsed = await callWorkerJson({
    prompt,
    repoPath: options.repoPath,
    workerType: reviewWorker,
    workers: options.config.workers,
    schema: reviewOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: reviewWorker,
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
    source: reviewWorker,
    payload: review
  });

  const updatedWithStats: RunState = {
    ...state,
    worker_stats: incrementWorkerStats(state.worker_stats, reviewWorker, 'review')
  };

  if (review.status === 'request_changes' || review.status === 'reject') {
    options.runStore.writeMemo(
      `milestone_${String(state.milestone_index + 1).padStart(2, '0')}_review.md`,
      review.changes.join('\n')
    );
    return updatePhase(updatedWithStats, 'IMPLEMENT');
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
    const message = `chore(agent): checkpoint milestone ${state.milestone_index + 1}`;
    await git(['commit', '-m', message], options.repoPath);
  }

  const shaResult = await git(['rev-parse', 'HEAD'], options.repoPath);
  const nextIndex = state.milestone_index + 1;
  const updated: RunState = {
    ...state,
    checkpoint_commit_sha: shaResult.stdout.trim(),
    milestone_index: nextIndex,
    milestone_retries: 0,
    last_verify_failure: undefined
  };

  options.runStore.appendEvent({
    type: 'checkpoint_complete',
    source: 'supervisor',
    payload: {
      commit: updated.checkpoint_commit_sha,
      milestone_index: state.milestone_index
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

/**
 * Unified worker call that dispatches to the appropriate worker based on config.
 * This allows phases to be configured to use either Claude or Codex.
 */
async function callWorkerJson<S extends z.ZodTypeAny>(input: {
  prompt: string;
  repoPath: string;
  workerType: 'claude' | 'codex';
  workers: AgentConfig['workers'];
  schema: S;
}): Promise<{ data?: z.infer<S>; error?: string; output?: string; retry_count?: number; worker: string }> {
  const worker = input.workers[input.workerType];
  const runWorker = input.workerType === 'claude' ? runClaude : runCodex;

  const first = await runWorker({
    prompt: input.prompt,
    repo_path: input.repoPath,
    worker
  });
  const firstOutput = first.observations.join('\n');
  const firstParsed = parseJsonWithSchema(firstOutput, input.schema);
  if (firstParsed.data) {
    return { data: firstParsed.data, output: firstOutput, retry_count: 0, worker: input.workerType };
  }

  const retryPrompt = `${input.prompt}\n\nOutput JSON only between BEGIN_JSON and END_JSON. No other text.`;
  const retry = await runWorker({
    prompt: retryPrompt,
    repo_path: input.repoPath,
    worker
  });
  const retryOutput = retry.observations.join('\n');
  const retryParsed = parseJsonWithSchema(retryOutput, input.schema);
  if (retryParsed.data) {
    return { data: retryParsed.data, output: retryOutput, retry_count: 1, worker: input.workerType };
  }
  return {
    error: retryParsed.error ?? firstParsed.error ?? 'JSON parse failed',
    output: retryOutput || firstOutput,
    retry_count: 1,
    worker: input.workerType
  };
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
