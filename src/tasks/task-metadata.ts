import fs from 'node:fs';
import yaml from 'yaml';
import { normalizeOwnsPatterns } from '../ownership/normalize.js';

// Re-export for backward compatibility
export { normalizeOwnsPatterns } from '../ownership/normalize.js';

export interface TaskMetadata {
  raw: string;
  body: string;
  owns_raw: string[];
  owns_normalized: string[];
  frontmatter: Record<string, unknown> | null;
}

function hasFrontmatter(raw: string): boolean {
  const trimmed = raw.startsWith('\ufeff') ? raw.slice(1) : raw;
  return trimmed.startsWith('---');
}

function splitFrontmatter(raw: string): { frontmatterText: string | null; body: string } {
  const trimmed = raw.startsWith('\ufeff') ? raw.slice(1) : raw;
  if (!hasFrontmatter(trimmed)) {
    return { frontmatterText: null, body: raw };
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    return { frontmatterText: null, body: raw };
  }

  const endIdx = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (endIdx === -1) {
    return { frontmatterText: null, body: raw };
  }

  const frontmatterText = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatterText, body };
}

function coerceOwns(value: unknown, taskPath: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    const nonStrings = value.filter((item) => typeof item !== 'string');
    if (nonStrings.length > 0) {
      throw new Error(`Invalid owns entry in ${taskPath}: must be string or string[]`);
    }
    return value as string[];
  }

  throw new Error(`Invalid owns entry in ${taskPath}: must be string or string[]`);
}

export function loadTaskMetadata(taskPath: string): TaskMetadata {
  const raw = fs.readFileSync(taskPath, 'utf-8');
  const { frontmatterText, body } = splitFrontmatter(raw);

  let frontmatter: Record<string, unknown> | null = null;
  let ownsRaw: string[] = [];

  if (frontmatterText !== null) {
    try {
      const parsed = yaml.parse(frontmatterText);
      if (parsed && typeof parsed === 'object') {
        frontmatter = parsed as Record<string, unknown>;
      } else {
        frontmatter = {};
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse task frontmatter in ${taskPath}: ${message}`);
    }

    ownsRaw = coerceOwns(frontmatter.owns, taskPath);
  }

  const ownsNormalized = normalizeOwnsPatterns(ownsRaw);

  return {
    raw,
    body,
    owns_raw: ownsRaw,
    owns_normalized: ownsNormalized,
    frontmatter
  };
}
