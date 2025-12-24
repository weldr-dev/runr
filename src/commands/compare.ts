import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { computeKpiFromEvents, DerivedKpi, PhaseKpi } from './report.js';

export interface CompareOptions {
  runA: string;
  runB: string;
}

interface CompareResult {
  runA: { id: string; kpi: DerivedKpi };
  runB: { id: string; kpi: DerivedKpi };
}

export async function compareCommand(options: CompareOptions): Promise<void> {
  const result = await loadComparison(options);
  const output = formatComparison(result);
  console.log(output);
}

async function loadComparison(options: CompareOptions): Promise<CompareResult> {
  const kpiA = await loadKpiForRun(options.runA);
  const kpiB = await loadKpiForRun(options.runB);
  return {
    runA: { id: options.runA, kpi: kpiA },
    runB: { id: options.runB, kpi: kpiB }
  };
}

async function loadKpiForRun(runId: string): Promise<DerivedKpi> {
  const runDir = path.resolve('runs', runId);
  if (!fs.existsSync(runDir)) {
    throw new Error(`Run not found: ${runDir}`);
  }

  const timelinePath = path.join(runDir, 'timeline.jsonl');
  if (!fs.existsSync(timelinePath)) {
    throw new Error(`Timeline not found: ${timelinePath}`);
  }

  const events = await readTimelineEvents(timelinePath);
  return computeKpiFromEvents(events);
}

async function readTimelineEvents(
  timelinePath: string
): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];
  const stream = fs.createReadStream(timelinePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      continue;
    }
  }
  return events;
}

function formatComparison(result: CompareResult): string {
  const { runA, runB } = result;
  const lines: string[] = [];

  lines.push('Compare');
  lines.push(`  A: ${runA.id}`);
  lines.push(`  B: ${runB.id}`);
  lines.push('');

  // Duration comparison
  lines.push('Duration');
  const durA = runA.kpi.total_duration_ms;
  const durB = runB.kpi.total_duration_ms;
  lines.push(`  A: ${formatDuration(durA)}`);
  lines.push(`  B: ${formatDuration(durB)}`);
  lines.push(`  Δ: ${formatDelta(durA, durB)}`);
  lines.push('');

  // Unattributed comparison
  lines.push('Unattributed');
  const unA = runA.kpi.unattributed_ms;
  const unB = runB.kpi.unattributed_ms;
  lines.push(`  A: ${formatDuration(unA)}`);
  lines.push(`  B: ${formatDuration(unB)}`);
  lines.push(`  Δ: ${formatDelta(unA, unB)}`);
  lines.push('');

  // Worker calls
  lines.push('Worker Calls');
  lines.push(`  A: claude=${runA.kpi.workers.claude} codex=${runA.kpi.workers.codex}`);
  lines.push(`  B: claude=${runB.kpi.workers.claude} codex=${runB.kpi.workers.codex}`);
  const claudeDelta = formatWorkerDelta(runA.kpi.workers.claude, runB.kpi.workers.claude);
  const codexDelta = formatWorkerDelta(runA.kpi.workers.codex, runB.kpi.workers.codex);
  lines.push(`  Δ: claude=${claudeDelta} codex=${codexDelta}`);
  lines.push('');

  // Verification
  lines.push('Verification');
  lines.push(
    `  A: attempts=${runA.kpi.verify.attempts} retries=${runA.kpi.verify.retries} duration=${formatDuration(runA.kpi.verify.total_duration_ms)}`
  );
  lines.push(
    `  B: attempts=${runB.kpi.verify.attempts} retries=${runB.kpi.verify.retries} duration=${formatDuration(runB.kpi.verify.total_duration_ms)}`
  );
  const attemptsDelta = runB.kpi.verify.attempts - runA.kpi.verify.attempts;
  const retriesDelta = runB.kpi.verify.retries - runA.kpi.verify.retries;
  const verifyDurDelta = formatDelta(
    runA.kpi.verify.total_duration_ms,
    runB.kpi.verify.total_duration_ms
  );
  lines.push(
    `  Δ: attempts=${formatNumDelta(attemptsDelta)} retries=${formatNumDelta(retriesDelta)} duration=${verifyDurDelta}`
  );
  lines.push('');

  // Milestones
  lines.push('Milestones');
  lines.push(`  A: ${runA.kpi.milestones.completed}`);
  lines.push(`  B: ${runB.kpi.milestones.completed}`);
  const msDelta = runB.kpi.milestones.completed - runA.kpi.milestones.completed;
  lines.push(`  Δ: ${formatNumDelta(msDelta)}`);
  lines.push('');

  // Phase comparison
  lines.push('Phases');
  const allPhases = new Set([
    ...Object.keys(runA.kpi.phases),
    ...Object.keys(runB.kpi.phases)
  ]);
  const phaseOrder = ['PLAN', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'CHECKPOINT', 'FINALIZE'];
  const sortedPhases = [...allPhases].sort((a, b) => {
    const aIdx = phaseOrder.indexOf(a);
    const bIdx = phaseOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  for (const phase of sortedPhases) {
    const pA = runA.kpi.phases[phase] ?? { duration_ms: 0, count: 0 };
    const pB = runB.kpi.phases[phase] ?? { duration_ms: 0, count: 0 };
    const durDelta = formatDelta(pA.duration_ms, pB.duration_ms);
    const countDelta = pB.count - pA.count;
    const highlight = pB.duration_ms > pA.duration_ms * 1.2 ? ' ⚠️' : '';
    lines.push(
      `  ${phase}: A=${formatDuration(pA.duration_ms)}(x${pA.count}) B=${formatDuration(pB.duration_ms)}(x${pB.count}) Δ=${durDelta}(${formatNumDelta(countDelta)})${highlight}`
    );
  }
  lines.push('');

  // Outcome
  lines.push('Outcome');
  lines.push(`  A: ${runA.kpi.outcome}${runA.kpi.stop_reason ? ` (${runA.kpi.stop_reason})` : ''}`);
  lines.push(`  B: ${runB.kpi.outcome}${runB.kpi.stop_reason ? ` (${runB.kpi.stop_reason})` : ''}`);

  return lines.join('\n');
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

function formatDelta(a: number | null, b: number | null): string {
  if (a === null || b === null) return 'n/a';
  const diff = b - a;
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '-';
  return `${sign}${formatPositiveDuration(Math.abs(diff))}`;
}

function formatNumDelta(diff: number): string {
  if (diff === 0) return '0';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function formatWorkerDelta(
  a: number | 'unknown',
  b: number | 'unknown'
): string {
  if (a === 'unknown' || b === 'unknown') return 'n/a';
  return formatNumDelta(b - a);
}
