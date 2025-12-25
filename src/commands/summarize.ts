import { RunStore } from '../store/run-store.js';
import { resolveRunId } from '../store/run-utils.js';
import { computeKpiFromEvents } from './report.js';
import { RunState } from '../types/schemas.js';
import { diagnoseStop, formatStopMarkdown, DiagnosisContext, StopDiagnosisJson } from '../diagnosis/index.js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * Machine-readable JSON summary of a run.
 * Designed for programmatic consumption (CI pipelines, dashboards, batch analysis).
 */
export interface SummaryJson {
  /** Run identifier (timestamp format: YYYYMMDDHHmmss) */
  run_id: string;

  /** Final outcome of the run */
  outcome: 'complete' | 'stopped' | 'running' | 'unknown';

  /** Reason for stopping (if stopped), null otherwise */
  stop_reason: string | null;

  /** Total duration in seconds (null if unknown) */
  duration_seconds: number | null;

  /** Milestone statistics */
  milestones: {
    /** Number of milestones completed */
    completed: number;
    /** Total milestones in plan (if known) */
    total: number | null;
  };

  /** Worker invocation counts */
  worker_calls: {
    claude: number | 'unknown';
    codex: number | 'unknown';
  };

  /** Verification statistics */
  verification: {
    /** Total verification attempts */
    attempts: number;
    /** Number of retries triggered */
    retries: number;
    /** Total time spent verifying (seconds) */
    duration_seconds: number;
  };

  /** Reliability metrics */
  reliability: {
    /** Infrastructure retry count */
    infra_retries: number;
    /** Whether fallback worker was used */
    fallback_used: boolean;
    /** Number of fallback invocations */
    fallback_count: number;
    /** Stall timeout triggers */
    stalls_triggered: number;
    /** Late results that were discarded */
    late_results_ignored: number;
    /** Whether run stopped due to max ticks (not a failure, just budget) */
    max_ticks_hit: boolean;
    /** Total ticks used in this run (including across resumes) */
    ticks_used: number;
  };

  /** Configuration snapshot */
  config: {
    /** Dry run mode */
    dry_run: boolean | null;
    /** Branch creation disabled */
    no_branch: boolean | null;
    /** Dirty worktree allowed */
    allow_dirty: boolean | null;
    /** Dependency changes allowed */
    allow_deps: boolean | null;
    /** Whether worktree isolation is enabled */
    worktree_enabled: boolean;
    /** Time budget in minutes */
    time_budget_minutes: number | null;
    /** Maximum tick count limit */
    max_ticks: number | null;
  };

  /** Timestamps */
  timestamps: {
    /** ISO timestamp when run started */
    started_at: string | null;
    /** ISO timestamp when run ended */
    ended_at: string | null;
  };

  /** Diagnosis (for stopped runs) */
  diagnosis?: {
    /** Primary diagnosis category */
    primary: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** First recommended action */
    next_action?: string;
  };
}

export interface SummarizeOptions {
  /** Run ID to summarize */
  runId: string;
}

/**
 * Generate a machine-readable JSON summary of a run.
 * Outputs compact JSON to stdout for piping/parsing.
 * Supports 'latest' as runId to resolve to most recent run.
 */
export async function summarizeCommand(options: SummarizeOptions): Promise<void> {
  // Resolve 'latest' to actual run ID and validate existence
  const resolvedRunId = resolveRunId(options.runId);
  const runDir = path.resolve('runs', resolvedRunId);

  const runStore = RunStore.init(resolvedRunId);
  const state = runStore.readState();

  // Read timeline events for KPI computation
  const timelinePath = path.join(runDir, 'timeline.jsonl');
  const events = await readTimelineEvents(timelinePath);
  const kpi = computeKpiFromEvents(events);

  // Read config.snapshot.json for worktree_enabled and other config
  const configSnapshot = readConfigSnapshot(runDir);

  // Extract config flags from run_started event
  const runStartedEvent = events.find((e) => e.type === 'run_started');
  const configPayload = extractConfigPayload(runStartedEvent, configSnapshot);

  // Get total milestones from state if available
  const totalMilestones = state.milestones?.length ?? null;

  // Extract ticks info from timeline events (sum across all sessions including resumes)
  const ticksInfo = extractTicksInfo(events, state);

  // Generate diagnosis for stopped runs (not for successful completions)
  let diagnosisResult: StopDiagnosisJson | undefined;
  const isFailedStop = state.phase === 'STOPPED' && state.stop_reason !== 'complete';
  if (isFailedStop) {
    const diagnosisContext: DiagnosisContext = {
      runId: resolvedRunId,
      runDir,
      state: {
        phase: state.phase,
        stop_reason: state.stop_reason,
        milestone_index: state.milestone_index,
        milestones_total: state.milestones?.length ?? 0,
        last_error: state.last_error
      },
      events,
      configSnapshot: configSnapshot as unknown as Record<string, unknown>
    };

    diagnosisResult = diagnoseStop(diagnosisContext);

    // Write diagnosis artifacts to handoffs directory
    const handoffsDir = path.join(runDir, 'handoffs');
    if (!fs.existsSync(handoffsDir)) {
      fs.mkdirSync(handoffsDir, { recursive: true });
    }

    // Write stop.json
    const stopJsonPath = path.join(handoffsDir, 'stop.json');
    fs.writeFileSync(stopJsonPath, JSON.stringify(diagnosisResult, null, 2) + '\n', 'utf-8');

    // Write stop.md
    const stopMdPath = path.join(handoffsDir, 'stop.md');
    const stopMd = formatStopMarkdown(diagnosisResult);
    fs.writeFileSync(stopMdPath, stopMd + '\n', 'utf-8');
  }

  const summary: SummaryJson = {
    run_id: resolvedRunId,
    outcome: kpi.outcome,
    stop_reason: kpi.stop_reason,
    duration_seconds: msToSeconds(kpi.total_duration_ms),
    milestones: {
      completed: kpi.milestones.completed,
      total: totalMilestones
    },
    worker_calls: {
      claude: kpi.workers.claude,
      codex: kpi.workers.codex
    },
    verification: {
      attempts: kpi.verify.attempts,
      retries: kpi.verify.retries,
      duration_seconds: msToSeconds(kpi.verify.total_duration_ms) ?? 0
    },
    reliability: {
      infra_retries: kpi.reliability.infra_retries,
      fallback_used: kpi.reliability.fallback_used,
      fallback_count: kpi.reliability.fallback_count,
      stalls_triggered: kpi.reliability.stalls_triggered,
      late_results_ignored: kpi.reliability.late_results_ignored,
      max_ticks_hit: ticksInfo.max_ticks_hit,
      ticks_used: ticksInfo.ticks_used
    },
    config: configPayload,
    timestamps: {
      started_at: kpi.started_at,
      ended_at: kpi.ended_at
    },
    diagnosis: diagnosisResult
      ? {
          primary: diagnosisResult.primary_diagnosis,
          confidence: diagnosisResult.confidence,
          next_action: diagnosisResult.next_actions[0]?.command
        }
      : undefined
  };

  // Write summary.json to run directory (idempotent - overwrites if exists)
  const summaryPath = path.join(runDir, 'summary.json');
  const formattedJson = JSON.stringify(summary, null, 2);
  fs.writeFileSync(summaryPath, formattedJson + '\n', 'utf-8');

  console.log(`Summary written to ${summaryPath}`);

  // Log diagnosis info if available
  if (diagnosisResult) {
    const handoffsDir = path.join(runDir, 'handoffs');
    console.log(`Diagnosis written to ${path.join(handoffsDir, 'stop.json')} and stop.md`);
    console.log(`  Primary: ${diagnosisResult.primary_diagnosis} (${Math.round(diagnosisResult.confidence * 100)}%)`);
    if (diagnosisResult.next_actions[0]) {
      console.log(`  Next: ${diagnosisResult.next_actions[0].title}`);
    }
  }
}

