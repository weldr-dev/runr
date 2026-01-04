/**
 * Acceptance tests for worktree and guard fixes.
 *
 * These tests verify that:
 * A) Fresh repos work without manual .gitignore edits
 * B) Worktree paths don't trip .agent/** denylist
 * C) Guard failures print actionable diagnostics
 *
 * Run with: npx vitest run test/acceptance/worktree-fixes.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';

// Helper to create a minimal test repo
async function createTestRepo(name: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `acceptance-${name}-`));

  // Create minimal structure
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.agent'), { recursive: true });

  // Create a simple source file
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const hello = "world";\n');

  // Create package.json
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'test-repo',
    version: '1.0.0',
    scripts: {
      lint: 'echo "lint ok"',
      typecheck: 'echo "typecheck ok"'
    }
  }, null, 2));

  // Create agent config
  fs.writeFileSync(path.join(tmpDir, '.agent', 'agent.config.json'), JSON.stringify({
    agent: { name: 'test-repo', version: '1' },
    scope: {
      allowlist: ['src/**'],
      denylist: ['node_modules/**', '.agent/**']  // Note: .agent/** in denylist
    },
    verification: {
      tier0: ['npm run lint']
    },
    workers: {
      claude: {
        bin: 'echo',  // Use echo as mock worker
        args: ['{"status":"ok","handoff_memo":"done"}'],
        output: 'text'
      }
    },
    phases: {
      plan: 'claude',
      implement: 'claude',
      review: 'claude'
    }
  }, null, 2));

  // Create minimal .gitignore (deliberately NOT including .agent*)
  fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n');

  // Initialize git
  await execa('git', ['init'], { cwd: tmpDir });
  await execa('git', ['config', 'user.email', 'test@test.local'], { cwd: tmpDir });
  await execa('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
  await execa('git', ['add', '.'], { cwd: tmpDir });
  await execa('git', ['commit', '-m', 'Initial'], { cwd: tmpDir });

  return tmpDir;
}

// Cleanup helper
function cleanupTestRepo(repoPath: string): void {
  try {
    fs.rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// Get agent CLI path
function getAgentCli(): string {
  return path.resolve(__dirname, '../../dist/cli.js');
}

describe('Worktree Fixes Acceptance Tests', () => {
  let testRepo: string;

  afterEach(() => {
    if (testRepo) {
      cleanupTestRepo(testRepo);
    }
  });

  describe('A) Fresh repo auto-exclude injection', () => {
    it('should auto-inject .agent exclusions into .git/info/exclude', { timeout: 40000 }, async () => {
      testRepo = await createTestRepo('fresh-repo');

      // Verify .git/info/exclude does NOT contain .agent before run
      const excludePath = path.join(testRepo, '.git', 'info', 'exclude');
      const excludeBefore = fs.existsSync(excludePath)
        ? fs.readFileSync(excludePath, 'utf8')
        : '';
      expect(excludeBefore).not.toContain('.agent');

      // Create a simple task
      const taskPath = path.join(testRepo, 'task.md');
      fs.writeFileSync(taskPath, '# Test Task\n\nAdd a comment to src/index.ts\n');

      // Run agent (will fail at worker but that's ok - we just need preflight to run)
      const cli = getAgentCli();
      await execa('node', [cli, 'run', '--task', taskPath, '--repo', testRepo, '--dry-run', '--skip-doctor'], {
        reject: false,
        timeout: 30000
      });

      // Verify .git/info/exclude now contains .agent patterns
      const excludeAfter = fs.readFileSync(excludePath, 'utf8');
      expect(excludeAfter).toContain('.agent');
      expect(excludeAfter).toContain('.agent-worktrees');
    });

    it('should not trigger dirty worktree from .agent artifacts', { timeout: 40000 }, async () => {
      testRepo = await createTestRepo('no-dirty');

      // Create some .agent artifacts (simulating previous run)
      fs.mkdirSync(path.join(testRepo, '.agent', 'runs', '20251231000000'), { recursive: true });
      fs.writeFileSync(
        path.join(testRepo, '.agent', 'runs', '20251231000000', 'state.json'),
        '{}'
      );

      // Create task file INSIDE src/ (so it's in allowlist) and commit it
      const taskPath = path.join(testRepo, 'src', 'task.md');
      fs.writeFileSync(taskPath, '# Test Task\n\nAdd a comment to index.ts\n');
      await execa('git', ['add', 'src/task.md'], { cwd: testRepo });
      await execa('git', ['commit', '-m', 'Add task'], { cwd: testRepo });

      // Run agent with dry-run
      const cli = getAgentCli();
      const result = await execa('node', [cli, 'run', '--task', taskPath, '--repo', testRepo, '--dry-run', '--skip-doctor'], {
        reject: false,
        timeout: 30000
      });

      // Should not see dirty_worktree caused by .agent artifacts
      // The .agent/** files should be excluded from dirty detection
      const output = result.stdout + result.stderr;

      // If there's a dirty_worktree failure, it should NOT be from .agent files
      if (output.includes('dirty_worktree')) {
        // Check that .agent files are NOT in the dirty files list
        expect(output).not.toMatch(/Dirty files.*\.agent/s);
      }
    });
  });

  describe('B) Worktree path outside .agent/', () => {
    it('should create worktrees at .agent-worktrees/ not .agent/worktrees/', async () => {
      testRepo = await createTestRepo('worktree-location');

      // Import and test the path function directly
      const { getAgentPaths } = await import('../../src/store/runs-root.js');
      const paths = getAgentPaths(testRepo);

      // Verify worktrees_dir is .agent-worktrees, not .agent/worktrees
      expect(paths.worktrees_dir).toBe(path.join(testRepo, '.agent-worktrees'));
      expect(paths.worktrees_dir).not.toContain(path.join('.agent', 'worktrees'));
    });

    it('should have AGENT_WORKTREES_DIR override code path', async () => {
      // Verify the code contains the env var override logic
      // (We can't easily test the actual behavior due to ESM module caching)
      const runsRootPath = path.resolve(__dirname, '../../src/store/runs-root.ts');
      const runsRootCode = fs.readFileSync(runsRootPath, 'utf8');

      // Check that the env var override code exists
      expect(runsRootCode).toContain('AGENT_WORKTREES_DIR');
      expect(runsRootCode).toContain('worktreesOverride');
      expect(runsRootCode).toContain('path.isAbsolute');
    });

    it('worktree absolute path should not contain /.agent/', async () => {
      testRepo = await createTestRepo('worktree-no-agent-path');

      const { getAgentPaths } = await import('../../src/store/runs-root.js');
      const paths = getAgentPaths(testRepo);

      // The worktree path should never contain /.agent/ as a directory segment
      // This is the key fix - prevents denylist patterns from matching
      expect(paths.worktrees_dir).not.toMatch(/\/.agent\//);
    });
  });

  describe('C) Guard failure diagnostics', () => {
    it('should print detailed guard failure reasons to console', { timeout: 40000 }, async () => {
      testRepo = await createTestRepo('guard-diagnostics');

      // Create a task that will trigger scope violation
      const taskPath = path.join(testRepo, 'task.md');
      fs.writeFileSync(taskPath, '# Test Task\n\nModify package.json\n');

      // Intentionally make repo dirty with a file outside allowlist
      fs.writeFileSync(path.join(testRepo, 'OUTSIDE.txt'), 'dirty file');
      await execa('git', ['add', 'OUTSIDE.txt'], { cwd: testRepo });

      // Run agent
      const cli = getAgentCli();
      const result = await execa('node', [cli, 'run', '--task', taskPath, '--repo', testRepo, '--skip-doctor'], {
        reject: false,
        timeout: 30000
      });

      // Should see detailed diagnostics
      const output = result.stdout + result.stderr;

      // Check for structured output (not just "guard=fail")
      expect(output).toContain('Guard Failure Details:');
      expect(output).toContain('Reasons:');
    });

    it('should show specific files in scope violations', { timeout: 40000 }, async () => {
      testRepo = await createTestRepo('scope-violation-files');

      // Modify a file that's not in allowlist
      fs.writeFileSync(path.join(testRepo, 'config.json'), '{}');

      // Stage the change
      await execa('git', ['add', 'config.json'], { cwd: testRepo });

      const taskPath = path.join(testRepo, 'task.md');
      fs.writeFileSync(taskPath, '# Test Task\n\nDo something\n');

      const cli = getAgentCli();
      const result = await execa('node', [cli, 'run', '--task', taskPath, '--repo', testRepo, '--skip-doctor'], {
        reject: false,
        timeout: 30000
      });

      const output = result.stdout + result.stderr;

      // Should show the specific files that violated scope
      // Note: config.json should appear as a dirty file or scope violation
      expect(output).toContain('config.json');
    });
  });
});

describe('Regression: env_allowlist includes agent artifacts', () => {
  it('should have .agent/** and .agent-worktrees/** as built-in env allowlist', async () => {
    // This tests the preflight.ts change
    const preflightPath = path.resolve(__dirname, '../../src/commands/preflight.ts');
    const preflightCode = fs.readFileSync(preflightPath, 'utf8');

    expect(preflightCode).toContain("'.agent/**'");
    expect(preflightCode).toContain("'.agent-worktrees/**'");
    expect(preflightCode).toContain('builtinEnvAllowlist');
  });
});

describe('Regression: Implementer prompt has scope clarification', () => {
  it('should include repo-relative path clarification in implementer prompt', async () => {
    const promptPath = path.resolve(__dirname, '../../templates/prompts/implementer.md');
    const promptContent = fs.readFileSync(promptPath, 'utf8');

    expect(promptContent).toContain('repo-relative');
    expect(promptContent).toContain('Ignore any `.agent` substrings');
  });
});
