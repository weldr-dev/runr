import path from 'node:path';
import picomatch from 'picomatch';

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
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
