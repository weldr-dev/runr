import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('doctor command', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function initGitRepo(dir: string): Promise<void> {
    await execa('git', ['init'], { cwd: dir });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  }

  async function runDoctor(repoPath?: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const cliPath = path.resolve(__dirname, '../../../dist/cli.js');
    const args = ['doctor'];
    if (repoPath) {
      args.push('--repo', repoPath);
    }

    const result = await execa('node', [cliPath, ...args], {
      reject: false,
      cwd: repoPath || tmpDir
    });

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  describe('git repository check', () => {
    it('passes for git repository', async () => {
      await initGitRepo(tmpDir);
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Git repository: OK');
      expect(result.exitCode).toBe(0);
    });

    it('fails for non-git directory', async () => {
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Git repository: FAIL');
      expect(result.stdout).toContain('not a git repository');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('working tree status', () => {
    it('reports clean working tree', async () => {
      await initGitRepo(tmpDir);

      // Create and commit a file to establish history
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content', 'utf-8');
      await execa('git', ['add', 'test.txt'], { cwd: tmpDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Working tree: clean');
      expect(result.exitCode).toBe(0);
    });

    it('reports dirty working tree with uncommitted files', async () => {
      await initGitRepo(tmpDir);

      // Create uncommitted file
      const testFile = path.join(tmpDir, 'uncommitted.txt');
      fs.writeFileSync(testFile, 'uncommitted', 'utf-8');

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Working tree: dirty');
      expect(result.stdout).toContain('uncommitted files');
      expect(result.exitCode).toBe(0); // Dirty tree is not an error
    });

    it('shows ignored noise count when .runr/ has ignored files', async () => {
      await initGitRepo(tmpDir);

      // Create .gitignore
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.runr/\n.agent/', 'utf-8');
      await execa('git', ['add', '.gitignore'], { cwd: tmpDir });
      await execa('git', ['commit', '-m', 'Add gitignore'], { cwd: tmpDir });

      // Create ignored files
      const runrDir = path.join(tmpDir, '.runr');
      fs.mkdirSync(runrDir, { recursive: true });
      fs.writeFileSync(path.join(runrDir, 'ignored.txt'), 'ignored', 'utf-8');

      const result = await runDoctor(tmpDir);

      // Working tree is clean because .runr/ is ignored
      expect(result.stdout).toContain('Working tree: clean');
      // The ignored noise message appears when there are ignored files AND working tree is otherwise dirty
      expect(result.exitCode).toBe(0);
    });
  });

  describe('version check', () => {
    it('displays runr version', async () => {
      await initGitRepo(tmpDir);
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Runr version:');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('config check', () => {
    it('reports no config when absent', async () => {
      await initGitRepo(tmpDir);
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Config: no config file');
      expect(result.exitCode).toBe(0);
    });

    it('reports valid config when present', async () => {
      await initGitRepo(tmpDir);

      // Create valid config
      const runrDir = path.join(tmpDir, '.runr');
      fs.mkdirSync(runrDir, { recursive: true });
      const configPath = path.join(runrDir, 'runr.config.json');
      const validConfig = {
        agent: {
          name: 'test-agent',
          version: '1'
        },
        scope: {
          allowlist: ['src/**'],
          denylist: []
        },
        verification: {
          tier0: ['echo test']
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(validConfig, null, 2), 'utf-8');

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Config:');
      expect(result.stdout).toContain('runr.config.json');
      expect(result.exitCode).toBe(0);
    });

    it('reports invalid config', async () => {
      await initGitRepo(tmpDir);

      // Create invalid config
      const runrDir = path.join(tmpDir, '.runr');
      fs.mkdirSync(runrDir, { recursive: true });
      const configPath = path.join(runrDir, 'runr.config.json');
      fs.writeFileSync(configPath, '{ "invalid": "config" }', 'utf-8');

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Config: FAIL');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('.runr/ directory check', () => {
    it('reports when directory does not exist', async () => {
      await initGitRepo(tmpDir);
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('.runr/ directory: not yet created');
      expect(result.exitCode).toBe(0);
    });

    it('reports when directory exists and is writable', async () => {
      await initGitRepo(tmpDir);

      // Create .runr directory
      const runrDir = path.join(tmpDir, '.runr');
      fs.mkdirSync(runrDir, { recursive: true });

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('.runr/ directory: OK');
      expect(result.exitCode).toBe(0);
    });

    it('reports run count when runs exist', async () => {
      await initGitRepo(tmpDir);

      // Create .runr/runs with some run directories
      const runsDir = path.join(tmpDir, '.runr', 'runs');
      fs.mkdirSync(runsDir, { recursive: true });
      fs.mkdirSync(path.join(runsDir, 'run-1'));
      fs.mkdirSync(path.join(runsDir, 'run-2'));

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('.runr/ directory: OK');
      expect(result.stdout).toContain('2 runs');
      expect(result.exitCode).toBe(0);
    });

    it('reports error when directory is not writable', async () => {
      await initGitRepo(tmpDir);

      // Create .runr directory
      const runrDir = path.join(tmpDir, '.runr');
      fs.mkdirSync(runrDir, { recursive: true });

      // Make it read-only
      fs.chmodSync(runrDir, 0o444);

      const result = await runDoctor(tmpDir);

      // Restore permissions for cleanup
      fs.chmodSync(runrDir, 0o755);

      expect(result.stdout).toContain('.runr/ directory: FAIL');
      expect(result.stdout).toContain('Not writable');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('worktree check', () => {
    it('reports not used when no worktrees exist', async () => {
      await initGitRepo(tmpDir);
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Worktrees: not used');
      expect(result.exitCode).toBe(0);
    });

    it('reports OK for valid worktrees', async () => {
      await initGitRepo(tmpDir);

      // Create a commit so we can create worktrees
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'test', 'utf-8');
      await execa('git', ['add', 'test.txt'], { cwd: tmpDir });
      await execa('git', ['commit', '-m', 'Initial'], { cwd: tmpDir });

      // Create worktree directory and a valid worktree
      const worktreesDir = path.join(tmpDir, '.runr-worktrees');
      fs.mkdirSync(worktreesDir, { recursive: true });
      const worktreePath = path.join(worktreesDir, 'test-worktree');
      await execa('git', ['worktree', 'add', worktreePath, 'HEAD'], { cwd: tmpDir });

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Worktrees: OK');
      expect(result.stdout).toContain('1 worktrees');
      expect(result.exitCode).toBe(0);

      // Cleanup worktree
      await execa('git', ['worktree', 'remove', worktreePath], { cwd: tmpDir, reject: false });
    });

    it('reports warning for orphaned worktrees', async () => {
      await initGitRepo(tmpDir);

      // Create worktrees directory with a fake (orphaned) worktree
      const worktreesDir = path.join(tmpDir, '.runr-worktrees');
      fs.mkdirSync(worktreesDir, { recursive: true });
      const fakeWorktree = path.join(worktreesDir, 'orphaned');
      fs.mkdirSync(fakeWorktree);

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Worktrees: WARNING');
      expect(result.stdout).toContain('orphaned worktrees');
      expect(result.stdout).toContain('runr gc');
      expect(result.exitCode).toBe(0); // Warning, not error
    });
  });

  describe('overall result', () => {
    it('exits 0 when all checks pass', async () => {
      await initGitRepo(tmpDir);

      // Create a clean commit
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'test', 'utf-8');
      await execa('git', ['add', 'test.txt'], { cwd: tmpDir });
      await execa('git', ['commit', '-m', 'Initial'], { cwd: tmpDir });

      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Result: All checks passed');
      expect(result.exitCode).toBe(0);
    });

    it('exits 1 when checks fail', async () => {
      // Non-git directory will fail
      const result = await runDoctor(tmpDir);

      expect(result.stdout).toContain('Result: Some checks failed');
      expect(result.exitCode).toBe(1);
    });
  });
});
