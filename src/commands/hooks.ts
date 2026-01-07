/**
 * Git hooks management for Runr provenance.
 *
 * Commands:
 * - runr hooks install: Create hook scripts in .git/hooks/
 * - runr hooks uninstall: Remove hooks and restore backups
 * - runr hooks status: Show installed state
 * - runr hooks check-commit: Check commit against run state (internal)
 */

import fs from 'node:fs';
import path from 'node:path';

export interface HooksConfig {
  installed_at: string;
  hooks: string[];
  backup_suffix: string;
}

export interface ActiveRunState {
  run_id: string | null;
  status: 'RUNNING' | 'STOPPED' | 'NONE';
  stop_reason?: string;
  updated_at: string;
}

const HOOK_SCRIPTS: Record<string, string> = {
  'commit-msg': `#!/bin/bash
# Runr provenance hook - installed by 'runr hooks install'
if command -v runr &> /dev/null; then
  runr hooks check-commit "$1"
fi
# Always allow commit if runr not available
exit 0
`
};

const BACKUP_SUFFIX = '.runr-backup';

function getGitHooksDir(repoPath: string): string | null {
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return null;
  }
  return path.join(gitDir, 'hooks');
}

function getHooksConfigPath(repoPath: string): string {
  return path.join(repoPath, '.runr', 'hooks.json');
}

function getActiveStatePath(repoPath: string): string {
  return path.join(repoPath, '.runr', 'active.json');
}

