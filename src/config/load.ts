import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig, agentConfigSchema, SCOPE_PRESETS } from './schema.js';

export function resolveConfigPath(repoPath: string, configPath?: string): string {
  if (configPath) {
    return path.resolve(configPath);
  }

  // Check new location first: .runr/runr.config.json
  const newConfigPath = path.resolve(repoPath, '.runr', 'runr.config.json');
  if (fs.existsSync(newConfigPath)) {
    return newConfigPath;
  }

  // Fall back to old location: .agent/agent.config.json
  const oldConfigPath = path.resolve(repoPath, '.agent', 'agent.config.json');
  if (fs.existsSync(oldConfigPath)) {
    console.warn('\x1b[33m⚠ Deprecation: .agent/agent.config.json is deprecated.\x1b[0m');
    console.warn('\x1b[33m  Move to: .runr/runr.config.json\x1b[0m\n');
    return oldConfigPath;
  }

  // Default to new path (will error if not found)
  return newConfigPath;
}

/**
 * Expand scope presets into allowlist patterns.
 * Unknown presets are warned but not fatal.
 */
function expandPresets(config: AgentConfig): AgentConfig {
  const presets = config.scope.presets ?? [];
  if (presets.length === 0) {
    return config;
  }

  const expandedPatterns: string[] = [];
  const unknownPresets: string[] = [];

  for (const preset of presets) {
    const patterns = SCOPE_PRESETS[preset];
    if (patterns) {
      expandedPatterns.push(...patterns);
    } else {
      unknownPresets.push(preset);
    }
  }

  if (unknownPresets.length > 0) {
    console.warn(`[config] Unknown scope presets (ignored): ${unknownPresets.join(', ')}`);
    console.warn(`[config] Valid presets: ${Object.keys(SCOPE_PRESETS).join(', ')}`);
  }

  // Merge expanded patterns with existing allowlist (deduplicated)
  const mergedAllowlist = [...new Set([...config.scope.allowlist, ...expandedPatterns])];

  return {
    ...config,
    scope: {
      ...config.scope,
      allowlist: mergedAllowlist
    }
  };
}

export function loadConfig(configPath: string): AgentConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  const config = agentConfigSchema.parse(parsed);

  // Expand presets into allowlist
  return expandPresets(config);
}
