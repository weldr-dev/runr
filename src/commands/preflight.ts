import { AgentConfig } from '../config/schema.js';
import { buildRepoContext } from '../repo/context.js';
import { checkLockfiles, checkScope } from '../supervisor/scope-guard.js';
import { selectTiersWithReasons } from '../supervisor/verification-policy.js';
import { RepoContext, RiskLevel, VerificationTier } from '../types/schemas.js';

export interface PreflightOptions {
  repoPath: string;
  runId: string;
  slug: string;
  config: AgentConfig;
  allowDeps: boolean;
  allowDirty: boolean;
  milestoneRiskLevel: RiskLevel;
}

export interface GuardStatus {
  ok: boolean;
  reasons: string[];
  dirty: boolean;
  scope_violations: string[];
  lockfile_violations: string[];
}

export interface PreflightResult {
  repo_context: RepoContext;
  guard: GuardStatus;
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
    tiers: selection.tiers,
    tier_reasons: selection.reasons
  };
}