function loadHooksConfig(repoPath: string): HooksConfig | null {
  const configPath = getHooksConfigPath(repoPath);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveHooksConfig(repoPath: string, config: HooksConfig): void {
  const configPath = getHooksConfigPath(repoPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load active run state from sentinel file.
 */
export function loadActiveState(repoPath: string): ActiveRunState {
  const statePath = getActiveStatePath(repoPath);
  if (!fs.existsSync(statePath)) {
    return {
      run_id: null,
      status: 'NONE',
      updated_at: new Date().toISOString()
    };
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    return {
      run_id: null,
      status: 'NONE',
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Update active run state sentinel file.
 */
export function updateActiveState(repoPath: string, state: Partial<ActiveRunState>): void {
  const current = loadActiveState(repoPath);
  const updated: ActiveRunState = {
    ...current,
    ...state,
    updated_at: new Date().toISOString()
  };

  const statePath = getActiveStatePath(repoPath);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(updated, null, 2));
}

/**
 * Clear active run state (set to NONE).
 */
export function clearActiveState(repoPath: string): void {
  updateActiveState(repoPath, {
    run_id: null,
    status: 'NONE',
    stop_reason: undefined
  });
}

export interface HooksInstallOptions {
  repo: string;
}

/**
 * Install Runr git hooks.
 */
export async function installCommand(options: HooksInstallOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  // Check for .git directory
  const hooksDir = getGitHooksDir(repoPath);
  if (!hooksDir) {
    console.error('Error: Not a git repository (no .git directory found)');
    process.exitCode = 1;
    return;
  }

  // Ensure hooks directory exists
  fs.mkdirSync(hooksDir, { recursive: true });

  // Check if already installed
  const existingConfig = loadHooksConfig(repoPath);
  if (existingConfig) {
    console.log('Runr hooks already installed. Use "runr hooks status" to check.');
    return;
  }

  const installedHooks: string[] = [];

  // Install each hook
  for (const [hookName, hookScript] of Object.entries(HOOK_SCRIPTS)) {
    const hookPath = path.join(hooksDir, hookName);

    // Backup existing hook if present
    if (fs.existsSync(hookPath)) {
      const backupPath = hookPath + BACKUP_SUFFIX;
      fs.copyFileSync(hookPath, backupPath);
      console.log(`  Backed up existing ${hookName} to ${hookName}${BACKUP_SUFFIX}`);
    }

    // Write new hook
    fs.writeFileSync(hookPath, hookScript);
    fs.chmodSync(hookPath, '755');
    installedHooks.push(hookName);
    console.log(`  Installed ${hookName} hook`);
  }

  // Save config
  const config: HooksConfig = {
    installed_at: new Date().toISOString(),
    hooks: installedHooks,
    backup_suffix: BACKUP_SUFFIX
  };
  saveHooksConfig(repoPath, config);

  console.log('');
  console.log('Runr hooks installed. Use "runr hooks status" to check.');
}

export interface HooksUninstallOptions {
  repo: string;
}

/**
 * Uninstall Runr git hooks.
 */
export async function uninstallCommand(options: HooksUninstallOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  const hooksDir = getGitHooksDir(repoPath);
  if (!hooksDir) {
    console.error('Error: Not a git repository');
    process.exitCode = 1;
    return;
  }

  const config = loadHooksConfig(repoPath);
  if (!config) {
    console.log('Runr hooks not installed.');
    return;
  }

  // Remove each hook and restore backups
  for (const hookName of config.hooks) {
    const hookPath = path.join(hooksDir, hookName);
    const backupPath = hookPath + config.backup_suffix;

    // Remove Runr hook
    if (fs.existsSync(hookPath)) {
      fs.unlinkSync(hookPath);
      console.log(`  Removed ${hookName} hook`);
    }

    // Restore backup if exists
    if (fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, hookPath);
      console.log(`  Restored ${hookName} from backup`);
    }
  }

  // Remove config
  const configPath = getHooksConfigPath(repoPath);
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  console.log('');
  console.log('Runr hooks removed.');
}

export interface HooksStatusOptions {
  repo: string;
}

/**
 * Show git hooks status.
 */
export async function statusCommand(options: HooksStatusOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  const hooksDir = getGitHooksDir(repoPath);
  if (!hooksDir) {
    console.error('Error: Not a git repository');
    process.exitCode = 1;
    return;
  }

  const config = loadHooksConfig(repoPath);

  console.log('Runr Git Hooks Status');
  console.log('');

  if (!config) {
    console.log('  Status: NOT INSTALLED');
    console.log('');
    console.log('  Run "runr hooks install" to enable provenance tracking.');
    return;
  }

  console.log('  Status: INSTALLED');
  console.log(`  Installed: ${config.installed_at}`);
  console.log('');
  console.log('  Hooks:');

  for (const hookName of config.hooks) {
    const hookPath = path.join(hooksDir, hookName);
    const exists = fs.existsSync(hookPath);
    const icon = exists ? '✓' : '✗';
    console.log(`    ${icon} ${hookName}`);
  }

  // Show active run state
  const activeState = loadActiveState(repoPath);
  console.log('');
  console.log('  Active Run:');
  if (activeState.status === 'NONE') {
    console.log('    No active run');
  } else {
    console.log(`    Run ID: ${activeState.run_id}`);
    console.log(`    Status: ${activeState.status}`);
    if (activeState.stop_reason) {
      console.log(`    Stop Reason: ${activeState.stop_reason}`);
    }
  }
}

export interface CheckCommitOptions {
  repo: string;
  msgFile: string;
}

/**
 * Runr trailers that indicate proper attribution.
 */
const RUNR_TRAILERS = [
  /^Runr-Run-Id:\s*.+$/m,
  /^Runr-Intervention:\s*true$/m,
  /^Runr-Checkpoint:\s*true$/m
];

/**
 * Check if commit message has Runr trailers.
 */
function hasRunrTrailers(commitMessage: string): boolean {
  return RUNR_TRAILERS.some(pattern => pattern.test(commitMessage));
}

/**
 * Check if this is a merge commit (skip check).
 */
function isMergeCommit(msgFile: string): boolean {
  // Git uses specific filenames for merge commits
  const filename = path.basename(msgFile);
  return filename === 'MERGE_MSG' || filename === 'SQUASH_MSG';
}

/**
 * Get current workflow mode from config.
 */
function getWorkflowMode(repoPath: string): 'flow' | 'ledger' {
  const configPath = path.join(repoPath, '.runr', 'runr.config.json');
  if (!fs.existsSync(configPath)) {
    return 'flow'; // Default to flow mode
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.workflow?.mode === 'ledger' ? 'ledger' : 'flow';
  } catch {
    return 'flow';
  }
}

/**
 * Check commit against run state (called by git hook).
 *
 * Mode-aware behavior:
 * - Flow mode: warn but allow commits without attribution
 * - Ledger mode: block commits without attribution
 */
export async function checkCommitCommand(options: CheckCommitOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);

  // Skip check for merge commits
  if (isMergeCommit(options.msgFile)) {
    process.exitCode = 0;
    return;
  }

  // Check if .runr directory exists
  const runrDir = path.join(repoPath, '.runr');
  if (!fs.existsSync(runrDir)) {
    process.exitCode = 0;
    return;
  }

  // Load active state
  const activeState = loadActiveState(repoPath);

  // If no stopped run, allow
  if (activeState.status !== 'STOPPED') {
    process.exitCode = 0;
    return;
  }

  // Read commit message
  let commitMessage = '';
  try {
    commitMessage = fs.readFileSync(options.msgFile, 'utf-8');
  } catch {
    // Can't read commit message, fail open
    process.exitCode = 0;
    return;
  }

  // Check for Runr trailers
  if (hasRunrTrailers(commitMessage)) {
    // Properly attributed commit, allow
    process.exitCode = 0;
    return;
  }

  // Check for override environment variable
  const allowGap = process.env.RUNR_ALLOW_GAP === '1';

  // Get workflow mode
  const mode = getWorkflowMode(repoPath);

  // Format the provenance warning/error message
  const formatMessage = (isError: boolean) => {
    const icon = isError ? '❌' : '⚠️';
    const title = isError
      ? 'Provenance required (Ledger mode)'
      : 'Provenance gap detected';

    console.error('');
    console.error(`${icon}  ${title}`);
    console.error('');
    console.error(`Run ${activeState.run_id} is STOPPED (${activeState.stop_reason || 'unknown'}).`);
    console.error('This commit has no Runr attribution.');
    console.error('');
    console.error('To add attribution:');
    console.error(`  runr intervene ${activeState.run_id} --reason ${activeState.stop_reason || 'manual'} \\`);
    console.error('    --note "description" --commit "your message"');
    console.error('');

    if (isError) {
      console.error('To override (not recommended):');
      console.error('  RUNR_ALLOW_GAP=1 git commit ...');
      console.error('  # or: git commit --no-verify');
      console.error('');
    } else {
      console.error('Proceeding anyway (Flow mode).');
      console.error('');
    }
  };

  if (mode === 'ledger' && !allowGap) {
    // Ledger mode: block commit
    formatMessage(true);
    process.exitCode = 1;
  } else {
    // Flow mode or override: warn but allow
    formatMessage(false);
    process.exitCode = 0;
  }
}
