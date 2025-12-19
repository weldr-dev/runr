import { z } from 'zod';

const riskTriggerSchema = z.object({
  name: z.string(),
  patterns: z.array(z.string()),
  tier: z.enum(['tier0', 'tier1', 'tier2'])
});

const verificationSchema = z.object({
  tier0: z.array(z.string()).default([]),
  tier1: z.array(z.string()).default([]),
  tier2: z.array(z.string()).default([]),
  risk_triggers: z.array(riskTriggerSchema).default([]),
  max_verify_time_per_milestone: z.number().int().positive().default(600)
});

const scopeSchema = z.object({
  allowlist: z.array(z.string()).default([]),
  denylist: z.array(z.string()).default([]),
  lockfiles: z
    .array(z.string())
    .default(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
});

const agentSchema = z.object({
  name: z.string().default('dual-llm-orchestrator'),
  version: z.string().default('1')
});

const repoSchema = z.object({
  default_branch: z.string().optional()
});

const commandsSchema = z.object({
  codex: z.string().default('codex'),
  claude: z.string().default('claude')
});

export const agentConfigSchema = z.object({
  agent: agentSchema,
  repo: repoSchema.default({}),
  scope: scopeSchema,
  verification: verificationSchema,
  commands: commandsSchema
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
