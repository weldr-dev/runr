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

## Guards-only command
`agent-run guards-only` runs preflight without executing the supervisor loop. It still writes run artifacts unless `--no-write` is set.
