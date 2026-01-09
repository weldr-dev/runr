/**
 * Version command.
 *
 * Outputs version information in JSON or human-readable format.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Get agent version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const AGENT_VERSION = packageJson.version as string;

/**
 * Current artifact schema version.
 * This should match the schema_version stamped into all artifacts.
 */
export const ARTIFACT_SCHEMA_VERSION = 1;

export interface VersionOptions {
  json: boolean;
}

export interface VersionOutput {
  schema_version: 1;
  agent_version: string;
  artifact_schema_version: number;
  node: string;
  platform: string;
  commit: string | null;
}

/**
 * Get the current git commit hash (short form).
 * Returns null if not in a git repo or git not available.
 */
function getGitCommit(): string | null {
  // Check CI environment variables first
  const ciCommit = process.env.GITHUB_SHA
    || process.env.CI_COMMIT_SHA
    || process.env.GIT_COMMIT;

  if (ciCommit) {
    return ciCommit.slice(0, 7);
  }

  // Try git command (best-effort, non-fatal)
  try {
    const commit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return commit || null;
  } catch {
    return null;
  }
}

/**
 * Build version output object.
 */
export function getVersionInfo(): VersionOutput {
  return {
    schema_version: 1,
    agent_version: AGENT_VERSION,
    artifact_schema_version: ARTIFACT_SCHEMA_VERSION,
    node: process.version,
    platform: process.platform,
    commit: getGitCommit()
  };
}

/**
 * Format version for human-readable output.
 */
function formatVersion(info: VersionOutput): string {
  const lines: string[] = [];
  lines.push(`Runr v${info.agent_version}`);
  lines.push(`  Artifact Schema: v${info.artifact_schema_version}`);
  lines.push(`  Node: ${info.node}`);
  lines.push(`  Platform: ${info.platform}`);
  if (info.commit) {
    lines.push(`  Commit: ${info.commit}`);
  }
  return lines.join('\n');
}

/**
 * Run the version command.
 */
export async function versionCommand(options: VersionOptions): Promise<void> {
  const info = getVersionInfo();

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(formatVersion(info));
  }
}
