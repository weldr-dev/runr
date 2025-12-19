import fs from 'node:fs';
import path from 'node:path';
import { Event, RunState } from '../types/schemas.js';

export class RunStore {
  private runDir: string;
  private timelinePath: string;
  private seqPath: string;

  private constructor(runDir: string) {
    this.runDir = runDir;
    this.timelinePath = path.join(runDir, 'timeline.jsonl');
    this.seqPath = path.join(runDir, 'seq.txt');
  }

  static init(runId: string, rootDir = path.resolve('runs')): RunStore {
    const runDir = path.join(rootDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(runDir, 'handoffs'), { recursive: true });
    if (!fs.existsSync(path.join(runDir, 'timeline.jsonl'))) {
      fs.writeFileSync(path.join(runDir, 'timeline.jsonl'), '');
    }
    return new RunStore(runDir);
  }

  get path(): string {
    return this.runDir;
  }

  writeConfigSnapshot(config: unknown): void {
    const target = path.join(this.runDir, 'config.snapshot.json');
    fs.writeFileSync(target, JSON.stringify(config, null, 2));
  }

  writePlan(content: string): void {
    const target = path.join(this.runDir, 'plan.md');
    fs.writeFileSync(target, content);
  }

  writeState(state: RunState): void {
    const target = path.join(this.runDir, 'state.json');
    fs.writeFileSync(target, JSON.stringify(state, null, 2));
  }

  readState(): RunState {
    const target = path.join(this.runDir, 'state.json');
    const raw = fs.readFileSync(target, 'utf-8');
    return JSON.parse(raw) as RunState;
  }

  writeSummary(content: string): void {
    const target = path.join(this.runDir, 'summary.md');
    fs.writeFileSync(target, content);
  }

  writeArtifact(name: string, content: string): void {
    const target = path.join(this.runDir, 'artifacts', name);
    fs.writeFileSync(target, content);
  }

  writeMemo(name: string, content: string): void {
    const target = path.join(this.runDir, 'handoffs', name);
    fs.writeFileSync(target, content);
  }

  appendEvent(event: Omit<Event, 'seq' | 'timestamp'>): Event {
    const seq = this.nextSeq();
    const full: Event = {
      ...event,
      seq,
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(this.timelinePath, `${JSON.stringify(full)}\n`);
    return full;
  }

  private nextSeq(): number {
    let current = 0;
    if (fs.existsSync(this.seqPath)) {
      const raw = fs.readFileSync(this.seqPath, 'utf-8').trim();
      if (raw) {
        current = Number.parseInt(raw, 10) || 0;
      }
    }
    const next = current + 1;
    fs.writeFileSync(this.seqPath, String(next));
    return next;
  }
}
