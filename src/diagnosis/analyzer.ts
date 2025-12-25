/**
 * Diagnosis analyzer for auto-diagnosing run stop reasons.
 *
 * Reads timeline events, state, and logs to determine why a run stopped
 * and what action to take next.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DiagnosisCategory,
  DiagnosisContext,
  DiagnosisSignal,
  NextAction,
  StopDiagnosisJson
} from './types.js';

interface DiagnosisResult {
  category: DiagnosisCategory;
  confidence: number;
  signals: DiagnosisSignal[];
  nextActions: NextAction[];
}

/**
 * Main diagnosis function.
 * Analyzes context and returns the most likely diagnosis.
 */
export function diagnoseStop(context: DiagnosisContext): StopDiagnosisJson {
  const { runId, runDir, state, events } = context;

  // Run all diagnostic rules and collect results
  const results: DiagnosisResult[] = [
    diagnoseAuthExpired(context),
    diagnoseVerificationCwdMismatch(context),
    diagnoseScopeViolation(context),
    diagnoseLockfileRestricted(context),
    diagnoseVerificationFailure(context),
    diagnoseWorkerParseFailure(context),
    diagnoseStallTimeout(context),
    diagnoseMaxTicksReached(context),
    diagnoseTimeBudgetExceeded(context),
    diagnoseGuardViolationDirty(context)
  ].filter((r) => r.confidence > 0);

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // Use highest confidence result, or unknown
  const best = results[0] ?? {
    category: 'unknown' as DiagnosisCategory,
    confidence: 0.5,
    signals: [],
    nextActions: [
      {
        title: 'Review timeline',
        command: `cat runs/${runId}/timeline.jsonl | tail -20`,
        why: 'Inspect recent events to understand what happened'
      }
    ]
  };

  // Determine outcome
  let outcome: 'stopped' | 'complete' | 'running' = 'stopped';
  if (state.stop_reason === 'complete') {
    outcome = 'complete';
  } else if (state.phase !== 'STOPPED') {
    outcome = 'running';
  }

  return {
    run_id: runId,
    outcome,
    stop_reason: state.stop_reason ?? null,
    primary_diagnosis: best.category,
    confidence: best.confidence,
    signals: best.signals,
    next_actions: best.nextActions,
    related_artifacts: {
      report: `node dist/cli.js report ${runId} --tail 120`,
      timeline: `runs/${runId}/timeline.jsonl`,
      verify_logs: findVerifyLogs(runDir),
      worker_output: findWorkerOutput(runDir)
    },
    diagnosed_at: new Date().toISOString()
  };
}

// ============================================================================
// Diagnostic Rules
// ============================================================================

/**
 * Rule 1: Auth expired / login required
 * Detect: preflight ping error contains "login", "401", "token expired", oauth keywords
 */
function diagnoseAuthExpired(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check preflight ping results
  const preflightEvent = ctx.events.find((e) => e.type === 'preflight');
  if (preflightEvent?.payload) {
    const payload = preflightEvent.payload as Record<string, unknown>;
    const ping = payload.ping as Record<string, unknown> | undefined;
    const results = ping?.results as Array<Record<string, unknown>> | undefined;

    if (results) {
      for (const result of results) {
        if (!result.ok) {
          const message = String(result.message ?? '').toLowerCase();
          const category = String(result.category ?? '');

          if (
            message.includes('login') ||
            message.includes('401') ||
            message.includes('token') ||
            message.includes('oauth') ||
            message.includes('unauthorized') ||
            category === 'auth'
          ) {
            signals.push({
              source: 'preflight.ping',
              pattern: 'auth_error',
              snippet: `${result.worker}: ${result.message}`
            });
            confidence = 0.95;
          }
        }
      }
    }
  }

  // Check for worker auth errors in events
  for (const event of ctx.events) {
    if (event.type === 'worker_error') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const error = String(payload?.error ?? '').toLowerCase();
      if (
        error.includes('login') ||
        error.includes('401') ||
        error.includes('unauthorized')
      ) {
        signals.push({
          source: 'worker_error',
          pattern: 'auth_error',
          snippet: error.slice(0, 200)
        });
        confidence = Math.max(confidence, 0.9);
      }
    }
  }

  return {
    category: 'auth_expired',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Re-authenticate workers',
              command: 'codex login && claude login',
              why: 'Worker authentication expired or invalid'
            },
            {
              title: 'Run doctor checks',
              command: 'node dist/cli.js doctor',
              why: 'Verify all workers are authenticated and reachable'
            }
          ]
        : []
  };
}

/**
 * Rule 2: Verification CWD mismatch
 * Detect: error patterns like "package.json not found", "No such file or directory"
 */
