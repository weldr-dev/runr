import { execa } from 'execa';
import { WorkerConfig } from '../config/schema.js';
import { WorkerResult } from '../types/schemas.js';
import { PingResult } from './claude.js';

export interface WorkerRunInput {
  prompt: string;
  repo_path: string;
  worker: WorkerConfig;
}

interface CodexEvent {
  type: string;
  item?: {
    type: string;
    text?: string;
    content?: string;
    aggregated_output?: string;
  };
  message?: {
    content?: string;
    text?: string;
  };
  content?: string;
  text?: string;
}

/**
 * Extract assistant text from Codex JSONL output.
 *
 * Codex emits various event types. We look for text in priority order:
 * 1. agent_message / message items (the canonical final response)
 * 2. Any item.completed with text content
 * 3. turn.completed or response events with content
 *
 * Returns concatenated text from all matching events.
 */
function extractTextFromCodexJsonl(output: string): string {
  const lines = output.trim().split('\n').filter(Boolean);
  const texts: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as CodexEvent;

      // Priority 1: agent_message or message items
      if (event.type === 'item.completed' && event.item) {
        const itemType = event.item.type;
        if (itemType === 'agent_message' || itemType === 'message') {
          const text = event.item.text || event.item.content;
          if (text) texts.push(text);
          continue;
        }
      }

      // Priority 2: Any item.completed with text (reasoning, etc.)
      if (event.type === 'item.completed' && event.item?.text) {
        texts.push(event.item.text);
        continue;
      }

      // Priority 3: Top-level message/response events
      if ((event.type === 'response' || event.type === 'turn.completed') && event.message) {
        const text = event.message.content || event.message.text;
        if (text) texts.push(text);
        continue;
      }

      // Priority 4: Direct content on event
      if (event.type === 'response' && (event.content || event.text)) {
        texts.push(event.content || event.text || '');
      }
    } catch {
      // Skip malformed lines
    }
  }

  return texts.join('\n');
}

export async function runCodex(input: WorkerRunInput): Promise<WorkerResult> {
  const { bin, args } = input.worker;

  // Build argv: base args + repo path via -C
  const argv = [...args, '-C', input.repo_path];

  try {
    const result = await execa(bin, argv, {
      cwd: input.repo_path,
      input: input.prompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 300000 // 5 min timeout
    });

    const rawOutput = result.stdout;
    const text = input.worker.output === 'jsonl'
      ? extractTextFromCodexJsonl(rawOutput)
      : rawOutput;

    return {
      status: result.exitCode === 0 ? 'ok' : 'failed',
      commands_run: [`${bin} ${argv.join(' ')}`],
      observations: [text || rawOutput]
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Codex command failed';

    return {
      status: 'failed',
      commands_run: [`${bin} ${argv.join(' ')}`],
      observations: [output]
    };
  }
}

/**
 * Classify error output into categories for preflight reporting.
 */
function classifyError(output: string): 'auth' | 'network' | 'rate_limit' | 'unknown' {
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

/**
 * Ping Codex to verify auth and connectivity.
 * Success = process exits 0 within timeout.
 */
export async function pingCodex(worker: WorkerConfig): Promise<PingResult> {
  const { bin, args } = worker;
  const start = Date.now();
  const pingPrompt = 'Respond with exactly: ok';

  // Build minimal argv (no -C repo path for ping)
  const argv = [...args];

  try {
    const result = await execa(bin, argv, {
      input: pingPrompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15000 // 15s timeout for ping
    });

    const ms = Date.now() - start;

    // Success = exit code 0
    if (result.exitCode === 0) {
      return { ok: true, worker: 'codex', ms };
    }

    // Non-zero exit
    const output = result.stderr || result.stdout || '';
    return {
      ok: false,
      worker: 'codex',
      ms,
      category: classifyError(output),
      message: output.slice(0, 200)
    };
  } catch (error) {
    const ms = Date.now() - start;
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: string };
    const output = err.stderr || err.stdout || err.message || 'Ping failed';

    // Check for timeout
    if (err.code === 'ETIMEDOUT' || (err.message && err.message.includes('timed out'))) {
      return {
        ok: false,
        worker: 'codex',
        ms,
        category: 'network',
        message: 'Ping timed out'
      };
    }

    return {
      ok: false,
      worker: 'codex',
      ms,
      category: classifyError(output),
      message: output.slice(0, 200)
    };
  }
}
