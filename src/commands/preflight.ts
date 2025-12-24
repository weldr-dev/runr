import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig } from '../config/schema.js';
import { buildRepoContext } from '../repo/context.js';
import { checkLockfiles, checkScope } from '../supervisor/scope-guard.js';
import { selectTiersWithReasons } from '../supervisor/verification-policy.js';
import { RepoContext, RiskLevel, VerificationTier } from '../types/schemas.js';
import { pingClaude, PingResult } from '../workers/claude.js';
import { pingCodex } from '../workers/codex.js';

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
}

export interface PingStatus {
  ok: boolean;
  skipped: boolean;
  results: PingResult[];
}

export interface PreflightResult {
  repo_context: RepoContext;
  guard: GuardStatus;
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

  const dirty = repoContext.changed_files.length > 0;
  const scopeCheck = checkScope(
    repoContext.changed_files,
    options.config.scope.allowlist,
    options.config.scope.denylist
  );
  const lockfileCheck = checkLockfiles(
    repoContext.changed_files,
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

  // Ping workers to verify auth/connectivity (after cheap local guards)
  let pingStatus: PingStatus;
  if (options.skipPing) {
    pingStatus = { ok: true, skipped: true, results: [] };
  } else {
    const pingResults: PingResult[] = [];
    const workers = options.config.workers;

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
      lockfile_violations: lockfileCheck.violations
    },
    ping: pingStatus,
    tiers: selection.tiers,
    tier_reasons: selection.reasons
  };
}
