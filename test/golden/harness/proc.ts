/**
 * Process management for golden scenario tests.
 */

import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  killed: boolean;
}

/**
 * Run a command and wait for completion.
 */
export function runCommand(
  cmd: string,
  args: string[],
  options: SpawnOptions & { timeout?: number } = {}
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      ...options
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutId = options.timeout
      ? setTimeout(() => {
          killed = true;
          proc.kill('SIGKILL');
        }, options.timeout)
      : null;

    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        killed
      });
    });

    proc.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        killed: false
      });
    });
  });
}

/**
 * Spawn a background process and return control handle.
 */
export function spawnBackground(
  cmd: string,
  args: string[],
  options: SpawnOptions = {}
): ChildProcess {
  return spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: false,
    ...options
  });
}

/**
 * Wait for a file to exist (with timeout).
 */
export async function waitForFile(
  filePath: string,
  timeoutMs: number = 30000,
  pollMs: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
}

/**
 * Wait for a state predicate to be true.
 */
export async function waitForState<T>(
  readState: () => T | null,
  predicate: (state: T) => boolean,
  timeoutMs: number = 30000,
  pollMs: number = 100
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = readState();
    if (state && predicate(state)) {
      return state;
    }
    await sleep(pollMs);
  }
  return null;
}

/**
 * Kill a process forcefully.
 */
export function killProcess(proc: ChildProcess): void {
  if (proc.pid) {
    try {
      process.kill(proc.pid, 'SIGKILL');
    } catch {
      // Process may have already exited
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run agent CLI command.
 */
export function runAgent(
  args: string[],
  repoPath: string,
  options: { timeout?: number; env?: Record<string, string> } = {}
): Promise<ProcessResult> {
  // Use npx to run the local agent with mock worker enabled and doctor skipped
  return runCommand('npx', ['agent', ...args], {
    cwd: repoPath,
    timeout: options.timeout,
    env: {
      ...process.env,
      AGENT_MOCK_WORKER: 'delay_5s',
      AGENT_SKIP_DOCTOR: '1',
      ...options.env
    }
  });
}

/**
 * Spawn agent CLI as background process.
 */
export function spawnAgent(
  args: string[],
  repoPath: string,
  options: { env?: Record<string, string> } = {}
): ChildProcess {
  return spawnBackground('npx', ['agent', ...args], {
    cwd: repoPath,
    env: {
      ...process.env,
      AGENT_MOCK_WORKER: 'delay_5s',
      AGENT_SKIP_DOCTOR: '1',
      ...options.env
    }
  });
}
