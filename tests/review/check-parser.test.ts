/**
 * Tests for review check parser.
 */

import { describe, it, expect } from 'vitest';
import {
  extractListItems,
  extractActionRequests,
  mapToCommand,
  parseReviewFeedback,
  formatReviewRequests,
  extractUnmetDoneChecks
} from '../../src/review/check-parser.js';

describe('Check Parser', () => {
  describe('extractListItems', () => {
    it('should extract numbered lists', () => {
      const text = `
        Review comments:
        1. Fix the type errors
        2. Add test coverage
        3. Update documentation
      `;

      const items = extractListItems(text);

      expect(items).toHaveLength(3);
      expect(items[0]).toBe('Fix the type errors');
      expect(items[1]).toBe('Add test coverage');
      expect(items[2]).toBe('Update documentation');
    });

    it('should extract bullet points', () => {
      const text = `
        Issues found:
        - Fix linting errors
        * Run the build
        • Check test coverage
      `;

      const items = extractListItems(text);

      expect(items).toHaveLength(3);
      expect(items).toContain('Fix linting errors');
      expect(items).toContain('Run the build');
      expect(items).toContain('Check test coverage');
    });

    it('should handle mixed formats', () => {
      const text = `
        1. First item
        - Second item
        2. Third item
      `;

      const items = extractListItems(text);

      expect(items).toHaveLength(3);
    });
  });

  describe('extractActionRequests', () => {
    it('should extract "please fix" patterns', () => {
      const text = 'Please fix the type errors in the component.';

      const requests = extractActionRequests(text);

      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('fix');
      expect(requests[0]).toContain('type errors');
    });

    it('should extract "need to" patterns', () => {
      const text = 'You need to add test coverage for the new function.';

      const requests = extractActionRequests(text);

      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('add');
      expect(requests[0]).toContain('test coverage');
    });

    it('should extract multiple requests', () => {
      const text = 'Please fix the build errors. Also need to update the tests.';

      const requests = extractActionRequests(text);

      expect(requests.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mapToCommand', () => {
    it('should map type error request to typecheck command', () => {
      const result = mapToCommand('Fix the type errors');

      expect(result.command).toBe('npm run typecheck');
      expect(result.category).toBe('type_errors');
    });

    it('should map test request to test command', () => {
      const result = mapToCommand('Add test coverage');

      expect(result.command).toBe('npm test');
      expect(result.category).toBe('tests');
    });

    it('should map lint request to lint command', () => {
      const result = mapToCommand('Fix linting errors');

      expect(result.command).toBe('npm run lint');
      expect(result.category).toBe('lint');
    });

    it('should map build request to build command', () => {
      const result = mapToCommand('Run the build');

      expect(result.command).toBe('npm run build');
      expect(result.category).toBe('build');
    });

    it('should map coverage request to coverage command', () => {
      const result = mapToCommand('Improve code coverage');

      expect(result.command).toBe('npm test -- --coverage');
      expect(result.category).toBe('coverage');
    });

    it('should return empty for unmapped requests', () => {
      const result = mapToCommand('Update the readme');

      expect(result.command).toBeUndefined();
      expect(result.category).toBeUndefined();
    });
  });

  describe('parseReviewFeedback', () => {
    it('should parse review with list items', () => {
      const review = `
        Changes requested:
        1. Fix the 3 type errors in src/component.ts
        2. Add tests for the new utility function
        3. Run the lint check
      `;

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(false);
      expect(parsed.requests.length).toBe(3);
      expect(parsed.commandsToSatisfy).toContain('npm run typecheck');
      expect(parsed.commandsToSatisfy).toContain('npm test');
      expect(parsed.commandsToSatisfy).toContain('npm run lint');
    });

    it('should detect approval', () => {
      const review = 'LGTM! The implementation looks good.';

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(true);
      expect(parsed.requests).toHaveLength(0);
    });

    it('should detect approval with "approved"', () => {
      const review = 'Changes approved. Ready for merge.';

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(true);
    });

    it('should extract error counts', () => {
      const review = 'There are still 5 type errors that need to be fixed.';

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(false);
      expect(parsed.commandsToSatisfy).toContain('npm run typecheck');
    });

    it('should extract coverage percentage issues', () => {
      const review = 'Coverage is only 65%, needs to be at least 80%.';

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(false);
      expect(parsed.commandsToSatisfy).toContain('npm test -- --coverage');
    });

    it('should handle no specific requests', () => {
      const review = 'The code needs some improvements.';

      const parsed = parseReviewFeedback(review);

      expect(parsed.isApproved).toBe(false);
      expect(parsed.requests.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatReviewRequests', () => {
    it('should format requests with commands', () => {
      const parsed = {
        requests: [
          { text: 'Fix type errors', suggestedCommand: 'npm run typecheck', category: 'type_errors' as const },
          { text: 'Add tests', suggestedCommand: 'npm test', category: 'tests' as const }
        ],
        commandsToSatisfy: ['npm run typecheck', 'npm test'],
        isApproved: false
      };

      const lines = formatReviewRequests(parsed, 'run-123');

      expect(lines.join('\n')).toContain('Reviewer requested:');
      expect(lines.join('\n')).toContain('Fix type errors');
      expect(lines.join('\n')).toContain('Commands to satisfy:');
      expect(lines.join('\n')).toContain('npm run typecheck');
      expect(lines.join('\n')).toContain('Suggested intervention:');
      expect(lines.join('\n')).toContain('runr intervene run-123');
    });

    it('should indicate approval', () => {
      const parsed = {
        requests: [],
        commandsToSatisfy: [],
        isApproved: true
      };

      const lines = formatReviewRequests(parsed, 'run-456');

      expect(lines.join('\n')).toContain('Approved');
    });

    it('should limit displayed requests', () => {
      const parsed = {
        requests: [
          { text: 'Request 1' },
          { text: 'Request 2' },
          { text: 'Request 3' },
          { text: 'Request 4' },
          { text: 'Request 5' }
        ],
        commandsToSatisfy: [],
        isApproved: false
      };

      const lines = formatReviewRequests(parsed, 'run-789');

      expect(lines.join('\n')).toContain('... and 2 more');
    });
  });

  describe('extractUnmetDoneChecks', () => {
    it('should extract failed checks', () => {
      const doneChecks = [
        { name: 'typecheck', passed: true },
        { name: 'tests', passed: false, message: 'Test coverage below threshold' },
        { name: 'build', passed: false, message: 'Build failed with errors' }
      ];

      const unmet = extractUnmetDoneChecks(doneChecks);

      expect(unmet).toHaveLength(2);
      expect(unmet).toContain('Test coverage below threshold');
      expect(unmet).toContain('Build failed with errors');
    });

    it('should use name if no message', () => {
      const doneChecks = [
        { name: 'lint', passed: false }
      ];

      const unmet = extractUnmetDoneChecks(doneChecks);

      expect(unmet).toEqual(['lint']);
    });

    it('should return empty for all passing', () => {
      const doneChecks = [
        { name: 'typecheck', passed: true },
        { name: 'tests', passed: true }
      ];

      const unmet = extractUnmetDoneChecks(doneChecks);

      expect(unmet).toHaveLength(0);
    });
  });
});
