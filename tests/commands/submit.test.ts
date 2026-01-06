import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Smoke tests for runr submit command.
 *
 * Tests basic functionality:
 * - Dry-run mode shows plan without making changes
 * - Validation fails on missing checkpoint
 * - Validation fails on dirty tree
 * - Successful cherry-pick creates timeline event
 * - Branch restoration works
 */
describe('runr submit', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'submit-test-'));
    repoPath = path.join(tmpDir, 'test-repo');

    // Initialize git repo
    await fs.mkdir(repoPath, { recursive: true });
    await execa('git', ['init'], { cwd: repoPath });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: repoPath });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });

    // Create initial commit with gitignore
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Test\n');
    await fs.writeFile(path.join(repoPath, '.gitignore'), '.runr/\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'initial commit'], { cwd: repoPath });

    // Create main branch
    await execa('git', ['branch', '-M', 'main'], { cwd: repoPath });
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should show plan in dry-run mode without making changes', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-submit-1';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create feature commit on dev branch
    await execa('git', ['checkout', '-b', 'dev'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state (no verification required for this test)
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config with no verification required
    const config = {
      agent: {
        name: 'test-agent',
        version: '1'
      },
      scope: {
        allowlist: ['**/*.ts'],
        denylist: [],
        lockfiles: [],
        presets: [],
        env_allowlist: []
      },
      verification: {
        tier0: [],
        tier1: [],
        tier2: [],
        risk_triggers: [],
        max_verify_time_per_milestone: 600
      },
      workflow: {
        profile: 'pr',
        integration_branch: 'main',
        require_verification: false,
        require_clean_tree: true,
        submit_strategy: 'cherry-pick'
      }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Get main branch SHA before dry-run
    await execa('git', ['checkout', 'main'], { cwd: repoPath });
    const { stdout: beforeSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Run submit in dry-run mode
    const { stdout } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'submit', runId, '--repo', repoPath, '--dry-run']
    );

    // Verify output shows plan
    expect(stdout).toContain('Submit plan (dry-run):');
    expect(stdout).toContain(`run_id: ${runId}`);
    expect(stdout).toContain('checkpoint:');
    expect(stdout).toContain('target: main');
    expect(stdout).toContain('strategy: cherry-pick');

    // Verify no changes were made
    const { stdout: afterSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });
    expect(afterSha).toBe(beforeSha);

    // Verify no timeline events were written
    const timelineContent = await fs.readFile(path.join(runDir, 'timeline.jsonl'), 'utf-8');
    expect(timelineContent).toBe('');
  });

  it('should fail validation when checkpoint is missing', async () => {
    // Setup: Create run without checkpoint
    const runId = 'test-run-submit-2';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create run state without checkpoint
    const state = {
      run_id: runId
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config
    const config = {
      agent: {
        name: 'test-agent',
        version: '1'
      },
      scope: {
        allowlist: ['**/*.ts'],
        denylist: [],
        lockfiles: [],
        presets: [],
        env_allowlist: []
      },
      verification: {
        tier0: [],
        tier1: [],
        tier2: [],
        risk_triggers: [],
        max_verify_time_per_milestone: 600
      },
      workflow: {
        profile: 'pr',
        integration_branch: 'main',
        require_verification: false,
        require_clean_tree: true,
        submit_strategy: 'cherry-pick'
      }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Run submit and expect failure
    try {
      await execa(
        'node',
        [path.join(process.cwd(), 'dist/cli.js'), 'submit', runId, '--repo', repoPath]
      );
      expect.fail('Should have thrown error');
    } catch (error: any) {
      // Command should fail
      expect(error.exitCode).toBe(1);
    }

    // Verify validation_failed event was written
    const timelineContent = await fs.readFile(path.join(runDir, 'timeline.jsonl'), 'utf-8');
    expect(timelineContent).toContain('submit_validation_failed');
    expect(timelineContent).toContain('no_checkpoint');
  });

  it('should fail validation when working tree is dirty', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-submit-3';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create feature commit
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state (no verification required)
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config with no verification required
    const config = {
      agent: {
        name: 'test-agent',
        version: '1'
      },
      scope: {
        allowlist: ['**/*.ts'],
        denylist: [],
        lockfiles: [],
        presets: [],
        env_allowlist: []
      },
      verification: {
        tier0: [],
        tier1: [],
        tier2: [],
        risk_triggers: [],
        max_verify_time_per_milestone: 600
      },
      workflow: {
        profile: 'pr',
        integration_branch: 'main',
        require_verification: false,
        require_clean_tree: true,
        submit_strategy: 'cherry-pick'
      }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Create dirty working tree
    await fs.writeFile(path.join(repoPath, 'dirty.txt'), 'uncommitted change\n');

    // Run submit and expect failure
    try {
      await execa(
        'node',
        [path.join(process.cwd(), 'dist/cli.js'), 'submit', runId, '--repo', repoPath]
      );
      expect.fail('Should have thrown error');
    } catch (error: any) {
      // Command should fail
      expect(error.exitCode).toBe(1);
    }

    // Verify validation_failed event was written
    const timelineContent = await fs.readFile(path.join(runDir, 'timeline.jsonl'), 'utf-8');
    expect(timelineContent).toContain('submit_validation_failed');
    expect(timelineContent).toContain('dirty_tree');
  });

  it('should successfully cherry-pick and write timeline event', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-submit-4';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create dev branch with feature
    await execa('git', ['checkout', '-b', 'dev'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state (no verification required)
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config with no verification required
    const config = {
      agent: {
        name: 'test-agent',
        version: '1'
      },
      scope: {
        allowlist: ['**/*.ts'],
        denylist: [],
        lockfiles: [],
        presets: [],
        env_allowlist: []
      },
      verification: {
        tier0: [],
        tier1: [],
        tier2: [],
        risk_triggers: [],
        max_verify_time_per_milestone: 600
      },
      workflow: {
        profile: 'pr',
        integration_branch: 'main',
        require_verification: false,
        require_clean_tree: true,
        submit_strategy: 'cherry-pick'
      }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Switch to main branch
    await execa('git', ['checkout', 'main'], { cwd: repoPath });

    // Run submit
    const { stdout } = await execa(
      'node',
      [path.join(process.cwd(), 'dist/cli.js'), 'submit', runId, '--repo', repoPath]
    );

    // Verify success message
    expect(stdout).toContain('✓ Submitted');
    expect(stdout).toContain(checkpointSha.trim());
    expect(stdout).toContain('main');

    // Verify feature file exists on main
    const featureExists = await fs
      .access(path.join(repoPath, 'feature.txt'))
      .then(() => true)
      .catch(() => false);
    expect(featureExists).toBe(true);

    // Verify run_submitted event was written
    const timelineContent = await fs.readFile(path.join(runDir, 'timeline.jsonl'), 'utf-8');
    expect(timelineContent).toContain('run_submitted');

    const event = JSON.parse(timelineContent.trim());
    expect(event.type).toBe('run_submitted');
    expect(event.payload.run_id).toBe(runId);
    expect(event.payload.checkpoint_sha).toBe(checkpointSha.trim());
    expect(event.payload.target_branch).toBe('main');
    expect(event.payload.strategy).toBe('cherry-pick');
  });

  it('should handle cherry-pick conflict with clean abort and recovery recipe', async () => {
    // Setup: Create run with checkpoint that will conflict
    const runId = 'test-run-submit-conflict';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create a file on main that will conflict
    await fs.writeFile(path.join(repoPath, 'CHANGELOG.md'), '# Changelog\n\n## v1.0.0\n- Initial\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'docs: add changelog'], { cwd: repoPath });

    // Create dev branch with conflicting change
    await execa('git', ['checkout', '-b', 'dev'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'CHANGELOG.md'), '# Changelog\n\n## v2.0.0\n- Breaking change\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'docs: update changelog for v2'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Make a different change on main that conflicts
    await execa('git', ['checkout', 'main'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'CHANGELOG.md'), '# Changelog\n\n## v1.1.0\n- Hotfix\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'docs: hotfix changelog'], { cwd: repoPath });

    // Go back to dev as starting branch
    await execa('git', ['checkout', 'dev'], { cwd: repoPath });

    // Create run state
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config
    const config = {
      agent: { name: 'test-agent', version: '1' },
      scope: { allowlist: ['**/*'], denylist: [], lockfiles: [], presets: [], env_allowlist: [] },
      verification: { tier0: [], tier1: [], tier2: [], risk_triggers: [], max_verify_time_per_milestone: 600 },
      workflow: { profile: 'pr', integration_branch: 'main', require_verification: false, require_clean_tree: true, submit_strategy: 'cherry-pick' }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(path.join(repoPath, '.runr', 'runr.config.json'), JSON.stringify(config, null, 2));
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Run submit and expect conflict
    let stderr = '';
    try {
      await execa('node', [path.join(process.cwd(), 'dist/cli.js'), 'submit', runId, '--repo', repoPath]);
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.exitCode).toBe(1);
      stderr = error.stderr;
    }

    // Invariant 1: Branch restored to starting branch (dev)
    const { stdout: currentBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
    expect(currentBranch.trim()).toBe('dev');

    // Invariant 2: Tree is clean (no leftover conflict markers)
    const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd: repoPath });
    expect(status.trim()).toBe('');

    // Invariant 3: Timeline event contains conflicted files
    const timelineContent = await fs.readFile(path.join(runDir, 'timeline.jsonl'), 'utf-8');
    expect(timelineContent).toContain('submit_conflict');
    const event = JSON.parse(timelineContent.trim());
    expect(event.type).toBe('submit_conflict');
    expect(event.payload.conflicted_files).toContain('CHANGELOG.md');

    // Invariant 4: Console output has recovery recipe with actual sha/branch
    expect(stderr).toContain('Submit conflict');
    expect(stderr).toContain('CHANGELOG.md');
    expect(stderr).toContain('Branch restored. Tree is clean.');
    expect(stderr).toContain('git checkout main');
    expect(stderr).toContain(`git cherry-pick ${checkpointSha.trim()}`);
    expect(stderr).toContain('Tip: Conflicts are common on CHANGELOG.md');
  });

  it('should restore starting branch after operation', async () => {
    // Setup: Create run with checkpoint
    const runId = 'test-run-submit-5';
    const runDir = path.join(repoPath, '.runr', 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Create dev branch with feature
    await execa('git', ['checkout', '-b', 'dev'], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, 'feature.txt'), 'new feature\n');
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', 'feat: add feature'], { cwd: repoPath });
    const { stdout: checkpointSha } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    // Create run state (no verification required)
    const state = {
      run_id: runId,
      checkpoint_commit_sha: checkpointSha.trim()
    };
    await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify(state, null, 2));

    // Create config with no verification required
    const config = {
      agent: {
        name: 'test-agent',
        version: '1'
      },
      scope: {
        allowlist: ['**/*.ts'],
        denylist: [],
        lockfiles: [],
        presets: [],
        env_allowlist: []
      },
      verification: {
        tier0: [],
        tier1: [],
        tier2: [],
        risk_triggers: [],
        max_verify_time_per_milestone: 600
      },
      workflow: {
        profile: 'pr',
        integration_branch: 'main',
        require_verification: false,
        require_clean_tree: true,
        submit_strategy: 'cherry-pick'
      }
    };
    await fs.mkdir(path.join(repoPath, '.runr'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create empty timeline
    await fs.writeFile(path.join(runDir, 'timeline.jsonl'), '');

    // Stay on dev branch
    const { stdout: beforeBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath
    });
    expect(beforeBranch.trim()).toBe('dev');

    // Run submit in dry-run mode (won't change anything)
    await execa(
      'node',
      [
        path.join(process.cwd(), 'dist/cli.js'),
        'submit',
        runId,
        '--repo',
        repoPath,
        '--dry-run'
      ]
    );

    // Verify branch was restored
    const { stdout: afterBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath
    });
    expect(afterBranch.trim()).toBe('dev');
  });
});
