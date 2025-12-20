import { execa } from 'execa';
import { WorkerConfig } from '../config/schema.js';
import { WorkerResult } from '../types/schemas.js';

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
