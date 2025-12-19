import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig, agentConfigSchema } from './schema.js';

export function resolveConfigPath(repoPath: string, configPath?: string): string {
  if (configPath) {
    return path.resolve(configPath);
  }
  return path.resolve(repoPath, 'agent.config.json');
}

export function loadConfig(configPath: string): AgentConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return agentConfigSchema.parse(parsed);
}
