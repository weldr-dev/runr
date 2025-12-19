import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';

export interface ResumeOptions {
  runId: string;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const runStore = RunStore.init(options.runId);
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    throw new Error(`Run state not found for ${options.runId}`);
  }

  const updated: RunState = {
    ...state,
    resume_token: options.runId,
    updated_at: new Date().toISOString()
  };

  runStore.writeState(updated);
  runStore.appendEvent({
    type: 'run_resumed',
    source: 'cli',
    payload: { run_id: options.runId }
  });
}
