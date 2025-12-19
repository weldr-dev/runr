import { execa } from 'execa';
import { WorkerResult } from '../types/schemas.js';

export interface WorkerRunInput {
  prompt: string;
  repo_path: string;
  command: string;
}

export async function runCodex(input: WorkerRunInput): Promise<WorkerResult> {
  if (!input.command) {
    return {
      status: 'blocked',
      commands_run: [],
      observations: ['Codex command is not configured.']
    };
  }

  const result = await execa(input.command, {
    cwd: input.repo_path,
    shell: true,
    input: input.prompt,
    all: true
  });

  return {
    status: result.exitCode === 0 ? 'ok' : 'failed',
    commands_run: [input.command],
    observations: [result.all ?? '']
  };
}