function diagnoseVerificationCwdMismatch(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check guard reasons for verification_cwd_missing
  const guardEvent = ctx.events.find(
    (e) => e.type === 'guard_violation' || e.type === 'preflight'
  );
  if (guardEvent?.payload) {
    const payload = guardEvent.payload as Record<string, unknown>;
    const guard = payload.guard as Record<string, unknown> | undefined;
    const reasons = guard?.reasons as string[] | undefined;

    if (reasons?.some((r) => r.startsWith('verification_cwd_missing'))) {
      const cwdReason = reasons.find((r) => r.startsWith('verification_cwd_missing'));
      signals.push({
        source: 'guard.reasons',
        pattern: 'verification_cwd_missing',
        snippet: cwdReason
      });
      confidence = 0.95;
    }
  }

  // Check verification events for path errors
  for (const event of ctx.events) {
    if (event.type === 'verification' || event.type === 'verify_failure') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const output = String(payload?.output ?? payload?.error ?? '');

      if (
        output.includes('ENOENT') ||
        output.includes('package.json') && output.includes('not found') ||
        output.includes('No such file or directory') ||
        output.includes('Cannot find module')
      ) {
        signals.push({
          source: event.type as string,
          pattern: 'path_error',
          snippet: output.slice(0, 200)
        });
        confidence = Math.max(confidence, 0.85);
      }
    }
  }

  // Check for implement_blocked with path issues
  if (ctx.state.stop_reason === 'implement_blocked') {
    const lastError = ctx.state.last_error ?? '';
    if (
      lastError.includes('directory') ||
      lastError.includes('path') ||
      lastError.includes('ENOENT')
    ) {
      signals.push({
        source: 'state.last_error',
        pattern: 'path_error',
        snippet: lastError.slice(0, 200)
      });
      confidence = Math.max(confidence, 0.8);
    }
  }

  return {
    category: 'verification_cwd_mismatch',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Set verification.cwd in config',
              command: 'Edit agent.config.json: "verification": { "cwd": "path/to/subdir" }',
              why: 'Verification commands running in wrong directory'
            },
            {
              title: 'Check tier command paths',
              why: 'Ensure npm/test commands match actual project structure'
            }
          ]
        : []
  };
}

/**
 * Rule 3: Scope violation
 * Detect: scope guard events / "outside allowlist"
 */
function diagnoseScopeViolation(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check guard violations
  const guardEvent = ctx.events.find((e) => e.type === 'guard_violation');
  if (guardEvent?.payload) {
    const payload = guardEvent.payload as Record<string, unknown>;
    const guard = payload.guard as Record<string, unknown> | undefined;
    const scopeViolations = guard?.scope_violations as string[] | undefined;

    if (scopeViolations && scopeViolations.length > 0) {
      signals.push({
        source: 'guard.scope_violations',
        pattern: 'files_outside_allowlist',
        snippet: scopeViolations.slice(0, 5).join(', ')
      });
      confidence = 0.95;
    }

    const reasons = guard?.reasons as string[] | undefined;
    if (reasons?.includes('scope_violation')) {
      confidence = Math.max(confidence, 0.9);
    }
  }

  // Check stop reason
  if (ctx.state.stop_reason === 'guard_violation') {
    confidence = Math.max(confidence, 0.7);
  }

  return {
    category: 'scope_violation',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Update scope.allowlist',
              command: 'Edit agent.config.json: "scope": { "allowlist": ["path/**"] }',
              why: 'Files modified are outside the allowed scope'
            },
            {
              title: 'Narrow task scope',
              why: 'Modify task description to stay within allowed directories'
            }
          ]
        : []
  };
}

/**
 * Rule 4: Lockfile restricted
 * Detect: lockfile touched event / guard failure
 */
function diagnoseLockfileRestricted(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check guard violations for lockfile
  const guardEvent = ctx.events.find((e) => e.type === 'guard_violation');
  if (guardEvent?.payload) {
    const payload = guardEvent.payload as Record<string, unknown>;
    const guard = payload.guard as Record<string, unknown> | undefined;
    const lockfileViolations = guard?.lockfile_violations as string[] | undefined;

    if (lockfileViolations && lockfileViolations.length > 0) {
      signals.push({
        source: 'guard.lockfile_violations',
        pattern: 'lockfile_modified',
        snippet: lockfileViolations.join(', ')
      });
      confidence = 0.95;
    }
  }

  return {
    category: 'lockfile_restricted',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Allow dependency changes',
              command: 'node dist/cli.js run ... --allow-deps',
              why: 'Task requires installing dependencies'
            },
            {
              title: 'Modify task to avoid deps',
              why: 'Reword task to use existing packages only'
            }
          ]
        : []
  };
}

