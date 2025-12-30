import path from 'node:path';
import picomatch from 'picomatch';

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function compile(patterns: string[]): Array<(s: string) => boolean> {
  return patterns.map((p) => picomatch(p));
}

function matchesAny(matchers: Array<(s: string) => boolean>, s: string): boolean {
  return matchers.some((m) => m(s));
}

/**
 * Partition changed files into env artifacts vs semantic changes.
 * Env artifacts (matching env_allowlist) are allowed noise that shouldn't
 * trigger dirty_worktree or scope_violation.
 */
export function partitionChangedFiles(
  changedFiles: string[],
  envAllowlist: string[]
): { env_touched: string[]; semantic_changed: string[] } {
  const envMatchers = compile(envAllowlist);
  const env_touched: string[] = [];
  const semantic_changed: string[] = [];

  for (const file of changedFiles) {
    const posixFile = toPosix(file);
    if (envMatchers.length > 0 && matchesAny(envMatchers, posixFile)) {
      env_touched.push(file);
    } else {
      semantic_changed.push(file);
    }
  }

  return { env_touched, semantic_changed };
}

export function checkScope(
  changedFiles: string[],
  allowlist: string[],
  denylist: string[]
): { ok: boolean; violations: string[] } {
  const allowMatchers = allowlist.map((pattern) => picomatch(pattern));
  const denyMatchers = denylist.map((pattern) => picomatch(pattern));
  const violations: string[] = [];

  for (const file of changedFiles) {
    const posixFile = toPosix(file);
    if (denyMatchers.some((match) => match(posixFile))) {
      violations.push(file);
      continue;
    }
    if (allowMatchers.length > 0 && !allowMatchers.some((match) => match(posixFile))) {
      violations.push(file);
    }
  }

  return { ok: violations.length === 0, violations };
}

export function checkLockfiles(
  changedFiles: string[],
  lockfiles: string[],
  allowDeps: boolean
): { ok: boolean; violations: string[] } {
  if (allowDeps) {
    return { ok: true, violations: [] };
  }
  const lockfileSet = new Set(lockfiles);
  const violations = changedFiles.filter((file) => lockfileSet.has(file));
  return { ok: violations.length === 0, violations };
}
