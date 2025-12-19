import fs from 'node:fs';
import path from 'node:path';

export interface ReportOptions {
  runId: string;
}

export async function reportCommand(options: ReportOptions): Promise<void> {
  const summaryPath = path.resolve('runs', options.runId, 'summary.md');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Summary not found: ${summaryPath}`);
  }
  const content = fs.readFileSync(summaryPath, 'utf-8');
  console.log(content.trim());
}
