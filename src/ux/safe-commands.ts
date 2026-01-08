/**
 * Safe command parsing and validation for auto-fix execution.
 *
 * This module ensures that only "boringly safe" commands are auto-executed
 * by the continue command. It rejects shell pipelines, redirects, and
 * anything that could be an injection surface.
 */

/**
 * A canonical command representation - parsed and validated.
 */
export interface CanonicalCommand {
  /** The binary to execute (npm, pnpm, pytest, etc.) */
  binary: string;
  /** Arguments to pass to the binary */
  args: string[];
  /** The original raw command string for display */
  raw: string;
}

/**
 * Dangerous patterns that indicate shell injection or unsafe behavior.
 * If any of these are present, the command is rejected.
 */
const DANGEROUS_PATTERNS = [
  '|',    // pipe
  '>',    // redirect stdout
  '<',    // redirect stdin
  '&&',   // chain commands
  ';',    // command separator
  '$(',   // command substitution
  '`',    // backtick command substitution
  '"',    // double quotes (could hide injection)
  "'",    // single quotes (could hide injection)
  '\n',   // newlines (multiple commands)
  '\\',   // escape sequences
];

/**
 * Safe command patterns that are allowed for auto-fix.
 * Each pattern specifies: binary, allowed subcommands/args.
 */
interface SafePattern {
  binary: string;
  /** If specified, first arg must match one of these */
  allowedSubcommands?: string[];
  /** If specified, second arg (for 'run' subcommand) must match one of these */
  allowedScripts?: string[];
}

const SAFE_PATTERNS: SafePattern[] = [
  // Node package managers - test/typecheck/lint only
  { binary: 'npm', allowedSubcommands: ['test', 'run'], allowedScripts: ['test', 'typecheck', 'lint', 'type-check', 'types'] },
  { binary: 'pnpm', allowedSubcommands: ['test', 'run'], allowedScripts: ['test', 'typecheck', 'lint', 'type-check', 'types'] },
  { binary: 'yarn', allowedSubcommands: ['test', 'run'], allowedScripts: ['test', 'typecheck', 'lint', 'type-check', 'types'] },

  // Direct TypeScript/linting tools
  { binary: 'tsc' },
  { binary: 'eslint' },
  { binary: 'prettier', allowedSubcommands: ['--check'] },

  // Python tools
  { binary: 'pytest' },
  { binary: 'python', allowedSubcommands: ['-m'], allowedScripts: ['pytest', 'mypy', 'ruff'] },
  { binary: 'ruff' },
  { binary: 'mypy' },

  // Go tools
  { binary: 'go', allowedSubcommands: ['test'] },

  // Rust tools
  { binary: 'cargo', allowedSubcommands: ['test', 'check', 'clippy'] },
];

/**
 * Parse a raw command string into a canonical form.
 * Returns null if the command contains dangerous patterns or is unparseable.
 */
export function canonicalizeCommand(raw: string): CanonicalCommand | null {
  // Trim whitespace
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return null;
    }
  }

  // Split on whitespace (simple tokenization)
  const parts = trimmed.split(/\s+/);

  if (parts.length === 0 || !parts[0]) {
    return null;
  }

  const binary = parts[0];
  const args = parts.slice(1);

  return {
    binary,
    args,
    raw: trimmed,
  };
}

/**
 * Check if a canonical command is allowed for auto-fix execution.
 */
export function isAutoFixCommandAllowed(cmd: CanonicalCommand): boolean {
  const pattern = SAFE_PATTERNS.find(p => p.binary === cmd.binary);

  if (!pattern) {
    return false;
  }

  // If no subcommand restrictions, binary alone is safe
  if (!pattern.allowedSubcommands) {
    return true;
  }

  // Check first arg against allowed subcommands
  const firstArg = cmd.args[0];
  if (!firstArg || !pattern.allowedSubcommands.includes(firstArg)) {
    return false;
  }

  // Special handling for 'run' subcommand - check script name
  if (firstArg === 'run' && pattern.allowedScripts) {
    const scriptName = cmd.args[1];
    if (!scriptName || !pattern.allowedScripts.includes(scriptName)) {
      return false;
    }
  }

  // Special handling for python -m
  if (cmd.binary === 'python' && firstArg === '-m' && pattern.allowedScripts) {
    const moduleName = cmd.args[1];
    if (!moduleName || !pattern.allowedScripts.includes(moduleName)) {
      return false;
    }
  }

  return true;
}

/**
 * Parse a raw command and check if it's allowed in one step.
 * Returns the canonical command if allowed, null otherwise.
 */
export function parseAndValidateCommand(raw: string): CanonicalCommand | null {
  const cmd = canonicalizeCommand(raw);
  if (!cmd) {
    return null;
  }

  if (!isAutoFixCommandAllowed(cmd)) {
    return null;
  }

  return cmd;
}

/**
 * Extract safe commands from a list of suggested commands.
 * Filters out any commands that are not in the safe allowlist.
 */
export function filterSafeCommands(commands: string[]): CanonicalCommand[] {
  const result: CanonicalCommand[] = [];

  for (const raw of commands) {
    const cmd = parseAndValidateCommand(raw);
    if (cmd) {
      result.push(cmd);
    }
  }

  return result;
}
