/**
 * Version command regression tests.
 *
 * P0 invariant: `runr --version` must match package.json version.
 * This test prevents hardcoded version strings from causing drift.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const packageJsonPath = path.join(repoRoot, 'package.json');

describe('Version Command', () => {
  it('CLI --version matches package.json version', () => {
    // Read expected version from package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const expectedVersion = packageJson.version;

    // Run the CLI --version command
    const cliOutput = execSync('node dist/cli.js --version', {
      cwd: repoRoot,
      encoding: 'utf-8'
    }).trim();

    // The output should be exactly the version string
    expect(cliOutput).toBe(expectedVersion);
  });

  it('CLI -V matches package.json version', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const expectedVersion = packageJson.version;

    const cliOutput = execSync('node dist/cli.js -V', {
      cwd: repoRoot,
      encoding: 'utf-8'
    }).trim();

    expect(cliOutput).toBe(expectedVersion);
  });

  it('getVersionInfo returns correct version', async () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const expectedVersion = packageJson.version;

    // Import the version module directly
    const { getVersionInfo } = await import('../../dist/commands/version.js');
    const versionInfo = getVersionInfo();

    expect(versionInfo.agent_version).toBe(expectedVersion);
  });

  it('version is not hardcoded in cli.ts', () => {
    // Read the source file and ensure there's no hardcoded version
    const cliTsPath = path.join(repoRoot, 'src/cli.ts');
    const cliTs = fs.readFileSync(cliTsPath, 'utf-8');

    // Should use CLI_VERSION variable, not a hardcoded string
    expect(cliTs).toContain('.version(CLI_VERSION)');
    expect(cliTs).not.toMatch(/\.version\(['"][0-9]+\.[0-9]+\.[0-9]+['"]\)/);
  });
});
