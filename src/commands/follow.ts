import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export interface FollowOptions {
  runId: string;
}

interface TimelineEvent {
  type: string;
  source: string;
  payload: Record<string, unknown>;
  seq: number;
  timestamp: string;
}

interface RunState {
  phase: string;
  milestone_index: number;
  stop_reason?: string;
}

const TERMINAL_PHASES = ['STOPPED', 'DONE'];
const POLL_INTERVAL_MS = 1000;

function formatEvent(event: TimelineEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const prefix = `[${time}] ${event.type}`;

  switch (event.type) {
    case 'run_started':
      return `${prefix} - task: ${event.payload.task}`;

    case 'preflight': {
      const pf = event.payload as {
        guard?: { ok: boolean };
        ping?: { ok: boolean; skipped: boolean };
      };
      const guardStatus = pf.guard?.ok ? 'pass' : 'FAIL';
      const pingStatus = pf.ping?.skipped ? 'skipped' : pf.ping?.ok ? 'pass' : 'FAIL';
      return `${prefix} - guard: ${guardStatus}, ping: ${pingStatus}`;
    }

    case 'phase_start':
      return `${prefix} → ${event.payload.phase}`;

    case 'plan_generated': {
      const plan = event.payload as { milestones?: unknown[] };
      const count = plan.milestones?.length ?? 0;
      return `${prefix} - ${count} milestones`;
    }

    case 'implement_complete': {
      const impl = event.payload as { changed_files?: string[] };
      const files = impl.changed_files?.length ?? 0;
      return `${prefix} - ${files} files changed`;
    }

    case 'review_complete': {
      const review = event.payload as { verdict?: string };
      return `${prefix} - verdict: ${review.verdict}`;
    }

    case 'tier_passed':
    case 'tier_failed': {
      const tier = event.payload as { tier?: string; passed?: number; failed?: number };
      return `${prefix} - ${tier.tier} (${tier.passed ?? 0} passed, ${tier.failed ?? 0} failed)`;
    }

    case 'worker_fallback': {
      const fb = event.payload as { from?: string; to?: string; reason?: string };
      return `${prefix} - ${fb.from} → ${fb.to} (${fb.reason})`;
    }

    case 'parse_failed': {
      const pf = event.payload as { stage?: string; retry_count?: number };
      return `${prefix} - stage: ${pf.stage}, retry: ${pf.retry_count}`;
    }

    case 'late_worker_result_ignored': {
      const late = event.payload as { stage?: string; worker?: string };
      return `${prefix} - ${late.stage} from ${late.worker}`;
    }

    case 'stop': {
      const stop = event.payload as {
        reason?: string;
        worker_in_flight?: boolean;
        elapsed_ms?: number;
      };
      const suffix = stop.worker_in_flight ? ' (worker was in-flight)' : '';
      return `${prefix} - reason: ${stop.reason}${suffix}`;
    }

    case 'run_complete': {
      const rc = event.payload as { outcome?: string };
      return `${prefix} - outcome: ${rc.outcome}`;
    }

    case 'milestone_complete':
      return `${prefix} - milestone ${event.payload.milestone_index}`;

    case 'stalled_timeout': {
      const st = event.payload as { elapsed_ms?: number };
      const sec = st.elapsed_ms ? Math.round(st.elapsed_ms / 1000) : '?';
      return `${prefix} - after ${sec}s`;
    }

    default:
      return prefix;
  }
}

async function tailTimeline(
  timelinePath: string,
  fromLine: number
): Promise<{ events: TimelineEvent[]; newLineCount: number }> {
  if (!fs.existsSync(timelinePath)) {
    return { events: [], newLineCount: 0 };
  }

  const events: TimelineEvent[] = [];
  const fileStream = fs.createReadStream(timelinePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum <= fromLine) continue;
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as TimelineEvent;
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return { events, newLineCount: lineNum };
}

function readState(statePath: string): RunState | null {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as RunState;
  } catch {
    return null;
  }
}

export async function followCommand(options: FollowOptions): Promise<void> {
  const runDir = path.resolve('runs', options.runId);

  if (!fs.existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exitCode = 1;
    return;
  }

  const timelinePath = path.join(runDir, 'timeline.jsonl');
  const statePath = path.join(runDir, 'state.json');

  console.log(`Following run ${options.runId}...`);
  console.log('---');

  let lastLineCount = 0;
  let terminated = false;

  // Initial read of existing events
  const initial = await tailTimeline(timelinePath, 0);
  for (const event of initial.events) {
    console.log(formatEvent(event));
  }
  lastLineCount = initial.newLineCount;

  // Check if already terminated
  const initialState = readState(statePath);
  if (initialState && TERMINAL_PHASES.includes(initialState.phase)) {
    console.log('---');
    console.log(`Run already terminated: ${initialState.phase}`);
    if (initialState.stop_reason) {
      console.log(`Reason: ${initialState.stop_reason}`);
    }
    return;
  }

  // Poll for new events
  while (!terminated) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const update = await tailTimeline(timelinePath, lastLineCount);
    for (const event of update.events) {
      console.log(formatEvent(event));
    }
    lastLineCount = update.newLineCount;

    // Check for termination
    const state = readState(statePath);
    if (state && TERMINAL_PHASES.includes(state.phase)) {
      terminated = true;
      console.log('---');
      console.log(`Run terminated: ${state.phase}`);
      if (state.stop_reason) {
        console.log(`Reason: ${state.stop_reason}`);
      }
    }
  }
}
