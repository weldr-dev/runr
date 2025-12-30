import { z } from 'zod';

/**
 * Scope presets - common file patterns for popular frameworks/tools.
 * These expand the allowlist to include config files that tasks commonly need.
 */
export const SCOPE_PRESETS: Record<string, string[]> = {
  // Framework presets
  nextjs: [
    'next.config.*',
    'next-env.d.ts',
    'middleware.ts',
    'middleware.js',
  ],
  react: [
    'vite.config.*',
    'index.html',
  ],

  // Database presets
  drizzle: [
    'drizzle.config.*',
    'drizzle/**',
  ],
  prisma: [
    'prisma/**',
  ],

  // Testing presets
  vitest: [
    'vitest.config.*',
    'vite.config.*',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
  ],
  jest: [
    'jest.config.*',
    'jest.setup.*',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
  ],
  playwright: [
    'playwright.config.*',
    'e2e/**',
    'tests/**',
  ],

  // Build/config presets
  typescript: [
    'tsconfig*.json',
  ],
  tailwind: [
    'tailwind.config.*',
    'postcss.config.*',
  ],
  eslint: [
    'eslint.config.*',
    '.eslintrc*',
  ],

  // Environment presets
  env: [
    '.env.example',
    '.env.local.example',
    '.env.template',
  ],
};

/** Valid preset names */
export const PRESET_NAMES = Object.keys(SCOPE_PRESETS) as [string, ...string[]];

const riskTriggerSchema = z.object({
  name: z.string(),
  patterns: z.array(z.string()),
  tier: z.enum(['tier0', 'tier1', 'tier2'])
});

const verificationSchema = z.object({
  cwd: z.string().optional(), // Working directory for verification commands (relative to repo root)
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
    .default(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']),
  /** Scope presets to include (expands allowlist with common patterns) */
  presets: z.array(z.string()).default([]),
  /**
   * Paths allowed to be dirty AND exempt from scope violations.
   * These are "env state" - artifacts that don't affect code correctness.
   * Matches both symlinks and directories (e.g., node_modules and node_modules/).
   */
  env_allowlist: z.array(z.string()).default([
    'node_modules',
    'node_modules/**',
    '.next/**',
    'dist/**',
    'build/**',
    '.turbo/**',
    '.eslintcache',
    'coverage/**',
  ]),
});

const agentSchema = z.object({
  name: z.string().default('dual-llm-orchestrator'),
  version: z.string().default('1')
});

const repoSchema = z.object({
  default_branch: z.string().optional()
});

const workerConfigSchema = z.object({
  bin: z.string(),
  args: z.array(z.string()).default([]),
  output: z.enum(['text', 'json', 'jsonl']).default('text')
});

const workersSchema = z.object({
  codex: workerConfigSchema.default({
    bin: 'codex',
    args: ['exec', '--full-auto', '--json'],
    output: 'jsonl'
  }),
  claude: workerConfigSchema.default({
    bin: 'claude',
    args: ['-p', '--output-format', 'json', '--dangerously-skip-permissions'],
    output: 'json'
  })
});

// Phase-to-worker mapping - allows configuring which worker handles each phase
const phasesSchema = z.object({
  plan: z.enum(['claude', 'codex']).default('claude'),
  implement: z.enum(['claude', 'codex']).default('codex'),
  review: z.enum(['claude', 'codex']).default('claude')
});

// Resilience settings for auto-resume and failure recovery
const resilienceSchema = z.object({
  /** Enable automatic resume on transient failures (stall, worker timeout) */
  auto_resume: z.boolean().default(false),
  /** Maximum number of auto-resumes per run (conservative default: 1) */
  max_auto_resumes: z.number().int().nonnegative().default(1),
  /** Backoff delays in ms between auto-resume attempts (must be positive integers) */
  auto_resume_delays_ms: z
    .array(z.number().int().positive())
    .nonempty()
    .default([30000, 120000, 300000]), // 30s, 2min, 5min
  /** Hard cap on worker call duration in minutes (kills hung workers). Supports decimals for testing. */
  max_worker_call_minutes: z.number().positive().default(45),
  /** Maximum review rounds per milestone before stopping with review_loop_detected (default: 2) */
  max_review_rounds: z.number().int().positive().default(2)
});

export const agentConfigSchema = z.object({
  agent: agentSchema,
  repo: repoSchema.default({}),
  scope: scopeSchema,
  verification: verificationSchema,
  workers: workersSchema.default({}),
  phases: phasesSchema.default({}),
  resilience: resilienceSchema.default({})
});

export type PhasesConfig = z.infer<typeof phasesSchema>;

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export type AgentConfig = z.infer<typeof agentConfigSchema>;