async function readTimelineEvents(timelinePath: string): Promise<Array<Record<string, unknown>>> {
  if (!fs.existsSync(timelinePath)) {
    return [];
  }

  const events: Array<Record<string, unknown>> = [];
  const stream = fs.createReadStream(timelinePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

interface ConfigSnapshotData {
  worktree_enabled: boolean;
}

function readConfigSnapshot(runDir: string): ConfigSnapshotData {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');

  // Handle missing config.snapshot.json gracefully with defaults
  if (!fs.existsSync(snapshotPath)) {
    return {
      worktree_enabled: false
    };
  }

  try {
    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // worktree_enabled is determined by presence of _worktree field
    const worktreeEnabled = parsed._worktree !== undefined && parsed._worktree !== null;

    return {
      worktree_enabled: worktreeEnabled
    };
  } catch {
    // Handle parse errors gracefully with defaults
    return {
      worktree_enabled: false
    };
  }
}

function extractConfigPayload(
  runStartedEvent?: Record<string, unknown>,
  configSnapshot?: ConfigSnapshotData
): SummaryJson['config'] {
  const defaults: SummaryJson['config'] = {
    dry_run: null,
    no_branch: null,
    allow_dirty: null,
    allow_deps: null,
    worktree_enabled: configSnapshot?.worktree_enabled ?? false,
    time_budget_minutes: null,
    max_ticks: null
  };

  if (!runStartedEvent?.payload || typeof runStartedEvent.payload !== 'object') {
    return defaults;
  }

  const payload = runStartedEvent.payload as Record<string, unknown>;
  return {
    dry_run: (payload.dry_run as boolean) ?? null,
    no_branch: (payload.no_branch as boolean) ?? null,
    allow_dirty: (payload.allow_dirty as boolean) ?? null,
    allow_deps: (payload.allow_deps as boolean) ?? null,
    worktree_enabled: configSnapshot?.worktree_enabled ?? false,
    time_budget_minutes: (payload.time_budget_minutes as number) ?? null,
    max_ticks: (payload.max_ticks as number) ?? null
  };
}

function msToSeconds(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.round(ms / 1000);
}

interface TicksInfo {
  max_ticks_hit: boolean;
  ticks_used: number;
}

/**
 * Extract ticks info from timeline events and state.
 * Sums ticks_used across all sessions (including resumes).
 */
function extractTicksInfo(
  events: Array<Record<string, unknown>>,
  state: RunState
): TicksInfo {
  // Check if stop_reason indicates max_ticks_reached
  const stopReason = state.stop_reason;
  const maxTicksHit = stopReason === 'max_ticks_reached';

  // Sum ticks_used from max_ticks_reached events and stop events with ticks_used
  let totalTicks = 0;
  for (const event of events) {
    if (event.type === 'max_ticks_reached' || event.type === 'stop') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const ticksUsed = payload?.ticks_used as number | undefined;
      if (typeof ticksUsed === 'number') {
        totalTicks += ticksUsed;
      }
    }
  }

  // If no ticks_used found in events, estimate from phase_start count
  if (totalTicks === 0) {
    totalTicks = events.filter((e) => e.type === 'phase_start').length;
  }

  return {
    max_ticks_hit: maxTicksHit,
    ticks_used: totalTicks
  };
}
