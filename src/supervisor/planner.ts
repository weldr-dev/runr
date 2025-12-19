import fs from 'node:fs';
import { Milestone } from '../types/schemas.js';

export function loadTaskFile(taskPath: string): string {
  return fs.readFileSync(taskPath, 'utf-8');
}

export function buildMilestonesFromTask(taskText: string): Milestone[] {
  const firstLine = taskText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const goal = firstLine ? firstLine : 'Implement task requirements';

  return [
    {
      goal,
      done_checks: ['Core changes implemented', 'Tier 0 checks pass'],
      risk_level: 'medium'
    }
  ];
}
