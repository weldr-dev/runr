import { describe, it, expect } from 'vitest';
import { loadAllPacks } from '../loader.js';

/**
 * CONSTRAINT ENFORCEMENT TESTS
 *
 * These tests enforce the pack system constraints mechanically.
 * If these tests fail, someone is violating the pack contract.
 *
 * See docs/packs/CONSTRAINTS.md for philosophy.
 */

describe('Pack System Constraints', () => {
  const ALLOWED_ACTION_TYPES = [
    'ensure_gitignore_entry',
    'create_file_if_missing'
  ];

  const ALLOWED_TOP_LEVEL_KEYS = [
    'pack_version',
    'name',
    'display_name',
    'description',
    'defaults',
    'templates',
    'init_actions'
  ];

  describe('No Smart Actions (v1 Constraint)', () => {
    it('only allows safe, boring action types', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        const actions = pack.manifest.init_actions || [];
        for (const action of actions) {
          expect(
            ALLOWED_ACTION_TYPES,
            `Pack "${pack.name}" uses forbidden action type "${action.type}". ` +
            `Only ${ALLOWED_ACTION_TYPES.join(', ')} are allowed. ` +
            `See docs/packs/CONSTRAINTS.md`
          ).toContain(action.type);
        }
      }
    });

    it('rejects any attempt to add smart actions', () => {
      // This test documents what we will NOT allow
      const forbiddenActionTypes = [
        'edit_file',
        'run_command',
        'modify_package_json',
        'create_git_branch',
        'install_dependencies',
        'run_script'
      ];

      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        const actions = pack.manifest.init_actions || [];
        for (const action of actions) {
          for (const forbidden of forbiddenActionTypes) {
            expect(
              action.type,
              `Pack "${pack.name}" attempted to use forbidden action "${forbidden}"`
            ).not.toBe(forbidden);
          }
        }
      }
    });
  });

  describe('Pack Contract Stability', () => {
    it('enforces pack_version === 1', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        expect(
          pack.manifest.pack_version,
          `Pack "${pack.name}" has invalid pack_version. Must be 1.`
        ).toBe(1);
      }
    });

    it('requires all mandatory fields', () => {
      const requiredFields = ['pack_version', 'name', 'display_name', 'description'];
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        for (const field of requiredFields) {
          expect(
            pack.manifest,
            `Pack "${pack.name}" missing required field "${field}"`
          ).toHaveProperty(field);
        }
      }
    });

    it('rejects unknown top-level keys to keep packs honest', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        const manifestKeys = Object.keys(pack.manifest);
        for (const key of manifestKeys) {
          expect(
            ALLOWED_TOP_LEVEL_KEYS,
            `Pack "${pack.name}" has unknown top-level key "${key}". ` +
            `Allowed keys: ${ALLOWED_TOP_LEVEL_KEYS.join(', ')}`
          ).toContain(key);
        }
      }
    });

    it('enforces pack name format (lowercase alphanumeric + hyphens)', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        expect(
          pack.manifest.name,
          `Pack "${pack.name}" has invalid name format. Must match /^[a-z][a-z0-9-]*$/`
        ).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    });
  });

  describe('Template Path Safety', () => {
    it('template paths are relative, not absolute', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid || !pack.manifest.templates) continue;

        for (const [key, templatePath] of Object.entries(pack.manifest.templates)) {
          expect(
            templatePath.startsWith('/'),
            `Pack "${pack.name}" template "${key}" uses absolute path "${templatePath}". Must be relative.`
          ).toBe(false);

          expect(
            templatePath.startsWith('../'),
            `Pack "${pack.name}" template "${key}" attempts to escape pack directory: "${templatePath}"`
          ).toBe(false);
        }
      }
    });

    it('template paths do not contain suspicious patterns', () => {
      const suspiciousPatterns = ['../', '~/', '$'];
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid || !pack.manifest.templates) continue;

        for (const [key, templatePath] of Object.entries(pack.manifest.templates)) {
          for (const pattern of suspiciousPatterns) {
            expect(
              templatePath.includes(pattern),
              `Pack "${pack.name}" template "${key}" contains suspicious pattern "${pattern}"`
            ).toBe(false);
          }
        }
      }
    });
  });

  describe('No Code Execution', () => {
    it('packs contain only JSON and markdown templates', () => {
      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid || !pack.manifest.templates) continue;

        for (const [key, templatePath] of Object.entries(pack.manifest.templates)) {
          const allowedExtensions = ['.tmpl', '.md', '.txt'];
          const hasAllowedExtension = allowedExtensions.some(ext => templatePath.endsWith(ext));

          expect(
            hasAllowedExtension,
            `Pack "${pack.name}" template "${key}" has suspicious extension: "${templatePath}". ` +
            `Allowed: ${allowedExtensions.join(', ')}`
          ).toBe(true);

          // Explicitly forbid executable extensions
          const forbiddenExtensions = ['.js', '.ts', '.sh', '.bash', '.py', '.rb', '.exe'];
          for (const ext of forbiddenExtensions) {
            expect(
              templatePath.endsWith(ext),
              `Pack "${pack.name}" template "${key}" has forbidden executable extension: "${templatePath}"`
            ).toBe(false);
          }
        }
      }
    });
  });

  describe('Idempotence Guarantees', () => {
    it('all actions are naturally idempotent', () => {
      // ensure_gitignore_entry: only adds if missing
      // create_file_if_missing: only creates if missing
      // This test documents the contract

      const packs = loadAllPacks();

      for (const pack of packs) {
        if (!pack.validation.valid) continue;

        const actions = pack.manifest.init_actions || [];
        for (const action of actions) {
          if (action.type === 'ensure_gitignore_entry') {
            // Check it has required fields
            expect(action).toHaveProperty('path');
            expect(action).toHaveProperty('line');
          } else if (action.type === 'create_file_if_missing') {
            // Check it has required fields
            expect(action).toHaveProperty('path');
            expect(action).toHaveProperty('template');
          }
        }
      }
    });
  });
});
