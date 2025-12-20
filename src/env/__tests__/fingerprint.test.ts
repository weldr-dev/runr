import { describe, it, expect } from 'vitest';
import { compareFingerprints, EnvFingerprint } from '../fingerprint.js';

function makeFingerprint(overrides: Partial<EnvFingerprint> = {}): EnvFingerprint {
  return {
    node_version: 'v20.0.0',
    package_manager: 'npm',
    lockfile_hash: 'abc123def456',
    worker_versions: {
      codex: 'codex-cli 0.70.0',
      claude: '2.0.50 (Claude Code)'
    },
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('compareFingerprints', () => {
  it('returns empty array when fingerprints match', () => {
    const original = makeFingerprint();
    const current = makeFingerprint();
    const diffs = compareFingerprints(original, current);
    expect(diffs).toEqual([]);
  });

  it('detects node version change', () => {
    const original = makeFingerprint({ node_version: 'v20.0.0' });
    const current = makeFingerprint({ node_version: 'v22.0.0' });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      field: 'node_version',
      original: 'v20.0.0',
      current: 'v22.0.0'
    });
  });

  it('detects package manager change', () => {
    const original = makeFingerprint({ package_manager: 'npm' });
    const current = makeFingerprint({ package_manager: 'pnpm' });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('package_manager');
  });

  it('detects lockfile hash change', () => {
    const original = makeFingerprint({ lockfile_hash: 'abc123' });
    const current = makeFingerprint({ lockfile_hash: 'def456' });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('lockfile_hash');
  });

  it('detects worker version change', () => {
    const original = makeFingerprint({
      worker_versions: { codex: '0.70.0', claude: '2.0.50' }
    });
    const current = makeFingerprint({
      worker_versions: { codex: '0.80.0', claude: '2.0.50' }
    });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('worker:codex');
    expect(diffs[0].original).toBe('0.70.0');
    expect(diffs[0].current).toBe('0.80.0');
  });

  it('handles null lockfile gracefully', () => {
    const original = makeFingerprint({ lockfile_hash: null });
    const current = makeFingerprint({ lockfile_hash: 'abc123' });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('lockfile_hash');
    expect(diffs[0].original).toBeNull();
  });

  it('handles null package manager gracefully', () => {
    const original = makeFingerprint({ package_manager: null });
    const current = makeFingerprint({ package_manager: null });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toEqual([]);
  });

  it('handles null worker version gracefully', () => {
    const original = makeFingerprint({
      worker_versions: { codex: null, claude: '2.0.50' }
    });
    const current = makeFingerprint({
      worker_versions: { codex: '0.80.0', claude: '2.0.50' }
    });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].original).toBeNull();
    expect(diffs[0].current).toBe('0.80.0');
  });

  it('detects multiple changes at once', () => {
    const original = makeFingerprint({
      node_version: 'v20.0.0',
      lockfile_hash: 'old-hash',
      worker_versions: { codex: '0.70.0', claude: '2.0.50' }
    });
    const current = makeFingerprint({
      node_version: 'v22.0.0',
      lockfile_hash: 'new-hash',
      worker_versions: { codex: '0.80.0', claude: '2.0.50' }
    });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toHaveLength(3);
    expect(diffs.map((d) => d.field).sort()).toEqual([
      'lockfile_hash',
      'node_version',
      'worker:codex'
    ]);
  });

  it('ignores created_at timestamp differences', () => {
    const original = makeFingerprint({
      created_at: '2025-01-01T00:00:00.000Z'
    });
    const current = makeFingerprint({
      created_at: '2025-06-15T12:30:00.000Z'
    });
    const diffs = compareFingerprints(original, current);
    expect(diffs).toEqual([]);
  });
});
