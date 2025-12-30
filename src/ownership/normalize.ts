import path from 'node:path';

/**
 * Normalize a single ownership pattern to POSIX format with glob suffix.
 * - Strips leading ./ and /
 * - Converts backslashes to forward slashes
 * - Adds /** suffix to bare directories
 * - Returns null for empty/invalid patterns
 */
export function normalizeOwnPattern(pattern: string): string | null {
  let normalized = pattern.replace(/\\/g, '/').trim();
  normalized = normalized.replace(/^\.\/+/, '').replace(/^\/+/, '');
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (!normalized) {
    return null;
  }

  const hasGlob = /[*?[\]]/.test(normalized);
  if (!hasGlob) {
    normalized = normalized.replace(/\/+$/, '');
    if (!normalized) {
      return null;
    }
    return `${normalized}/**`;
  }

  return normalized;
}

/**
 * Normalize an array of ownership patterns.
 * Deduplicates and filters out invalid patterns.
 */
export function normalizeOwnsPatterns(patterns: string[]): string[] {
  const normalized: string[] = [];
  for (const pattern of patterns) {
    const entry = normalizeOwnPattern(pattern);
    if (entry) {
      normalized.push(entry);
    }
  }
  return [...new Set(normalized)];
}

/**
 * Convert a file path to POSIX format for matching.
 */
export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
