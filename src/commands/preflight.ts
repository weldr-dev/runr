import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { AgentConfig, WorkerConfig } from '../config/schema.js';
import { buildRepoContext } from '../repo/context.js';
import { checkLockfiles, checkScope, partitionChangedFiles } from '../supervisor/scope-guard.js';
import { selectTiersWithReasons } from '../supervisor/verification-policy.js';
import { RepoContext, RiskLevel, VerificationTier } from '../types/schemas.js';
import { pingClaude, PingResult } from '../workers/claude.js';
import { pingCodex } from '../workers/codex.js';

export interface BinaryCheckResult {
  worker: string;
  bin: string;
  ok: boolean;
  version?: string;
  error?: string;
}

/**
 * Check worker binary exists and can report version.
 * This is cheaper than ping (no API call).
 */
async function checkWorkerBinary(
  name: string,
  worker: WorkerConfig
): Promise<BinaryCheckResult> {
  try {
    const result = await execa(worker.bin, ['--version'], {
      timeout: 5000,
      reject: false
    });

    if (result.exitCode === 0) {
      const version = result.stdout.trim().split('\n')[0];
      return { worker: name, bin: worker.bin, ok: true, version };
    }

    return {
      worker: name,
      bin: worker.bin,
      ok: false,
      error: result.stderr || 'Version check failed'
    };
  } catch (err) {
    const error = err as Error;
    return {
      worker: name,
      bin: worker.bin,
      ok: false,
      error: error.message.includes('ENOENT')
        ? `Command not found: ${worker.bin}`
        : error.message
    };
  }
}

export interface PreflightOptions {
  repoPath: string;
  runId: string;
  slug: string;
  config: AgentConfig;
  allowDeps: boolean;
  allowDirty: boolean;
  milestoneRiskLevel: RiskLevel;
  skipPing?: boolean;
}

export interface GuardStatus {
  ok: boolean;
  reasons: string[];
  dirty: boolean;
  scope_violations: string[];
  lockfile_violations: string[];
  /** All files that were dirty (for diagnostics) */
  dirty_files: string[];
  /** Files matching env_allowlist (allowed noise) */
  env_touched: string[];
  /** True if dirty_files were all env artifacts (no semantic changes) */
  dirty_is_env_only: boolean;
}

export interface BinaryStatus {
  ok: boolean;
  results: BinaryCheckResult[];
}

export interface PingStatus {
  ok: boolean;
  skipped: boolean;
  results: PingResult[];
}

export interface PreflightResult {
  repo_context: RepoContext;
  guard: GuardStatus;
  binary: BinaryStatus;
  ping: PingStatus;
  tiers: VerificationTier[];
  tier_reasons: string[];
}

export async function runPreflight(
  options: PreflightOptions
): Promise<PreflightResult> {
  const repoContext = await buildRepoContext(
    options.repoPath,
    options.runId,
    options.slug,
    options.config.repo.default_branch ?? 'main'
  );

  // Partition changed files into env artifacts vs semantic changes
  // Env artifacts (node_modules, .next, .agent, etc.) are allowed noise
  // Built-in patterns ensure agent artifacts never trigger guard failures
  const builtinEnvAllowlist = ['.agent/**', '.agent-worktrees/**'];
  const effectiveEnvAllowlist = Array.from(
    new Set([...(options.config.scope.env_allowlist ?? []), ...builtinEnvAllowlist])
  );
  const { env_touched, semantic_changed } = partitionChangedFiles(
    repoContext.changed_files,
    effectiveEnvAllowlist
  );

  const dirty_files = repoContext.changed_files;
  const dirty_is_env_only = dirty_files.length > 0 && semantic_changed.length === 0;

  // "Dirty" means semantic dirty, not env noise
  const dirty = semantic_changed.length > 0;

  // Scope/lockfile checks should only consider semantic changes
  const scopeCheck = checkScope(
    semantic_changed,
    options.config.scope.allowlist,
    options.config.scope.denylist
  );
  const lockfileCheck = checkLockfiles(
    semantic_changed,
    options.config.scope.lockfiles,
    options.allowDeps
  );

  const reasons: string[] = [];
  if (dirty && !options.allowDirty) {
    reasons.push('dirty_worktree');
  }
  if (!scopeCheck.ok) {
    reasons.push('scope_violation');
  }
  if (!lockfileCheck.ok) {
    reasons.push('lockfile_violation');
  }

  // Check verification.cwd exists if specified
  if (options.config.verification.cwd) {
    const verifyCwd = path.join(options.repoPath, options.config.verification.cwd);
    if (!fs.existsSync(verifyCwd)) {
      reasons.push(`verification_cwd_missing:${options.config.verification.cwd}`);
    }
  }

  // Check worker binaries exist (cheaper than ping, catches "command not found")
  const workers = options.config.workers;
  const binaryCheckPromises: Promise<BinaryCheckResult>[] = [];
  if (workers.claude) {
    binaryCheckPromises.push(checkWorkerBinary('claude', workers.claude));
  }
  if (workers.codex) {
    binaryCheckPromises.push(checkWorkerBinary('codex', workers.codex));
  }
  const binaryResults = await Promise.all(binaryCheckPromises);

  // Add binary failures to reasons
  for (const result of binaryResults) {
    if (!result.ok) {
      reasons.push(`binary_missing:${result.worker}:${result.error}`);
    }
  }

  const binaryStatus: BinaryStatus = {
    ok: binaryResults.every(r => r.ok),
    results: binaryResults
  };

  // Ping workers to verify auth/connectivity (after binary checks)
  // Skip ping if binaries failed (no point pinging missing binaries)
  let pingStatus: PingStatus;
  if (options.skipPing || !binaryStatus.ok) {
    pingStatus = {
      ok: true,
      skipped: true,
      results: []
    };
  } else {
    const pingResults: PingResult[] = [];

    // Ping all configured workers in parallel
    const pingPromises: Promise<PingResult>[] = [];
    if (workers.claude) {
      pingPromises.push(pingClaude(workers.claude));
    }
    if (workers.codex) {
      pingPromises.push(pingCodex(workers.codex));
    }

    const results = await Promise.all(pingPromises);
    pingResults.push(...results);

    // Add failures to reasons
    for (const result of pingResults) {
      if (!result.ok) {
        const category = result.category || 'unknown';
        reasons.push(`ping_failed:${result.worker}:${category}`);
      }
    }

    pingStatus = {
      ok: pingResults.every(r => r.ok),
      skipped: false,
      results: pingResults
    };
  }

  const selection = selectTiersWithReasons(options.config.verification, {
    changed_files: repoContext.changed_files,
    risk_level: options.milestoneRiskLevel,
    is_milestone_end: false,
    is_run_end: false
  });

  return {
    repo_context: repoContext,
    guard: {
      ok: reasons.length === 0,
      reasons,
      dirty,
      scope_violations: scopeCheck.violations,
      lockfile_violations: lockfileCheck.violations,
      dirty_files,
      env_touched,
      dirty_is_env_only,
    },
    binary: binaryStatus,
    ping: pingStatus,
    tiers: selection.tiers,
    tier_reasons: selection.reasons
  };
}
