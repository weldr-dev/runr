import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeContextPackArtifact,
  readContextPackArtifact,
  formatContextPackStatus
} from '../artifact.js';
import { ContextPack } from '../pack.js';

describe('writeContextPackArtifact', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes full pack when enabled', () => {
    const pack: ContextPack = {
      version: 1,
      generated_at: '2025-12-24T01:00:00.000Z',
      verification: {
        tier0: ['pnpm lint'],
        tier1: [],
        tier2: []
      },
      reference_files: [],
      scope: {
        allowlist: ['src/**'],
        denylist: []
      },
      patterns: {
        tsconfig: null,
        eslint: null,
        package_json: null
      }
    };

    writeContextPackArtifact(tempDir, pack);

    const artifactPath = path.join(tempDir, 'artifacts', 'context-pack.json');
    expect(fs.existsSync(artifactPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    expect(content.enabled).toBe(true);
    expect(content.pack_version).toBe(1);
    expect(content.generated_at).toBe('2025-12-24T01:00:00.000Z');
    expect(content.estimated_tokens).toBeGreaterThan(0);
    expect(content.verification.tier0).toEqual(['pnpm lint']);
  });

  it('writes disabled stub when pack is null', () => {
    writeContextPackArtifact(tempDir, null);

    const artifactPath = path.join(tempDir, 'artifacts', 'context-pack.json');
    expect(fs.existsSync(artifactPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    expect(content.enabled).toBe(false);
    expect(content.pack_version).toBe(1);
    expect(content.generated_at).toBeDefined();
    expect(content.verification).toBeUndefined();
  });

  it('creates artifacts directory if missing', () => {
    const artifactsDir = path.join(tempDir, 'artifacts');
    expect(fs.existsSync(artifactsDir)).toBe(false);

    writeContextPackArtifact(tempDir, null);

    expect(fs.existsSync(artifactsDir)).toBe(true);
  });
});

describe('readContextPackArtifact', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for missing file', () => {
    const result = readContextPackArtifact(tempDir);
    expect(result).toBeNull();
  });

  it('parses existing artifact', () => {
    const artifactsDir = path.join(tempDir, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    const artifact = {
      enabled: true,
      pack_version: 1,
      generated_at: '2025-12-24T01:00:00.000Z',
      estimated_tokens: 500
    };
    fs.writeFileSync(
      path.join(artifactsDir, 'context-pack.json'),
      JSON.stringify(artifact)
    );

    const result = readContextPackArtifact(tempDir);
    expect(result).not.toBeNull();
    expect(result?.enabled).toBe(true);
    expect(result?.estimated_tokens).toBe(500);
  });

  it('returns null for invalid JSON', () => {
    const artifactsDir = path.join(tempDir, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'context-pack.json'), 'not json');

    const result = readContextPackArtifact(tempDir);
    expect(result).toBeNull();
  });
});

describe('formatContextPackStatus', () => {
  it('formats null as not found', () => {
    expect(formatContextPackStatus(null)).toBe('context_pack: (not found)');
  });

  it('formats disabled artifact', () => {
    const artifact = {
      enabled: false,
      pack_version: 1 as const,
      generated_at: '2025-12-24T01:00:00.000Z'
    };
    expect(formatContextPackStatus(artifact)).toBe('context_pack: disabled');
  });

  it('formats enabled artifact with tokens', () => {
    const artifact = {
      enabled: true,
      pack_version: 1 as const,
      generated_at: '2025-12-24T01:00:00.000Z',
      estimated_tokens: 493
    };
    expect(formatContextPackStatus(artifact)).toBe('context_pack: present (493 tokens)');
  });

  it('handles missing token count', () => {
    const artifact = {
      enabled: true,
      pack_version: 1 as const,
      generated_at: '2025-12-24T01:00:00.000Z'
    };
    expect(formatContextPackStatus(artifact)).toBe('context_pack: present (? tokens)');
  });
});
