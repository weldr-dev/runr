import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { RunState } from '../types/schemas.js';
import { readContextPackArtifact, formatContextPackStatus } from '../context/index.js';
import { findLatestRunId } from '../store/run-utils.js';
import { getRunsRoot } from '../store/runs-root.js';

// Re-export for backward compatibility with cli.ts
export { findLatestRunId };

export interface ReportOptions {
  runId: string;
  tail: number;
  kpiOnly?: boolean;
  json?: boolean;
  repo: string;
}

// KPI types - exported for testing (Phase 1: no boot chain touches)
export interface PhaseKpi {
  duration_ms: number;
  count: number;
}

export interface DerivedKpi {
  version: 1;
  run_id: string;
  phase: string | null;
  checkpoint_sha: string | null;
  total_duration_ms: number | null;
  unattributed_ms: number | null;
  started_at: string | null;
  ended_at: string | null;
  phases: Record<string, PhaseKpi>;
  workers: {
    claude: number | 'unknown';
    codex: number | 'unknown';
  };
  verify: {
    attempts: number;
    retries: number;
    total_duration_ms: number;
  };
  milestones: {
    completed: number;
    total: number;
  };
  // Reliability metrics (Sprint 2)
  reliability: {
    infra_retries: number;
    fallback_used: boolean;
    fallback_count: number;
    stalls_triggered: number;
    late_results_ignored: number;
  };
  outcome: 'complete' | 'stopped' | 'running' | 'unknown';
  stop_reason: string | null;
  next_action: 'none' | 'resume' | 'fix_config' | 'resolve_scope_violation' | 'resolve_branch_mismatch' | 'inspect_logs';
  suggested_command: string | null;
}

interface TimelineScanResult {
  runStarted?: Record<string, unknown>;
  tailEvents: Array<Record<string, unknown>>;
  kpi: DerivedKpi;
}

export async function reportCommand(options: ReportOptions): Promise<void> {
  const runDir = path.join(getRunsRoot(options.repo), options.runId);
  if (!fs.existsSync(runDir)) {
    throw new Error(`${missingRunMessage(runDir)}`);
  }

  const statePath = path.join(runDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`State not found: ${statePath}`);
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as RunState;

  const timelinePath = path.join(runDir, 'timeline.jsonl');
  const defaultKpi: DerivedKpi = {
    version: 1,
    run_id: options.runId,
    phase: state.phase || null,
    checkpoint_sha: state.checkpoint_commit_sha || null,
    total_duration_ms: null,
    unattributed_ms: null,
    started_at: null,
    ended_at: null,
    phases: {},
    workers: { claude: 'unknown', codex: 'unknown' },
    verify: { attempts: 0, retries: 0, total_duration_ms: 0 },
    milestones: { completed: 0, total: state.milestones?.length || 0 },
    reliability: {
      infra_retries: 0,
      fallback_used: false,
      fallback_count: 0,
      stalls_triggered: 0,
      late_results_ignored: 0
    },
    outcome: 'unknown',
    stop_reason: null,
    next_action: 'inspect_logs',
    suggested_command: null
  };
  const scan = fs.existsSync(timelinePath)
    ? await scanTimeline(timelinePath, options.tail)
    : { tailEvents: [], kpi: defaultKpi };

  // Merge run-specific fields into KPI (these aren't in timeline events)
  scan.kpi.run_id = options.runId;
  scan.kpi.phase = state.phase || null;
  scan.kpi.checkpoint_sha = state.checkpoint_commit_sha || null;
  scan.kpi.milestones.total = state.milestones?.length || 0;

  const flags = readFlags(scan.runStarted);
  const contextPackArtifact = readContextPackArtifact(runDir);
  const header = [
    'Run',
    `run_id: ${options.runId}`,
    `repo: ${state.repo_path}`,
    `run_dir: ${runDir}`,
    `current_phase: ${state.phase}`,
    `milestone_index: ${state.milestone_index}`,
    `phase_attempt: ${state.phase_attempt ?? 0}`,
    `last_error: ${state.last_error ?? 'none'}`,
    `dry_run: ${flags.dry_run ?? 'unknown'}`,
    `no_branch: ${flags.no_branch ?? 'unknown'}`,
    `allow_dirty: ${flags.allow_dirty ?? 'unknown'}`,
    `allow_deps: ${flags.allow_deps ?? 'unknown'}`
  ].join('\n');

  const kpiBlock = formatKpiBlock(scan.kpi, contextPackArtifact);

  if (options.json) {
    // JSON output: full KPI object with next_action and suggested_command
    console.log(JSON.stringify(scan.kpi, null, 2));
    return;
  }

  if (options.kpiOnly) {
    // Compact output: just run_id and KPIs
    console.log(`${options.runId}: ${scan.kpi.outcome} ${formatDuration(scan.kpi.total_duration_ms)} milestones=${scan.kpi.milestones.completed}`);
    return;
  }

  const events = formatEvents(scan.tailEvents);
  const pointers = formatPointers({
    statePath,
    timelinePath,
    runDir,
    checkpoint: state.checkpoint_commit_sha
  });

  console.log([header, '', 'KPIs', kpiBlock, '', 'Last events', events, '', 'Pointers', pointers].join('\n'));
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'unknown';
  if (ms < 0) return `-${formatPositiveDuration(Math.abs(ms))}`;
  return formatPositiveDuration(ms);
}

function formatPositiveDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
}

function missingRunMessage(runDir: string): string {
  const runsRoot = path.dirname(runDir);
  if (!fs.existsSync(runsRoot)) {
    return `Run not found: ${runDir}. Known runs: none.`;
  }
  const candidates = fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, 5);
  const hint = candidates.length ? candidates.join(', ') : 'none';
  return `Run not found: ${runDir}. Known runs: ${hint}.`;
}

function readFlags(runStarted?: Record<string, unknown>): {
  dry_run?: boolean;
  no_branch?: boolean;
  allow_dirty?: boolean;
  allow_deps?: boolean;
} {
  if (!runStarted?.payload || typeof runStarted.payload !== 'object') {
    return {};
  }
  const payload = runStarted.payload as Record<string, unknown>;
  return {
    dry_run: payload.dry_run as boolean | undefined,
    no_branch: payload.no_branch as boolean | undefined,
    allow_dirty: payload.allow_dirty as boolean | undefined,
    allow_deps: payload.allow_deps as boolean | undefined
  };
}

function formatKpiBlock(
  kpi: DerivedKpi,
  contextPackArtifact?: ReturnType<typeof readContextPackArtifact>
): string {
  const lines: string[] = [];

  // Total duration + unattributed
  const durationStr =
    kpi.total_duration_ms !== null ? formatDuration(kpi.total_duration_ms) : 'unknown';
  let unattributedStr: string;
  if (kpi.unattributed_ms === null) {
    unattributedStr = 'unknown';
  } else if (kpi.unattributed_ms < 0) {
    // Negative = phases exceed tracked time (e.g., resumed runs with gaps)
    unattributedStr = `-${formatPositiveDuration(Math.abs(kpi.unattributed_ms))} (resume/gap)`;
  } else {
    unattributedStr = formatPositiveDuration(kpi.unattributed_ms);
  }
  lines.push(`total_duration: ${durationStr} (unattributed: ${unattributedStr})`);

  // Outcome
  const outcomeStr = kpi.stop_reason
    ? `${kpi.outcome} (${kpi.stop_reason})`
    : kpi.outcome;
  lines.push(`outcome: ${outcomeStr}`);

  // Milestones
  lines.push(`milestones_completed: ${kpi.milestones.completed}`);

  // Worker calls
  const claudeCalls = kpi.workers.claude;
  const codexCalls = kpi.workers.codex;
  lines.push(`worker_calls: claude=${claudeCalls} codex=${codexCalls}`);

  // Phase durations (sorted by typical order: plan, implement, review, verify)
  const phaseOrder = ['plan', 'implement', 'review', 'verify'];
  const phaseEntries = Object.entries(kpi.phases);
  if (phaseEntries.length > 0) {
    const sortedPhases = phaseEntries.sort(([a], [b]) => {
      const aIdx = phaseOrder.indexOf(a);
      const bIdx = phaseOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
    const phaseParts = sortedPhases.map(
      ([phase, data]) => `${phase}=${formatDuration(data.duration_ms)}(x${data.count})`
    );
    lines.push(`phases: ${phaseParts.join(' ')}`);
  } else {
    lines.push('phases: (no phase data)');
  }

  // Verification stats
  if (kpi.verify.attempts > 0) {
    const verifyDur = formatDuration(kpi.verify.total_duration_ms);
    lines.push(
      `verify: attempts=${kpi.verify.attempts} retries=${kpi.verify.retries} duration=${verifyDur}`
    );
  } else {
    lines.push('verify: (no verification data)');
  }

  // Reliability metrics
  const rel = kpi.reliability;
  const relParts: string[] = [];
  if (rel.infra_retries > 0) relParts.push(`retries=${rel.infra_retries}`);
  if (rel.fallback_used) relParts.push(`fallback=${rel.fallback_count}`);
  if (rel.stalls_triggered > 0) relParts.push(`stalls=${rel.stalls_triggered}`);
  if (rel.late_results_ignored > 0) relParts.push(`late_ignored=${rel.late_results_ignored}`);
  lines.push(`reliability: ${relParts.length ? relParts.join(' ') : 'clean'}`);

  // Context pack status
  lines.push(formatContextPackStatus(contextPackArtifact ?? null));

  return lines.join('\n');
}

// Exported for testing - computes KPIs from an array of timeline events
export function computeKpiFromEvents(events: Array<Record<string, unknown>>): DerivedKpi {
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  const phases: Record<string, PhaseKpi> = {};
  let currentPhase: string | null = null;
  let currentPhaseStart: number | null = null;
  let workersClaude: number | 'unknown' = 'unknown';
  let workersCodex: number | 'unknown' = 'unknown';
  let verifyAttempts = 0;
  let verifyRetries = 0;
  let verifyDurationMs = 0;
  let milestonesCompleted = 0;
  let outcome: DerivedKpi['outcome'] = 'unknown';
  let stopReason: string | null = null;

  // Reliability metrics
  let infraRetries = 0;
  let fallbackCount = 0;
  let stallsTriggered = 0;
  let lateResultsIgnored = 0;

  for (const event of events) {
    const eventType = event.type as string | undefined;
    const timestamp = event.timestamp as string | undefined;
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : {};

    // Track run_started
    if (eventType === 'run_started' && startedAt === null) {
      startedAt = timestamp ?? null;
      outcome = 'running';
    }

    // Track phase_start events for phase durations
    if (eventType === 'phase_start' && payload.phase) {
      // Close previous phase if any
      if (currentPhase && currentPhaseStart !== null && timestamp) {
        const phaseEnd = new Date(timestamp).getTime();
        const phaseDuration = phaseEnd - currentPhaseStart;
        if (!phases[currentPhase]) {
          phases[currentPhase] = { duration_ms: 0, count: 0 };
        }
        phases[currentPhase].duration_ms += phaseDuration;
      }
      // Start new phase
      currentPhase = payload.phase as string;
      currentPhaseStart = timestamp ? new Date(timestamp).getTime() : null;
      if (!phases[currentPhase]) {
        phases[currentPhase] = { duration_ms: 0, count: 0 };
      }
      phases[currentPhase].count += 1;
    }

    // Track worker_stats event (emitted at finalize)
    if (eventType === 'worker_stats' && payload.stats) {
      const stats = payload.stats as Record<string, unknown>;
      if (typeof stats.claude === 'number') {
        workersClaude = stats.claude;
      }
      if (typeof stats.codex === 'number') {
        workersCodex = stats.codex;
      }
    }

    // Track verification events
    if (eventType === 'verification') {
      verifyAttempts += 1;
      if (payload.duration_ms && typeof payload.duration_ms === 'number') {
        verifyDurationMs += payload.duration_ms;
      }
    }

    // Track verify retries (retry_count in verification payload)
    if (eventType === 'verification' && typeof payload.retry === 'number') {
      verifyRetries += payload.retry;
    }

    // Track milestone completion
    if (eventType === 'milestone_complete') {
      milestonesCompleted += 1;
    }

    // Track stop event
    if (eventType === 'stop') {
      endedAt = timestamp ?? null;
      outcome = 'stopped';
      stopReason = (payload.reason as string) ?? null;
      // Close current phase
      if (currentPhase && currentPhaseStart !== null && timestamp) {
        const phaseEnd = new Date(timestamp).getTime();
        const phaseDuration = phaseEnd - currentPhaseStart;
        if (!phases[currentPhase]) {
          phases[currentPhase] = { duration_ms: 0, count: 0 };
        }
        phases[currentPhase].duration_ms += phaseDuration;
      }
    }

    // Track run_complete event
    if (eventType === 'run_complete') {
      endedAt = timestamp ?? null;
      outcome = 'complete';
      // Close current phase
      if (currentPhase && currentPhaseStart !== null && timestamp) {
        const phaseEnd = new Date(timestamp).getTime();
        const phaseDuration = phaseEnd - currentPhaseStart;
        if (!phases[currentPhase]) {
          phases[currentPhase] = { duration_ms: 0, count: 0 };
        }
        phases[currentPhase].duration_ms += phaseDuration;
      }
    }

    // Track reliability metrics
    if (eventType === 'parse_failed') {
      const retryCount = (payload.retry_count as number) ?? 0;
      infraRetries += retryCount;
    }

    if (eventType === 'worker_fallback') {
      fallbackCount += 1;
    }

    if (eventType === 'stop' && payload.reason === 'stalled_timeout') {
      stallsTriggered += 1;
    }

    if (eventType === 'late_worker_result_ignored') {
      lateResultsIgnored += 1;
    }
  }

  // Compute total duration
  let totalDurationMs: number | null = null;
  if (startedAt && endedAt) {
    totalDurationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  }

  // Compute unattributed time (total - sum of phase durations)
  let unattributedMs: number | null = null;
  if (totalDurationMs !== null) {
    const attributedMs = Object.values(phases).reduce((sum, p) => sum + p.duration_ms, 0);
    unattributedMs = totalDurationMs - attributedMs;
  }

  // Compute next_action and suggested_command
  let nextAction: DerivedKpi['next_action'] = 'inspect_logs';
  let suggestedCommand: string | null = null;

  if (outcome === 'complete') {
    nextAction = 'none';
  } else if (outcome === 'stopped' && stopReason) {
    const resumableReasons = ['verification_failed_max_retries', 'stalled_timeout', 'max_ticks_reached', 'time_budget_exceeded', 'implement_blocked'];
    const scopeViolationReasons = ['guard_violation', 'plan_scope_violation', 'ownership_violation'];
    const configIssueReasons = ['plan_parse_failed', 'implement_parse_failed', 'review_parse_failed'];

    if (resumableReasons.includes(stopReason)) {
      nextAction = 'resume';
      suggestedCommand = `runr resume <run_id>`;
    } else if (scopeViolationReasons.includes(stopReason)) {
      nextAction = 'resolve_scope_violation';
      suggestedCommand = `# Review .runr/runr.config.json scope settings`;
    } else if (stopReason === 'parallel_file_collision') {
      nextAction = 'resolve_branch_mismatch';
      suggestedCommand = `# Wait for conflicting run to finish, then resume`;
    } else if (configIssueReasons.includes(stopReason)) {
      nextAction = 'fix_config';
      suggestedCommand = `runr init --interactive`;
    }
  } else if (outcome === 'running') {
    suggestedCommand = `runr status <run_id>`;
  }

  return {
    version: 1,
    run_id: '', // Will be filled by reportCommand
    phase: null, // Will be filled by reportCommand
    checkpoint_sha: null, // Will be filled by reportCommand
    total_duration_ms: totalDurationMs,
    unattributed_ms: unattributedMs,
    started_at: startedAt,
    ended_at: endedAt,
    phases,
    workers: {
      claude: workersClaude,
      codex: workersCodex
    },
    verify: {
      attempts: verifyAttempts,
      retries: verifyRetries,
      total_duration_ms: verifyDurationMs
    },
    milestones: {
      completed: milestonesCompleted,
      total: 0 // Will be filled by reportCommand
    },
    reliability: {
      infra_retries: infraRetries,
      fallback_used: fallbackCount > 0,
      fallback_count: fallbackCount,
      stalls_triggered: stallsTriggered,
      late_results_ignored: lateResultsIgnored
    },
    outcome,
    stop_reason: stopReason,
    next_action: nextAction,
    suggested_command: suggestedCommand
  };
}

async function scanTimeline(
  timelinePath: string,
  tailCount: number
): Promise<TimelineScanResult> {
  const allEvents: Array<Record<string, unknown>> = [];
  const tailEvents: Array<Record<string, unknown>> = [];
  let runStarted: Record<string, unknown> | undefined;

  const stream = fs.createReadStream(timelinePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      allEvents.push(event);

      if (!runStarted && event.type === 'run_started') {
        runStarted = event;
      }

      tailEvents.push(event);
      if (tailEvents.length > tailCount) {
        tailEvents.shift();
      }
    } catch {
      continue;
    }
  }

  const kpi = computeKpiFromEvents(allEvents);
  return { runStarted, tailEvents, kpi };
}

function formatEvents(events: Array<Record<string, unknown>>): string {
  if (events.length === 0) {
    return '(no events)';
  }
  const lines = events.map((event) => {
    const seq = event.seq ?? '?';
    const ts = event.timestamp ?? '?';
    const type = event.type ?? 'unknown';
    const source = event.source ?? 'unknown';
    const summary = summarizeEvent(event);
    return `${seq} ${ts} ${type} ${source} ${summary}`.trim();
  });
  return lines.join('\n');
}

function summarizeEvent(event: Record<string, unknown>): string {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {};

  if (event.type === 'phase_start' && payload.phase) {
    return `phase=${payload.phase}`;
  }

  if (event.type === 'verification' && payload.tier) {
    return `tier=${payload.tier} ok=${payload.ok}`;
  }

  if (event.type === 'verify_complete' && Array.isArray(payload.results)) {
    return `results=${payload.results.join('; ')}`;
  }

  if (event.type === 'guard_violation') {
    if (payload.guard && typeof payload.guard === 'object') {
      const guard = payload.guard as Record<string, unknown>;
      const reasons = Array.isArray(guard.reasons) ? guard.reasons.join(',') : '';
      return `guard=${reasons || 'violation'}`;
    }
    return 'guard_violation';
  }

  if (event.type === 'stop' && payload.reason) {
    return `reason=${payload.reason}`;
  }

  if (event.type === 'parse_failed') {
    const context = payload.parser_context ?? 'unknown';
    const retry = payload.retry_count ?? 0;
    const snippet = payload.output_snippet ? clip(String(payload.output_snippet), 120) : '';
    return `context=${context} retry=${retry} ${snippet ? `snippet="${snippet}"` : ''}`.trim();
  }

  if (event.type === 'run_started') {
    const flags = [
      `dry_run=${payload.dry_run}`,
      `no_branch=${payload.no_branch}`,
      `allow_dirty=${payload.allow_dirty}`,
      `allow_deps=${payload.allow_deps}`
    ].join(' ');
    return flags;
  }

  if (event.type === 'run_resumed') {
    return `max_ticks=${payload.max_ticks ?? '?'} time=${payload.time ?? '?'}`;
  }

  const keys = Object.keys(payload);
  if (keys.length) {
    return `keys=${keys.slice(0, 4).join(',')}`;
  }

  return '';
}

function formatPointers(input: {
  statePath: string;
  timelinePath: string;
  runDir: string;
  checkpoint?: string;
}): string {
  const artifactsDir = path.join(input.runDir, 'artifacts');
  const lastVerifyLog = findLatestVerifyLog(artifactsDir);
  const lines = [
    `state: ${input.statePath}`,
    `timeline: ${input.timelinePath}`,
    `last_verification_log: ${lastVerifyLog ?? 'none'}`,
    `checkpoint_sha: ${input.checkpoint ?? 'none'}`
  ];
  return lines.join('\n');
}

function findLatestVerifyLog(artifactsDir: string): string | null {
  if (!fs.existsSync(artifactsDir)) {
    return null;
  }
  const logs = fs
    .readdirSync(artifactsDir)
    .filter((file) => file.startsWith('tests_') && file.endsWith('.log'))
    .map((file) => path.join(artifactsDir, file));
  if (logs.length === 0) {
    return null;
  }
  const withTimes = logs
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return withTimes[0]?.file ?? null;
}

function clip(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
