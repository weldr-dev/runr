import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AgentConfig, WorkerConfig } from '../config/schema.js';
import { git } from '../repo/git.js';
import { listChangedFiles } from '../repo/context.js';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { buildImplementPrompt, buildPlanPrompt, buildReviewPrompt } from '../workers/prompts.js';
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

const MAX_MILESTONE_RETRIES = 3;

export interface SupervisorOptions {
  runStore: RunStore;
  repoPath: string;
  taskText: string;
  config: AgentConfig;
  timeBudgetMinutes: number;
  maxTicks: number;
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

async function handlePlan(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'PLAN' }
  });

  const prompt = buildPlanPrompt(options.taskText);
  const parsed = await callClaudeJson({
    prompt,
    repoPath: options.repoPath,
    worker: options.config.workers.claude,
    schema: planOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: 'claude',
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
  const updated: RunState = {
    ...state,
    milestones: plan.milestones
  };

  options.runStore.writePlan(JSON.stringify(plan, null, 2));
  options.runStore.appendEvent({
    type: 'plan_generated',
    source: 'claude',
    payload: plan
  });

  return updatePhase(updated, 'IMPLEMENT');
}

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

  const prompt = buildImplementPrompt({
    milestone,
    scopeAllowlist: state.scope_lock.allowlist,
    scopeDenylist: state.scope_lock.denylist,
    allowDeps: options.allowDeps,
    fixInstructions: state.last_verify_failure
      ? {
          failedCommand: state.last_verify_failure.failedCommand,
          errorOutput: state.last_verify_failure.errorOutput,
          changedFiles: state.last_verify_failure.changedFiles,
          attemptNumber: state.milestone_retries + 1
        }
      : undefined
  });

  const parsed = await callCodexJson({
    prompt,
    repoPath: options.repoPath,
    worker: options.config.workers.codex,
    schema: implementerOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: 'codex',
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
    source: 'codex',
    payload: {
      changed_files: changedFiles,
      handoff_memo: implementer.handoff_memo
    }
  });

  return updatePhase(state, 'VERIFY');
}

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
  const diffSummary = await git(['diff', '--stat'], options.repoPath);
  // Also get untracked files for greenfield scenarios
  const statusResult = await git(['status', '--porcelain'], options.repoPath);
  const untrackedFiles = statusResult.stdout
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter((f) => f.length > 0);
  const untrackedInfo =
    untrackedFiles.length > 0 ? `Untracked new files: ${untrackedFiles.join(', ')}` : '';

  const verifyLogPath = path.join(options.runStore.path, 'artifacts', 'tests_tier0.log');
  const verificationOutput = fs.existsSync(verifyLogPath)
    ? fs.readFileSync(verifyLogPath, 'utf-8')
    : '';

  const combinedDiff = [diffSummary.stdout.trim(), untrackedInfo].filter(Boolean).join('\n');
  const prompt = buildReviewPrompt({
    milestone,
    diffSummary: combinedDiff,
    verificationOutput
  });

  const parsed = await callClaudeJson({
    prompt,
    repoPath: options.repoPath,
    worker: options.config.workers.claude,
    schema: reviewOutputSchema
  });
  if (!parsed.data) {
    options.runStore.appendEvent({
      type: 'parse_failed',
      source: 'claude',
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
    source: 'claude',
    payload: review
  });

  if (review.status === 'request_changes' || review.status === 'reject') {
    options.runStore.writeMemo(
      `milestone_${String(state.milestone_index + 1).padStart(2, '0')}_review.md`,
      review.changes.join('\n')
    );
    return updatePhase(state, 'IMPLEMENT');
  }

  return updatePhase(state, 'CHECKPOINT');
}

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

async function handleFinalize(state: RunState, options: SupervisorOptions): Promise<RunState> {
  options.runStore.appendEvent({
    type: 'phase_start',
    source: 'supervisor',
    payload: { phase: 'FINALIZE' }
  });

  const summary = ['# Summary', '', 'Run completed.'].join('\n');
  options.runStore.writeSummary(summary);
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

async function callClaudeJson<S extends z.ZodTypeAny>(input: {
  prompt: string;
  repoPath: string;
  worker: WorkerConfig;
  schema: S;
}): Promise<{ data?: z.infer<S>; error?: string; output?: string; retry_count?: number }> {
  const first = await runClaude({
    prompt: input.prompt,
    repo_path: input.repoPath,
    worker: input.worker
  });
  const firstOutput = first.observations.join('\n');
  const firstParsed = parseJsonWithSchema(firstOutput, input.schema);
  if (firstParsed.data) {
    return { data: firstParsed.data, output: firstOutput, retry_count: 0 };
  }

  const retryPrompt = `${input.prompt}\n\nOutput JSON only between BEGIN_JSON and END_JSON. No other text.`;
  const retry = await runClaude({
    prompt: retryPrompt,
    repo_path: input.repoPath,
    worker: input.worker
  });
  const retryOutput = retry.observations.join('\n');
  const retryParsed = parseJsonWithSchema(retryOutput, input.schema);
  if (retryParsed.data) {
    return { data: retryParsed.data, output: retryOutput, retry_count: 1 };
  }
  return {
    error: retryParsed.error ?? firstParsed.error ?? 'JSON parse failed',
    output: retryOutput || firstOutput,
    retry_count: 1
  };
}

async function callCodexJson<S extends z.ZodTypeAny>(input: {
  prompt: string;
  repoPath: string;
  worker: WorkerConfig;
  schema: S;
}): Promise<{ data?: z.infer<S>; error?: string; output?: string; retry_count?: number }> {
  const first = await runCodex({
    prompt: input.prompt,
    repo_path: input.repoPath,
    worker: input.worker
  });
  const firstOutput = first.observations.join('\n');
  const firstParsed = parseJsonWithSchema(firstOutput, input.schema);
  if (firstParsed.data) {
    return { data: firstParsed.data, output: firstOutput, retry_count: 0 };
  }

  const retryPrompt = `${input.prompt}\n\nOutput JSON only between BEGIN_JSON and END_JSON. No other text.`;
  const retry = await runCodex({
    prompt: retryPrompt,
    repo_path: input.repoPath,
    worker: input.worker
  });
  const retryOutput = retry.observations.join('\n');
  const retryParsed = parseJsonWithSchema(retryOutput, input.schema);
  if (retryParsed.data) {
    return { data: retryParsed.data, output: retryOutput, retry_count: 1 };
  }
  return {
    error: retryParsed.error ?? firstParsed.error ?? 'JSON parse failed',
    output: retryOutput || firstOutput,
    retry_count: 1
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
