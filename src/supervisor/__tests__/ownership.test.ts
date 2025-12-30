import { describe, it, expect } from 'vitest';
import { checkOwnership } from '../runner.js';

describe('checkOwnership', () => {
  describe('when no ownership declared', () => {
    it('does not enforce - always returns ok', () => {
      const result = checkOwnership(
        ['README.md', 'src/index.ts', 'package.json'],
        [], // no ownership declared
        ['node_modules/**']
      );

      expect(result.ok).toBe(true);
      expect(result.owned_paths).toEqual([]);
      expect(result.semantic_changed).toEqual([]);
      expect(result.violating_files).toEqual([]);
    });

    it('does not enforce even with changes outside would-be owns', () => {
      // This is the key test: tasks without owns should continue to work unchanged
      const result = checkOwnership(
        ['README.md', 'docs/guide.md', 'src/unrelated.ts'],
        [], // no ownership - no enforcement
        []
      );

      expect(result.ok).toBe(true);
      expect(result.violating_files).toEqual([]);
    });
  });

  describe('when ownership declared', () => {
    it('allows changes within owned paths', () => {
      const result = checkOwnership(
        ['courses/a/lesson1.md', 'courses/a/lesson2.md'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(true);
      expect(result.owned_paths).toEqual(['courses/a/**']);
      expect(result.semantic_changed).toEqual(['courses/a/lesson1.md', 'courses/a/lesson2.md']);
      expect(result.violating_files).toEqual([]);
    });

    it('detects violation when changing files outside owned paths', () => {
      const result = checkOwnership(
        ['courses/a/lesson1.md', 'README.md'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(false);
      expect(result.owned_paths).toEqual(['courses/a/**']);
      expect(result.semantic_changed).toEqual(['courses/a/lesson1.md', 'README.md']);
      expect(result.violating_files).toEqual(['README.md']);
    });

    it('reports all violating files', () => {
      const result = checkOwnership(
        ['courses/a/lesson.md', 'README.md', 'docs/guide.md', 'src/index.ts'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(false);
      expect(result.violating_files).toEqual(['README.md', 'docs/guide.md', 'src/index.ts']);
    });

    it('supports multiple owned paths', () => {
      const result = checkOwnership(
        ['courses/a/lesson.md', 'docs/a.md'],
        ['courses/a/**', 'docs/**'],
        []
      );

      expect(result.ok).toBe(true);
      expect(result.violating_files).toEqual([]);
    });
  });

  describe('env artifact filtering', () => {
    it('excludes env artifacts from ownership check', () => {
      const result = checkOwnership(
        ['courses/a/lesson.md', 'node_modules/foo/bar.js'],
        ['courses/a/**'],
        ['node_modules/**']
      );

      expect(result.ok).toBe(true);
      expect(result.semantic_changed).toEqual(['courses/a/lesson.md']);
      expect(result.violating_files).toEqual([]);
    });

    it('only checks semantic changes, not env noise', () => {
      // If all changes are env artifacts, no enforcement needed
      const result = checkOwnership(
        ['node_modules/foo/bar.js', '.next/cache/file'],
        ['courses/a/**'],
        ['node_modules/**', '.next/**']
      );

      expect(result.ok).toBe(true);
      expect(result.semantic_changed).toEqual([]);
      expect(result.violating_files).toEqual([]);
    });
  });

  describe('rename handling (when both paths are included)', () => {
    it('blocks rename from outside into owned paths', () => {
      // Simulates: git mv README.md courses/a/README.md
      // listChangedFiles now returns BOTH paths
      const result = checkOwnership(
        ['README.md', 'courses/a/README.md'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(false);
      expect(result.violating_files).toEqual(['README.md']);
    });

    it('allows rename within owned paths', () => {
      // Simulates: git mv courses/a/old.md courses/a/new.md
      const result = checkOwnership(
        ['courses/a/old.md', 'courses/a/new.md'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(true);
      expect(result.violating_files).toEqual([]);
    });

    it('blocks rename from owned to outside', () => {
      // Simulates: git mv courses/a/file.md README.md
      const result = checkOwnership(
        ['courses/a/file.md', 'README.md'],
        ['courses/a/**'],
        []
      );

      expect(result.ok).toBe(false);
      expect(result.violating_files).toEqual(['README.md']);
    });
  });

  describe('defensive normalization', () => {
    it('normalizes raw directory paths to glob patterns', () => {
      // Caller passes raw "courses/a/" instead of normalized "courses/a/**"
      const result = checkOwnership(
        ['courses/a/lesson.md'],
        ['courses/a/'], // raw, not normalized
        []
      );

      expect(result.ok).toBe(true);
      expect(result.owned_paths).toEqual(['courses/a/**']); // normalized in output
    });

    it('normalizes Windows-style paths', () => {
      const result = checkOwnership(
        ['courses/a/lesson.md'],
        ['courses\\a\\'], // Windows-style
        []
      );

      expect(result.ok).toBe(true);
      expect(result.owned_paths).toEqual(['courses/a/**']);
    });

    it('handles ./prefix in ownership patterns', () => {
      const result = checkOwnership(
        ['courses/a/lesson.md'],
        ['./courses/a/'],
        []
      );

      expect(result.ok).toBe(true);
      expect(result.owned_paths).toEqual(['courses/a/**']);
    });
  });
});