/**
 * Rule 5: Verification failure
 * Detect: tier0/tier1 nonzero + logs show failing test/lint/typecheck
 */
function diagnoseVerificationFailure(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check for verification failure events
  for (const event of ctx.events) {
    if (event.type === 'verification') {
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload?.ok === false) {
        const tier = payload.tier as string | undefined;
        const commands = payload.commands as Array<{ command: string; ok: boolean }> | undefined;

        const failedCommands = commands?.filter((c) => !c.ok) ?? [];
        if (failedCommands.length > 0) {
          signals.push({
            source: `verification.${tier}`,
            pattern: 'command_failed',
            snippet: failedCommands.map((c) => c.command).join('; ')
          });
          confidence = Math.max(confidence, 0.85);
        }
      }
    }

    if (event.type === 'verify_failure') {
      signals.push({
        source: 'verify_failure',
        pattern: 'verification_failed',
        snippet: String((event.payload as Record<string, unknown>)?.reason ?? '')
      });
      confidence = Math.max(confidence, 0.9);
    }
  }

  // Check stop reason
  if (ctx.state.stop_reason === 'verification_failed_max_retries') {
    confidence = Math.max(confidence, 0.95);
  }

  return {
    category: 'verification_failure',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Run failing command manually',
              command: signals[0]?.snippet ? `cd <repo> && ${signals[0].snippet.split(';')[0]}` : 'npm test',
              why: 'Identify specific test/lint failure'
            },
            {
              title: 'Check verification logs',
              command: `cat runs/${ctx.runId}/artifacts/tests_tier0.log`,
              why: 'See full error output'
            }
          ]
        : []
  };
}

/**
 * Rule 6: Worker parse failure / fallback occurred
 * Detect: worker_fallback events, retry exhausted
 */
function diagnoseWorkerParseFailure(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  // Check for parse failure stop reasons
  if (
    ctx.state.stop_reason === 'plan_parse_failed' ||
    ctx.state.stop_reason === 'implement_parse_failed' ||
    ctx.state.stop_reason === 'review_parse_failed'
  ) {
    signals.push({
      source: 'state.stop_reason',
      pattern: 'parse_failed',
      snippet: ctx.state.stop_reason
    });
    confidence = 0.95;
  }

  // Check for fallback events
  for (const event of ctx.events) {
    if (event.type === 'worker_fallback') {
      const payload = event.payload as Record<string, unknown> | undefined;
      signals.push({
        source: 'worker_fallback',
        pattern: 'fallback_triggered',
        snippet: `${payload?.from} -> ${payload?.to}: ${payload?.reason}`
      });
      confidence = Math.max(confidence, 0.8);
    }
  }

  return {
    category: 'worker_parse_failure',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Retry with alternate worker',
              command: 'Resume and monitor worker output',
              why: 'Worker returned malformed response'
            },
            {
              title: 'Check worker output',
              command: `cat runs/${ctx.runId}/artifacts/last_worker_response.txt`,
              why: 'See what the worker actually returned'
            }
          ]
        : []
  };
}

/**
 * Rule 7: Stall timeout
 * Detect: stalled_timeout with worker_in_flight true/false
 */
function diagnoseStallTimeout(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  if (ctx.state.stop_reason === 'stalled_timeout') {
    confidence = 0.95;

    // Check if worker was in flight
    const stopEvent = ctx.events.find(
      (e) => e.type === 'stop' && (e.payload as Record<string, unknown>)?.reason === 'stalled_timeout'
    );
    if (stopEvent?.payload) {
      const payload = stopEvent.payload as Record<string, unknown>;
      const workerInFlight = payload.worker_in_flight as boolean | undefined;

      signals.push({
        source: 'stop.stalled_timeout',
        pattern: workerInFlight ? 'worker_in_flight' : 'no_activity',
        snippet: `worker_in_flight: ${workerInFlight}`
      });
    }
  }

  const workerInFlight = signals.some((s) => s.pattern === 'worker_in_flight');

  return {
    category: 'stall_timeout',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? workerInFlight
          ? [
              {
                title: 'Increase worker timeout',
                command: 'WORKER_TIMEOUT_MINUTES=45 node dist/cli.js resume ...',
                why: 'Worker call took longer than expected'
              },
              {
                title: 'Check worker status',
                command: 'node dist/cli.js doctor',
                why: 'Verify workers are responsive'
              }
            ]
          : [
              {
                title: 'Inspect last progress',
                command: `node dist/cli.js report ${ctx.runId} --tail 50`,
                why: 'See what happened before the stall'
              },
              {
                title: 'Resume with follow',
                command: `node dist/cli.js resume ${ctx.runId} & node dist/cli.js follow ${ctx.runId}`,
                why: 'Monitor progress in real-time'
              }
            ]
        : []
  };
}

