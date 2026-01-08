Status: Implemented
Source: src/commands/preflight.ts, src/supervisor/scope-guard.ts, src/commands/guards-only.ts

# Guards and Scope

Guards are enforced in preflight and after implementation. They prevent unsafe or out-of-scope changes.

## Guard checks
| Check | Inputs | Failure effect | Override |
| --- | --- | --- | --- |
| Dirty worktree | `git status --porcelain` | Stop before branch checkout | `--allow-dirty` |
| Scope allow/deny | `scope.allowlist`, `scope.denylist` | Stop run (guard violation) | Update config |
| Lockfiles | `scope.lockfiles` + changed files | Stop run (guard violation) | `--allow-deps` |

## Scope matching
- Patterns use picomatch glob rules.
- Paths are normalized to forward slashes before matching.
- If an allowlist is set, all changed files must match at least one allowlist entry.

## Guard behavior with gitignored files

Runr's guard automatically filters out gitignored files to prevent tool pollution from triggering false-positive guard violations.

**Behavior matrix:**

| Changed path | In allowlist? | Gitignored? | Guard result |
|--------------|---------------|-------------|--------------|
| `src/foo.ts` | ✅ Yes | (either) | ✅ OK |
| `.tmp/cache` | ❌ No | ✅ Yes | ✅ Ignore (filtered) |
| `.tmp/cache` | ❌ No | ❌ No | ❌ STOP (guard violation) |

**How it works:**
1. Guard collects changed files from `git status --porcelain`
2. Passes all paths through `git check-ignore --stdin`
3. Filters out ignored files before scope checks
4. Only non-ignored files are checked against allowlist/denylist

**What gets filtered (typical tool pollution):**
- `.tmp/` — tsx/ts-node compilation caches
- `node_modules/.vite/` — Vite dependency pre-bundling
- `.eslintcache` — ESLint cache
- `.pytest_cache/` — pytest cache
- `coverage/`, `.nyc_output/` — Coverage artifacts
- `.DS_Store`, `._*` — macOS Finder metadata

**Edge cases:**
- If `git check-ignore` fails (e.g., not in a git repo), guard returns all files (fail-safe strict mode)
- Gitignore rules are evaluated at runtime, not from repo history
- Tracked files that are later gitignored will still appear in changed files if modified

## Guard command
`runr tools guard` runs preflight without executing the supervisor loop. It still writes run artifacts unless `--no-write` is set.

## See Also
- [Verification](verification.md) - Post-implement verification tiers
- [Configuration](configuration.md) - Setting up allowlist/denylist patterns
- [CLI Reference](cli.md) - Guard-related command options (`--allow-deps`, `--allow-dirty`)
- [Self-Hosting Safety](self-hosting-safety.md) - Protected boot chain files
