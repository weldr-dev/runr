# Configuration Reference

Config is loaded from `.agent/agent.config.json` by default, or a path provided with `--config`.

## Full Schema

```json
{
  "agent": {
    "name": "my-project",
    "version": "1"
  },
  "repo": {
    "default_branch": "main"
  },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**", ".next/**"],
    "lockfiles": ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "cwd": ".",
    "tier0": ["npm run typecheck", "npm run lint"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"],
    "risk_triggers": [
      { "name": "deps", "patterns": ["package.json"], "tier": "tier1" }
    ],
    "max_verify_time_per_milestone": 600
  },
  "workers": {
    "codex": {
      "bin": "codex",
      "args": ["exec", "--full-auto", "--json"],
      "output": "jsonl"
    },
    "claude": {
      "bin": "claude",
      "args": ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
      "output": "json"
    }
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  },
  "resilience": {
    "auto_resume": false,
    "max_auto_resumes": 1,
    "auto_resume_delays_ms": [30000, 120000, 300000],
    "max_worker_call_minutes": 45,
    "max_review_rounds": 2
  }
}
```

## Sections

### agent

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"dual-llm-orchestrator"` | Project identifier |
| `version` | string | `"1"` | Config version |

### repo

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `default_branch` | string | - | Default git branch (auto-detected if omitted) |

### scope

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowlist` | string[] | `[]` | Glob patterns for allowed files |
| `denylist` | string[] | `[]` | Glob patterns for blocked files |
| `lockfiles` | string[] | `["package-lock.json", ...]` | Protected lockfiles |
| `presets` | string[] | `[]` | Named pattern collections (see below) |

#### Scope Presets

Instead of manually listing patterns, use presets for common stacks:

```json
{
  "scope": {
    "allowlist": ["src/**"],
    "presets": ["nextjs", "vitest", "drizzle"]
  }
}
```

**Available presets:**

| Preset | Expands to |
|--------|------------|
| `nextjs` | `next.config.*`, `next-env.d.ts`, `middleware.ts`, `middleware.js` |
| `react` | `vite.config.*`, `index.html` |
| `drizzle` | `drizzle.config.*`, `drizzle/**` |
| `prisma` | `prisma/**` |
| `vitest` | `vitest.config.*`, `vite.config.*`, `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` |
| `jest` | `jest.config.*`, `jest.setup.*`, `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` |
| `playwright` | `playwright.config.*`, `e2e/**`, `tests/**` |
| `typescript` | `tsconfig*.json` |
| `tailwind` | `tailwind.config.*`, `postcss.config.*` |
| `eslint` | `eslint.config.*`, `.eslintrc*` |
| `env` | `.env.example`, `.env.local.example`, `.env.template` |

Preset patterns are merged into `allowlist` at config load time.

### verification

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cwd` | string | - | Working directory for commands (relative to repo) |
| `tier0` | string[] | `[]` | Always run (lint, typecheck) |
| `tier1` | string[] | `[]` | Run on risk triggers (build) |
| `tier2` | string[] | `[]` | Run at finalize (full tests) |
| `risk_triggers` | object[] | `[]` | Patterns that trigger tier1 |
| `max_verify_time_per_milestone` | number | `600` | Timeout in seconds |

### workers

Configure worker CLI binaries and arguments:

| Field | Type | Description |
|-------|------|-------------|
| `bin` | string | Binary name |
| `args` | string[] | CLI arguments |
| `output` | string | Output format: `text`, `json`, `jsonl` |

### phases

Map phases to workers:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `plan` | string | `"claude"` | Worker for PLAN phase |
| `implement` | string | `"codex"` | Worker for IMPLEMENT phase |
| `review` | string | `"claude"` | Worker for REVIEW phase |

### resilience

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_resume` | boolean | `false` | Enable auto-resume on transient failures |
| `max_auto_resumes` | number | `1` | Max auto-resume attempts per run |
| `auto_resume_delays_ms` | number[] | `[30000, 120000, 300000]` | Backoff delays |
| `max_worker_call_minutes` | number | `45` | Hard cap on worker call duration |
| `max_review_rounds` | number | `2` | Max review rounds before `review_loop_detected` |

## Minimal Config

The smallest valid config:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"]
  },
  "verification": {
    "tier0": ["npm run lint"]
  }
}
```

## See Also

- [Guards and Scope](guards-and-scope.md) - How scope patterns are enforced
- [Verification](verification.md) - How verification tiers work
- [CLI Reference](cli.md) - Overriding config with `--config`
