import { RunStore } from '../store/run-store.js';

export interface StatusOptions {
  runId: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const runStore = RunStore.init(options.runId);
  const state = runStore.readState();
  console.log(JSON.stringify(state, null, 2));
}
