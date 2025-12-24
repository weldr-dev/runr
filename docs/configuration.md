Status: Implemented
Source: src/config/schema.ts, src/config/load.ts

# Configuration

Config is loaded from `<repo>/agent.config.json` by default, or a path provided with `--config`.

## Top-level shape
```json
{
  "agent": {
    "name": "dual-llm-orchestrator",
    "version": "1"
  },
  "repo": {
    "default_branch": "main"
  },
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["infra/**"],
    "lockfiles": ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
  },
  "verification": {
    "tier0": ["pnpm lint"],
    "tier1": ["pnpm test"],
    "tier2": ["pnpm test"],
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
    "implement": "codex",
    "review": "claude"
  }
}
```

## Notes
- `scope.allowlist` is optional, but if set it acts as a strict allowlist.
- `scope.denylist` always blocks matching files.
- `verification` tier arrays are shell commands executed in the target repo.
- `workers.*.args` are used at runtime; `doctor` uses fixed args for headless tests.
- `phases` maps each phase to a worker (`claude` or `codex`). Defaults: plan=claude, implement=codex, review=claude.

## See Also
- [Guards and Scope](guards-and-scope.md) - How scope patterns are enforced
- [Verification](verification.md) - How verification tiers work
- [Workers](workers.md) - Worker adapter details
- [CLI Reference](cli.md) - Overriding config with `--config`
