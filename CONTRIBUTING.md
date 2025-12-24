# Contributing to Dual-LLM Agent Runner

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone and install
git clone <repo-url>
cd agent-framework
npm install

# Build
npm run build

# Run tests
npm test

# Verify CLI works
node dist/cli.js doctor
```

## Project Structure

```
src/
  cli.ts                 # Entry point, command definitions
  commands/              # CLI command implementations
    run.ts               # Main run command
    resume.ts            # Resume existing runs
    doctor.ts            # Health checks
    report.ts            # Run reporting
    status.ts            # Status display
    guards-only.ts       # Preflight checks only
    preflight.ts         # Guard and scope validation
  supervisor/            # Core orchestration
    runner.ts            # Phase loop (PLAN->IMPLEMENT->VERIFY->REVIEW->CHECKPOINT)
    state-machine.ts     # State transitions
    planner.ts           # Task parsing
    scope-guard.ts       # File scope enforcement
    verification-policy.ts # Tier selection logic
  workers/               # LLM adapters
    claude.ts            # Claude CLI adapter
    codex.ts             # Codex CLI adapter
    prompts.ts           # Prompt builders
    json.ts              # JSON marker parsing
    schemas.ts           # Zod output schemas
  store/                 # Persistence
    run-store.ts         # Run artifacts and timeline
  config/                # Configuration
    schema.ts            # Zod config schema
    load.ts              # Config file loading
  verification/          # Test execution
    engine.ts            # Command runner with timeouts
  types/                 # Type definitions
    schemas.ts           # Core TypeScript interfaces
  repo/                  # Git operations
    git.ts               # Git command wrapper
    context.ts           # Changed file detection
  env/                   # Environment
    fingerprint.ts       # Environment hashing
```

## Key Concepts

Before contributing, understand these core concepts:

- **Phases**: PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT, FINALIZE
- **Workers**: Claude and Codex CLI adapters that execute prompts
- **Verification Tiers**: tier0 (always), tier1 (risk-triggered), tier2 (run-end)
- **Scope Guards**: Allowlist/denylist patterns that restrict file changes
- **Run Store**: Persistent artifacts under `runs/<run_id>/`

See [docs/mental-model.md](docs/mental-model.md) for the full mental model.

## Making Changes

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make your changes

- Follow existing code style (TypeScript, no semicolons where optional)
- Add tests for new functionality
- Update docs if behavior changes

### 3. Test your changes

```bash
# Build and test
npm run build && npm test

# Run doctor to verify CLI works
node dist/cli.js doctor

# Test a real run (optional)
node dist/cli.js run --repo . --task tasks/noop.md --dry-run
```

### 4. Commit with clear messages

```bash
git commit -m "feat: add new feature description"
```

Use conventional commit prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Use existing patterns (check nearby code)
- **Imports**: Use `.js` extensions for local imports (ESM)
- **Error handling**: Use typed errors, log with context
- **Comments**: Explain "why" not "what"

## Testing

Tests are in `*.test.ts` files alongside source files:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/workers/json.test.ts
```

## Documentation

- Update docs if you change behavior
- Add JSDoc comments to exported functions
- Keep README.md in sync with major changes

See [docs/index.md](docs/index.md) for documentation structure.

## Protected Files (Boot Chain)

These files are critical for the agent to function. Be extra careful when modifying:

- `src/cli.ts` - Entry point
- `src/supervisor/runner.ts` - Phase orchestration
- `src/supervisor/state-machine.ts` - State transitions
- `src/store/run-store.ts` - Persistence
- `src/workers/json.ts` - JSON parsing
- `src/workers/claude.ts` / `codex.ts` - Worker protocols
- `src/commands/run.ts` / `resume.ts` - Run entrypoints
- `src/config/load.ts` - Config loading

See [docs/self-hosting-safety.md](docs/self-hosting-safety.md) for details.

## Pull Request Process

1. Ensure tests pass: `npm run build && npm test`
2. Update documentation if needed
3. Write a clear PR description explaining:
   - What changed
   - Why it changed
   - How to test it
4. Request review

## Getting Help

- Check [docs/troubleshooting.md](docs/troubleshooting.md) for common issues
- Review existing code for patterns
- Open an issue for questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
