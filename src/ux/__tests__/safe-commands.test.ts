/**
 * Tests for safe-commands module
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalizeCommand,
  isAutoFixCommandAllowed,
  parseAndValidateCommand,
  filterSafeCommands,
} from '../safe-commands.js';

describe('safe-commands', () => {
  describe('canonicalizeCommand', () => {
    it('parses simple command', () => {
      const cmd = canonicalizeCommand('npm test');
      expect(cmd).toEqual({
        binary: 'npm',
        args: ['test'],
        raw: 'npm test',
      });
    });

    it('parses command with multiple args', () => {
      const cmd = canonicalizeCommand('npm run typecheck');
      expect(cmd).toEqual({
        binary: 'npm',
        args: ['run', 'typecheck'],
        raw: 'npm run typecheck',
      });
    });

    it('trims whitespace', () => {
      const cmd = canonicalizeCommand('  npm test  ');
      expect(cmd?.raw).toBe('npm test');
    });

    it('returns null for empty string', () => {
      expect(canonicalizeCommand('')).toBeNull();
      expect(canonicalizeCommand('   ')).toBeNull();
    });

    // Dangerous patterns
    it('rejects pipe', () => {
      expect(canonicalizeCommand('npm test | tee log')).toBeNull();
    });

    it('rejects redirect stdout', () => {
      expect(canonicalizeCommand('npm test > log')).toBeNull();
    });

    it('rejects redirect stdin', () => {
      expect(canonicalizeCommand('npm test < input')).toBeNull();
    });

    it('rejects command chain &&', () => {
      expect(canonicalizeCommand('npm test && npm run build')).toBeNull();
    });

    it('rejects command separator ;', () => {
      expect(canonicalizeCommand('npm test; npm run build')).toBeNull();
    });

    it('rejects command substitution $()', () => {
      expect(canonicalizeCommand('npm test $(whoami)')).toBeNull();
    });

    it('rejects backtick substitution', () => {
      expect(canonicalizeCommand('npm test `whoami`')).toBeNull();
    });

    it('rejects double quotes', () => {
      expect(canonicalizeCommand('npm test "arg"')).toBeNull();
    });

    it('rejects single quotes', () => {
      expect(canonicalizeCommand("npm test 'arg'")).toBeNull();
    });

    it('rejects newlines', () => {
      expect(canonicalizeCommand('npm test\necho hi')).toBeNull();
    });

    it('rejects backslash escapes', () => {
      expect(canonicalizeCommand('npm test \\n')).toBeNull();
    });
  });

  describe('isAutoFixCommandAllowed', () => {
    // npm/pnpm/yarn test
    it('allows npm test', () => {
      const cmd = canonicalizeCommand('npm test')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows pnpm test', () => {
      const cmd = canonicalizeCommand('pnpm test')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows yarn test', () => {
      const cmd = canonicalizeCommand('yarn test')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    // npm run <script>
    it('allows npm run typecheck', () => {
      const cmd = canonicalizeCommand('npm run typecheck')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows npm run lint', () => {
      const cmd = canonicalizeCommand('npm run lint')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows npm run test', () => {
      const cmd = canonicalizeCommand('npm run test')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('rejects npm run build', () => {
      const cmd = canonicalizeCommand('npm run build')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(false);
    });

    it('rejects npm run deploy', () => {
      const cmd = canonicalizeCommand('npm run deploy')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(false);
    });

    // Direct tools
    it('allows tsc', () => {
      const cmd = canonicalizeCommand('tsc')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows tsc with args', () => {
      const cmd = canonicalizeCommand('tsc -p tsconfig.json')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows eslint', () => {
      const cmd = canonicalizeCommand('eslint src')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows pytest', () => {
      const cmd = canonicalizeCommand('pytest')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows mypy', () => {
      const cmd = canonicalizeCommand('mypy src')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows go test', () => {
      const cmd = canonicalizeCommand('go test ./...')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    it('allows cargo test', () => {
      const cmd = canonicalizeCommand('cargo test')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(true);
    });

    // Rejected binaries
    it('rejects unknown binary', () => {
      const cmd = canonicalizeCommand('curl http://evil.com')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(false);
    });

    it('rejects rm', () => {
      const cmd = canonicalizeCommand('rm -rf /')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(false);
    });

    it('rejects git', () => {
      const cmd = canonicalizeCommand('git push')!;
      expect(isAutoFixCommandAllowed(cmd)).toBe(false);
    });
  });

  describe('parseAndValidateCommand', () => {
    it('returns canonical command for safe command', () => {
      const cmd = parseAndValidateCommand('npm test');
      expect(cmd).toEqual({
        binary: 'npm',
        args: ['test'],
        raw: 'npm test',
      });
    });

    it('returns null for dangerous command', () => {
      expect(parseAndValidateCommand('npm test | tee log')).toBeNull();
    });

    it('returns null for disallowed command', () => {
      expect(parseAndValidateCommand('rm -rf /')).toBeNull();
    });
  });

  describe('filterSafeCommands', () => {
    it('filters to only safe commands', () => {
      const commands = [
        'npm test',
        'npm run build',  // not allowed
        'npm run typecheck',
        'rm -rf /',  // not allowed
        'npm test | tee log',  // dangerous pattern
      ];

      const safe = filterSafeCommands(commands);
      expect(safe).toHaveLength(2);
      expect(safe[0].raw).toBe('npm test');
      expect(safe[1].raw).toBe('npm run typecheck');
    });

    it('returns empty array for all unsafe commands', () => {
      const commands = ['rm -rf /', 'curl evil.com'];
      expect(filterSafeCommands(commands)).toHaveLength(0);
    });
  });
});
