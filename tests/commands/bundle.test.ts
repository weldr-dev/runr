import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Smoke tests for runr bundle command.
 *
 * Tests basic functionality:
 * - Bundle generates markdown output
 * - Bundle is deterministic (same output for same input)
 * - Bundle handles missing checkpoint gracefully
 */
describe('runr bundle', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-test-'));
    repoPath = path.join(tmpDir, 'test-repo');

    // Initialize git repo
    await fs.mkdir(repoPath, { recursive: true });
    await execa('git', ['init'], { cwd: repoPath });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });

    // Create initial commit
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Test\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'initial commit'], { cwd: repoPath });
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should generate markdown bundle for run with checkpoint', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-bundle-1';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create feature commit
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim(),
      last_verification_evidence: {
        success: true,
        tier: 'tier0',
        timestamp: new Date().toISOString()
      }
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create timeline events
    const events = [
      { type: 'run_started', source: 'run', timestamp: new Date().toISOString() },
      { type: 'checkpoint_created', source: 'verify', timestamp: new Date().toISOString() }
    ];
    await fs.writeFile(
      path.join(runDir, 'timeline.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    // Run bundle command
    const { stdout } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'runs', 'bundle', runId, '--repo', repoPath]
    );

    // Verify output
    expect(stdout).toContain(`# Run ${runId}`);
    expect(stdout).toContain('**Checkpoint:**');
    expect(stdout).toContain(checkpointSha.trim());
    expect(stdout).toContain('## Verification Evidence');
    expect(stdout).toContain('## Checkpoint Diffstat');
    expect(stdout).toContain('## Timeline Event Summary');
    expect(stdout).toContain('- checkpoint_created:');
    expect(stdout).toContain('- run_started:');
  });

  it('should be deterministic (same output for same input)', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-bundle-2';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create feature commit
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Run bundle twice
    const { stdout: output1 } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'runs', 'bundle', runId, '--repo', repoPath]
    );

    const { stdout: output2 } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'runs', 'bundle', runId, '--repo', repoPath]
    );

    // Outputs should be identical
    expect(output1).toBe(output2);
  });

  it('should handle missing checkpoint gracefully', async () => {
    // Setup: Create run without checkpoint
    const runId = 'test-run-bundle-3';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create run state without checkpoint
    const state = {
      run_id: runId
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Run bundle command
    const { stdout } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'runs', 'bundle', runId, '--repo', repoPath]
    );

    // Should show "none" for missing checkpoint
    expect(stdout).toContain('**Checkpoint:** none');
    expect(stdout).toContain('UNVERIFIED');
    expect(stdout).toContain('## Checkpoint Diffstat\nnone');
  });
});