/**
 * Rule 8: Max ticks reached
 * Detect: max_ticks_reached
 */
function diagnoseMaxTicksReached(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  if (ctx.state.stop_reason === 'max_ticks_reached') {
    confidence = 0.95;

    // Get ticks info from event
    const event = ctx.events.find((e) => e.type === 'max_ticks_reached');
    if (event?.payload) {
      const payload = event.payload as Record<string, unknown>;
      signals.push({
        source: 'max_ticks_reached',
        pattern: 'tick_limit',
        snippet: `${payload.ticks_used}/${payload.max_ticks} ticks, milestone ${(payload.milestone_index as number) + 1}/${payload.milestones_total}`
      });
    }
  }

  // Suggest ~50% more ticks
  const ticksEvent = ctx.events.find((e) => e.type === 'max_ticks_reached');
  const currentTicks = (ticksEvent?.payload as Record<string, unknown>)?.max_ticks as number ?? 50;
  const suggestedTicks = Math.ceil(currentTicks * 1.5);

  return {
    category: 'max_ticks_reached',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Resume with more ticks',
              command: `node dist/cli.js resume ${ctx.runId} --max-ticks ${suggestedTicks}`,
              why: 'Run made progress but hit tick limit'
            },
            {
              title: 'Check for oscillation',
              command: `cat runs/${ctx.runId}/timeline.jsonl | grep phase_start`,
              why: 'Look for repeated phase transitions'
            }
          ]
        : []
  };
}

/**
 * Rule 9: Time budget exceeded
 */
function diagnoseTimeBudgetExceeded(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  if (ctx.state.stop_reason === 'time_budget_exceeded') {
    confidence = 0.95;

    const event = ctx.events.find(
      (e) => e.type === 'stop' && (e.payload as Record<string, unknown>)?.reason === 'time_budget_exceeded'
    );
    if (event?.payload) {
      const payload = event.payload as Record<string, unknown>;
      signals.push({
        source: 'stop.time_budget_exceeded',
        pattern: 'time_limit',
        snippet: `ticks_used: ${payload.ticks_used}`
      });
    }
  }

  return {
    category: 'time_budget_exceeded',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Resume with more time',
              command: `node dist/cli.js resume ${ctx.runId} --time 90`,
              why: 'Run made progress but hit time limit'
            }
          ]
        : []
  };
}

/**
 * Rule 10: Guard violation (dirty worktree)
 */
function diagnoseGuardViolationDirty(ctx: DiagnosisContext): DiagnosisResult {
  const signals: DiagnosisSignal[] = [];
  let confidence = 0;

  const guardEvent = ctx.events.find((e) => e.type === 'guard_violation');
  if (guardEvent?.payload) {
    const payload = guardEvent.payload as Record<string, unknown>;
    const guard = payload.guard as Record<string, unknown> | undefined;

    if (guard?.dirty === true) {
      const reasons = guard.reasons as string[] | undefined;
      if (reasons?.includes('dirty_worktree')) {
        signals.push({
          source: 'guard.reasons',
          pattern: 'dirty_worktree',
          snippet: 'Uncommitted changes in working directory'
        });
        confidence = 0.95;
      }
    }
  }

  return {
    category: 'guard_violation_dirty',
    confidence,
    signals,
    nextActions:
      confidence > 0
        ? [
            {
              title: 'Use worktree mode',
              command: 'node dist/cli.js run ... --worktree',
              why: 'Isolates agent work from your changes'
            },
            {
              title: 'Commit or stash changes',
              command: 'git stash -u && node dist/cli.js run ...',
              why: 'Clean worktree required for non-worktree mode'
            }
          ]
        : []
  };
}

// ============================================================================
// Helpers
// ============================================================================

function findVerifyLogs(runDir: string): string | undefined {
  const artifactsDir = path.join(runDir, 'artifacts');
  if (!fs.existsSync(artifactsDir)) return undefined;

  const candidates = ['tests_tier0.log', 'tests_tier1.log', 'verify.log'];
  for (const name of candidates) {
    const p = path.join(artifactsDir, name);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

function findWorkerOutput(runDir: string): string | undefined {
  const artifactsDir = path.join(runDir, 'artifacts');
  if (!fs.existsSync(artifactsDir)) return undefined;

  const candidates = ['last_worker_response.txt', 'worker_output.log'];
  for (const name of candidates) {
    const p = path.join(artifactsDir, name);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}
