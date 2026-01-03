/**
 * Secret redaction for error excerpts
 *
 * Basic DLP to prevent common secrets from leaking into journal files.
 * Not perfect, but catches the obvious patterns.
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_EXCERPT_LINES = 60;
const MAX_EXCERPT_BYTES = 5 * 1024; // 5KB

export interface RedactionResult {
  redacted: string;
  had_redactions: boolean;
}

/**
 * Redact common secret patterns from text
 */
export function redactSecrets(text: string): RedactionResult {
  let redacted = text;
  let had_redactions = false;

  // AWS access keys (AKIA...)
  if (/AKIA[0-9A-Z]{16}/.test(redacted)) {
    redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]');
    had_redactions = true;
  }

  // Env var patterns (KEY=value, TOKEN=value, SECRET=value, PASSWORD=value)
  // Matches: VAR=value, VAR="value", VAR='value'
  if (/\b[A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z_]*=["']?[^\s"']+["']?/i.test(redacted)) {
    redacted = redacted.replace(
      /\b([A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z_]*)=(["']?)([^\s"']+)\2/gi,
      '$1=[REDACTED]'
    );
    had_redactions = true;
  }

  // Bearer tokens
  if (/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(redacted)) {
    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    had_redactions = true;
  }

  // PEM blocks
  if (/-----BEGIN [A-Z ]+-----/.test(redacted)) {
    redacted = redacted.replace(/-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g, '[REDACTED_PEM_BLOCK]');
    had_redactions = true;
  }

  return { redacted, had_redactions };
}

/**
 * Get error excerpt from log file with capping (lines + bytes)
 */
export function getErrorExcerpt(logPath: string): string {
  if (!fs.existsSync(logPath)) {
    return `[Log file not found: ${path.basename(logPath)}]`;
  }

  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n');

    // Take last N lines
    const lastLines = lines.slice(-MAX_EXCERPT_LINES);
    let excerpt = lastLines.join('\n');

    // Cap by byte size
    if (Buffer.byteLength(excerpt, 'utf-8') > MAX_EXCERPT_BYTES) {
      // Truncate to byte limit
      excerpt = excerpt.substring(0, MAX_EXCERPT_BYTES);
      excerpt += '\n\n[Excerpt truncated to 5KB]';
    }

    // Apply redaction
    const { redacted, had_redactions } = redactSecrets(excerpt);

    // Add footer if redacted
    const footer = had_redactions ? '\n\n[Redaction applied - sensitive data removed]' : '';

    return redacted + footer;
  } catch (err) {
    return `[Error reading log file: ${(err as Error).message}]`;
  }
}
