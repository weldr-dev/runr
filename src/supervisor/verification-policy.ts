import picomatch from 'picomatch';
import { RiskLevel, VerificationPolicy, VerificationTier } from '../types/schemas.js';

export interface VerificationContext {
  changed_files: string[];
  risk_level: RiskLevel;
  is_milestone_end: boolean;
  is_run_end: boolean;
}

export interface TriggerMatch {
  name: string;
  tier: VerificationTier;
}

export interface TierSelection {
  tiers: VerificationTier[];
  reasons: string[];
}

const ORDERED_TIERS: VerificationTier[] = ['tier0', 'tier1', 'tier2'];

export function selectTiersWithReasons(
  policy: VerificationPolicy,
  context: VerificationContext
): TierSelection {
  const tiers = new Set<VerificationTier>();
  const reasons: string[] = [];
  tiers.add('tier0');
  reasons.push('tier0_always');

  const matches = triggerMatches(policy, context.changed_files);
  const highRiskMatches = matches.filter((match) => match.tier !== 'tier0');
  if (highRiskMatches.length > 0) {
    tiers.add('tier1');
    for (const match of highRiskMatches) {
      reasons.push(`risk_trigger:${match.name}`);
    }
  }

  if (context.is_milestone_end) {
    tiers.add('tier1');
    reasons.push('milestone_end');
  }

  if (context.risk_level === 'high') {
    tiers.add('tier1');
    reasons.push('risk_level_high');
  }

  if (context.is_run_end) {
    tiers.add('tier2');
    reasons.push('run_end');
  }

  const selected = ORDERED_TIERS.filter((tier) => tiers.has(tier));
  return { tiers: selected, reasons };
}

export function selectTiers(
  policy: VerificationPolicy,
  context: VerificationContext
): VerificationTier[] {
  return selectTiersWithReasons(policy, context).tiers;
}

export function triggerTiers(
  policy: VerificationPolicy,
  changedFiles: string[]
): VerificationTier[] {
  const tiers = new Set<VerificationTier>();
  for (const match of triggerMatches(policy, changedFiles)) {
    tiers.add(match.tier);
  }
  return Array.from(tiers);
}

export function triggerMatches(
  policy: VerificationPolicy,
  changedFiles: string[]
): TriggerMatch[] {
  if (!policy.risk_triggers.length) {
    return [];
  }
  const matches: TriggerMatch[] = [];
  const files = changedFiles.map((file) => file.replace(/\\/g, '/'));
  for (const trigger of policy.risk_triggers) {
    const matcher = picomatch(trigger.patterns);
    if (files.some((file) => matcher(file))) {
      const tier = trigger.tier === 'tier2' ? 'tier1' : trigger.tier;
      matches.push({ name: trigger.name, tier });
    }
  }
  return matches;
}

export function commandsForTier(
  policy: VerificationPolicy,
  tier: VerificationTier
): string[] {
  if (tier === 'tier0') {
    return policy.tier0;
  }
  if (tier === 'tier1') {
    return policy.tier1;
  }
  return policy.tier2;
}
