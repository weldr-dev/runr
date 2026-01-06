import { execa } from 'execa';
import path from 'node:path';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { AgentConfig, WorkflowConfig } from '../config/schema.js';

export interface SubmitOptions {
  repo: string;
  runId: string;
  to?: string;
  dryRun?: boolean;
  push?: boolean;
  config?: string;
}


type ValidationReason =
  | 'no_checkpoint'
  | 'run_not_ready'
  | 'verification_missing'
  | 'dirty_tree'
  | 'target_branch_missing'
  | 'git_error';

/**
 * Check if git object exists locally.
 */
async function objectExists(repoPath: string, sha: string): Promise<boolean> {
  try {
    await execa('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if branch exists.
 */
async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execa('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: repoPath
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if working tree is clean.
 */
async function isWorkingTreeClean(repoPath: string): Promise<boolean> {
  const result = await execa('git', ['status', '--porcelain'], { cwd: repoPath });
  return result.stdout.trim().length === 0;
}

/**
 * Get current branch name.
 */
async function getCurrentBranch(repoPath: string): Promise<string> {
  const result = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
  return result.stdout.trim();
}

/**
 * Get conflicted files (sorted alphabetically).
 */
async function getConflictedFiles(repoPath: string): Promise<string[]> {
  try {
    const result = await execa('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd: repoPath
    });
    return result.stdout
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Emit validation failure event and exit.
 */
function failValidation(
  runStore: RunStore,
  runId: string,
  reason: ValidationReason,
  details: string
): void {
  runStore.appendEvent({
    type: 'submit_validation_failed',
    source: 'submit',
    payload: {
      run_id: runId,
      reason,
      details
    }
  });

  console.error(`Submit blocked: ${reason}`);
  console.error(details);
  process.exitCode = 1;
}

/**
 * Submit command: Cherry-pick verified checkpoint to integration branch.
 */
export async function submitCommand(options: SubmitOptions): Promise<void> {
  const runStore = RunStore.init(options.runId, options.repo);

  // Load run state
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    console.error(`Error: run state not found for ${options.runId}`);
    process.exitCode = 1;
    return;
  }

  // Load config with workflow settings
  const config = loadConfig(resolveConfigPath(options.repo, options.config));

  // Get workflow config (use safe defaults if not configured)
  const workflow: WorkflowConfig = config.workflow ?? {
    profile: 'solo',
    integration_branch: 'dev',
    require_clean_tree: true,
    require_verification: true,
    submit_strategy: 'cherry-pick'
  };

  // Validation: checkpoint exists in state
  const checkpointSha = state.checkpoint_commit_sha;
  if (!checkpointSha) {
    failValidation(runStore, options.runId, 'no_checkpoint', 'Run has no checkpoint_commit_sha in state.json');
    return;
  }

  // Validation: checkpoint exists as git object
  if (!(await objectExists(options.repo, checkpointSha))) {
    failValidation(
      runStore,
      options.runId,
      'run_not_ready',
      `Checkpoint commit not found locally: ${checkpointSha}`
    );
    return;
  }

  // Validation: verification evidence (if required)
  if (workflow.require_verification) {
    if (!state.last_verification_evidence) {
      failValidation(
        runStore,
        options.runId,
        'verification_missing',
        'Verification required but last_verification_evidence is missing'
      );
      return;
    }
  }

  // Validation: clean working tree (if required)
  if (workflow.require_clean_tree) {
    if (!(await isWorkingTreeClean(options.repo))) {
      failValidation(
        runStore,
        options.runId,
        'dirty_tree',
        'Working tree is not clean (uncommitted changes present)'
      );
      return;
    }
  }

  // Validation: target branch exists
  const targetBranch = options.to ?? workflow.integration_branch;
  if (!(await branchExists(options.repo, targetBranch))) {
    failValidation(
      runStore,
      options.runId,
      'target_branch_missing',
      `Target branch does not exist: ${targetBranch}`
    );
    return;
  }

  // DRY RUN: print plan and exit (no events, no changes)
  if (options.dryRun) {
    console.log('Submit plan (dry-run):');
    console.log(`  run_id: ${options.runId}`);
    console.log(`  checkpoint: ${checkpointSha}`);
    console.log(`  target: ${targetBranch}`);
    console.log(`  strategy: cherry-pick`);
    console.log(`  push: ${options.push ? 'yes' : 'no'}`);
    return;
  }

  // Capture starting branch for restoration
  const startingBranch = await getCurrentBranch(options.repo);

  try {
    // Checkout target branch
    await execa('git', ['checkout', targetBranch], { cwd: options.repo });

    // Cherry-pick checkpoint
    try {
      await execa('git', ['cherry-pick', checkpointSha], { cwd: options.repo });
    } catch {
      // Get conflicted files
      const conflictedFiles = await getConflictedFiles(options.repo);

      // Abort cherry-pick
      try {
        await execa('git', ['cherry-pick', '--abort'], { cwd: options.repo });
      } catch {
        // Ignore abort errors
      }

      // Restore starting branch (best-effort)
      try {
        await execa('git', ['checkout', startingBranch], { cwd: options.repo });
      } catch {
        // Ignore restoration errors
      }

      // Emit conflict event
      runStore.appendEvent({
        type: 'submit_conflict',
        source: 'submit',
        payload: {
          run_id: options.runId,
          checkpoint_sha: checkpointSha,
          target_branch: targetBranch,
          conflicted_files: conflictedFiles
        }
      });

      // Verify tree is actually clean after abort
      const treeClean = await isWorkingTreeClean(options.repo);
      const currentBranch = await getCurrentBranch(options.repo);
      const branchRestored = currentBranch === startingBranch;

      // Print conflict message with recovery recipe
      console.error('');
      console.error('⚠️  Submit conflict');
      console.error('');
      console.error(`Files:  ${conflictedFiles.join(', ')}`);
      console.error('');

      if (branchRestored && treeClean) {
        console.error('Branch restored. Tree is clean.');
      } else if (!branchRestored) {
        console.error(`⚠️  Warning: Could not restore to ${startingBranch}. Currently on ${currentBranch}.`);
      } else if (!treeClean) {
        console.error('⚠️  Warning: Tree is not clean after abort. Run: git status');
      }

      console.error('');
      console.error('Resolve manually:');
      console.error(`  git checkout ${targetBranch}`);
      console.error(`  git cherry-pick ${checkpointSha}`);
      console.error('  # fix conflicts');
      console.error('  git add . && git commit --no-edit');

      // Tip for CHANGELOG conflicts (common pattern)
      if (conflictedFiles.some(f => f.toLowerCase().includes('changelog'))) {
        console.error('');
        console.error('Tip: Conflicts are common on CHANGELOG.md; consider moving');
        console.error('     changelog updates into a dedicated task.');
      }

      console.error('');
      process.exitCode = 1;
      return;
    }

    // Push to origin (if requested)
    if (options.push) {
      try {
        await execa('git', ['push', 'origin', targetBranch], { cwd: options.repo });
      } catch (error) {
        console.error('Warning: cherry-pick succeeded but push failed');
        console.error(String(error));
        // Don't fail - cherry-pick succeeded, which is the primary goal
      }
    }

    // Emit success event
    runStore.appendEvent({
      type: 'run_submitted',
      source: 'submit',
      payload: {
        run_id: options.runId,
        checkpoint_sha: checkpointSha,
        target_branch: targetBranch,
        strategy: 'cherry-pick',
        submitted_at: new Date().toISOString()
      }
    });

    console.log(`✓ Submitted ${checkpointSha} to ${targetBranch}`);
  } catch (error) {
    // Git error (not conflict)
    failValidation(runStore, options.runId, 'git_error', `Git error: ${String(error)}`);
    return;
  } finally {
    // Always restore starting branch (best-effort)
    try {
      const currentBranch = await getCurrentBranch(options.repo);
      if (currentBranch !== startingBranch) {
        await execa('git', ['checkout', startingBranch], { cwd: options.repo });
      }
    } catch {
      // Ignore restoration errors (best-effort)
    }
  }
}
