/**
 * Assertion helpers for golden scenario tests.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface AssertionError {
  type: 'file_exists' | 'file_not_exists' | 'json_field' | 'contains_text' | 'exit_code';
  message: string;
  expected: unknown;
  actual: unknown;
}

export interface AssertionResult {
  passed: boolean;
  errors: AssertionError[];
}

/**
 * Expected outcomes schema.
 */
export interface Expectations {
  orchestrator?: {
    status?: 'complete' | 'stopped';
    tracks_completed?: number;
    steps_completed?: number;
    stop_reason?: string;
  };
  runs?: {
    count_min?: number;
    must_include_stop_reason?: string[];
  };
  artifacts?: {
    must_exist?: string[];
    must_not_exist?: string[];
  };
  contains_text?: Array<{
    file: string;
    pattern: string;
  }>;
  exit_code?: number;
}

/**
 * Load expectations from expect.json file.
 */
export function loadExpectations(expectPath: string): Expectations {
  if (!fs.existsSync(expectPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(expectPath, 'utf-8'));
}

/**
 * Assert that a file exists.
 */
export function assertFileExists(filePath: string, basePath: string): AssertionError | null {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
  if (!fs.existsSync(fullPath)) {
    return {
      type: 'file_exists',
      message: `Expected file to exist: ${filePath}`,
      expected: 'exists',
      actual: 'not found'
    };
  }
  return null;
}

/**
 * Assert that a file does not exist.
 */
export function assertFileNotExists(filePath: string, basePath: string): AssertionError | null {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);
  if (fs.existsSync(fullPath)) {
    return {
      type: 'file_not_exists',
      message: `Expected file to not exist: ${filePath}`,
      expected: 'not exists',
      actual: 'exists'
    };
  }
  return null;
}

/**
 * Assert JSON field value.
 */
export function assertJsonField(
  filePath: string,
  fieldPath: string,
  expected: unknown,
  basePath: string
): AssertionError | null {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  if (!fs.existsSync(fullPath)) {
    return {
      type: 'json_field',
      message: `JSON file not found: ${filePath}`,
      expected,
      actual: 'file not found'
    };
  }

  try {
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const actual = getNestedValue(content, fieldPath);

    if (actual !== expected) {
      return {
        type: 'json_field',
        message: `JSON field ${fieldPath} mismatch in ${filePath}`,
        expected,
        actual
      };
    }
  } catch (err) {
    return {
      type: 'json_field',
      message: `Failed to parse JSON: ${filePath}`,
      expected,
      actual: String(err)
    };
  }

  return null;
}

/**
 * Assert file contains text pattern.
 */
export function assertContainsText(
  filePath: string,
  pattern: string,
  basePath: string
): AssertionError | null {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  if (!fs.existsSync(fullPath)) {
    return {
      type: 'contains_text',
      message: `File not found: ${filePath}`,
      expected: pattern,
      actual: 'file not found'
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  if (!content.includes(pattern)) {
    return {
      type: 'contains_text',
      message: `File ${filePath} does not contain expected text`,
      expected: pattern,
      actual: content.slice(0, 200) + (content.length > 200 ? '...' : '')
    };
  }

  return null;
}

/**
 * Run all assertions for a scenario.
 */
export function runAssertions(
  expectations: Expectations,
  repoPath: string,
  actualExitCode: number
): AssertionResult {
  const errors: AssertionError[] = [];
  const agentDir = path.join(repoPath, '.agent');

  // Check exit code
  if (expectations.exit_code !== undefined && actualExitCode !== expectations.exit_code) {
    errors.push({
      type: 'exit_code',
      message: 'Exit code mismatch',
      expected: expectations.exit_code,
      actual: actualExitCode
    });
  }

  // Check artifact existence
  if (expectations.artifacts?.must_exist) {
    for (const filePath of expectations.artifacts.must_exist) {
      const error = assertFileExists(filePath, agentDir);
      if (error) errors.push(error);
    }
  }

  if (expectations.artifacts?.must_not_exist) {
    for (const filePath of expectations.artifacts.must_not_exist) {
      const error = assertFileNotExists(filePath, agentDir);
      if (error) errors.push(error);
    }
  }

  // Check orchestrator fields
  if (expectations.orchestrator) {
    const orchDirs = fs.existsSync(path.join(agentDir, 'orchestrations'))
      ? fs.readdirSync(path.join(agentDir, 'orchestrations'), { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name)
          .sort()
          .reverse()
      : [];

    if (orchDirs.length > 0) {
      const latestOrch = orchDirs[0];
      const summaryPath = path.join('orchestrations', latestOrch, 'handoffs', 'summary.json');

      if (expectations.orchestrator.status) {
        const error = assertJsonField(summaryPath, 'status', expectations.orchestrator.status, agentDir);
        if (error) errors.push(error);
      }

      if (expectations.orchestrator.tracks_completed !== undefined) {
        // Check by counting completed tracks in summary
        const fullPath = path.join(agentDir, summaryPath);
        if (fs.existsSync(fullPath)) {
          try {
            const summary = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            const completed = summary.tracks?.filter((t: any) => t.status === 'complete').length ?? 0;
            if (completed !== expectations.orchestrator.tracks_completed) {
              errors.push({
                type: 'json_field',
                message: 'Tracks completed count mismatch',
                expected: expectations.orchestrator.tracks_completed,
                actual: completed
              });
            }
          } catch {
            // Handled by file existence check
          }
        }
      }
    }
  }

  // Check text patterns
  if (expectations.contains_text) {
    for (const { file, pattern } of expectations.contains_text) {
      const error = assertContainsText(file, pattern, agentDir);
      if (error) errors.push(error);
    }
  }

  return {
    passed: errors.length === 0,
    errors
  };
}

/**
 * Get nested value from object using dot notation.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
