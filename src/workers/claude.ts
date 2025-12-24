import { execa } from 'execa';
import { WorkerConfig } from '../config/schema.js';
import { WorkerResult } from '../types/schemas.js';
import { WorkerRunInput } from './codex.js';

export interface PingResult {
  ok: boolean;
  worker: 'claude' | 'codex';
  ms: number;
  category?: 'auth' | 'network' | 'rate_limit' | 'unknown';
  message?: string;
}

interface ClaudeJsonResponse {
  result?: string;
  content?: string;
  message?: string;
  error?: string;
}

function extractTextFromClaudeJson(output: string): string {
  try {
    const parsed = JSON.parse(output) as ClaudeJsonResponse;
    return parsed.result || parsed.content || parsed.message || output;
  } catch {
    // If not valid JSON, return raw output
    return output;
  }
}

export async function runClaude(input: WorkerRunInput): Promise<WorkerResult> {
  const { bin, args } = input.worker;

  try {
    const result = await execa(bin, args, {
      cwd: input.repo_path,
      input: input.prompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 300000 // 5 min timeout
    });

    const rawOutput = result.stdout;
    const text = input.worker.output === 'json'
      ? extractTextFromClaudeJson(rawOutput)
      : rawOutput;

    return {
      status: result.exitCode === 0 ? 'ok' : 'failed',
      commands_run: [`${bin} ${args.join(' ')}`],
      observations: [text || rawOutput]
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Claude command failed';

    return {
      status: 'failed',
      commands_run: [`${bin} ${args.join(' ')}`],
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
 * Ping Claude to verify auth and connectivity.
 * Success = process exits 0 within timeout.
 */
export async function pingClaude(worker: WorkerConfig): Promise<PingResult> {
  const { bin, args } = worker;
  const start = Date.now();
  const pingPrompt = 'Respond with exactly: ok';

  try {
    const result = await execa(bin, args, {
      input: pingPrompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15000 // 15s timeout for ping
    });

    const ms = Date.now() - start;

    // Success = exit code 0
    if (result.exitCode === 0) {
      return { ok: true, worker: 'claude', ms };
    }

    // Non-zero exit
    const output = result.stderr || result.stdout || '';
    return {
      ok: false,
      worker: 'claude',
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
        worker: 'claude',
        ms,
        category: 'network',
        message: 'Ping timed out'
      };
    }

    return {
      ok: false,
      worker: 'claude',
      ms,
      category: classifyError(output),
      message: output.slice(0, 200)
    };
  }
}
