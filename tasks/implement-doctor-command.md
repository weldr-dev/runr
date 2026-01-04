# Task: Implement `runr doctor` Command

## Goal
Add a diagnostic command that checks repo health and surfaces common issues.
Reduces support/debug time by making environment problems visible.

## Milestones

### Milestone 1: Add basic doctor command with git repo check
**Task**: Create `src/commands/doctor.ts` with basic git repository verification.

**Acceptance criteria**:
- Command exists and is wired to CLI
- Checks if CWD is a git repository
- Prints clear success/failure message
- Returns appropriate exit code

**Verification**:
```bash
npm run build
node dist/cli.js doctor --help
cd /tmp && node /path/to/dist/cli.js doctor 2>&1 | grep -q "not a git repository"
cd /path/to/runr && node dist/cli.js doctor 2>&1 | grep -q "Git repository: OK"
```

### Milestone 2: Add working tree status check
**Task**: Extend doctor command to check for uncommitted changes and show ignored noise summary.

**Acceptance criteria**:
- Reports clean vs dirty working tree
- Shows count of uncommitted files if dirty
- Shows ignored noise summary (like status command does)
- All checks pass for clean repo

**Verification**:
```bash
npm run build
git status --porcelain | wc -l  # should be 0 for clean repo
node dist/cli.js doctor 2>&1 | grep -q "Working tree: clean"
```

### Milestone 3: Add runr version and config checks
**Task**: Add version reporting and config file detection.

**Acceptance criteria**:
- Shows runr version from package.json
- Detects runr.config.json or agent.config.json if present
- Shows config path or "no config" message
- Validates config schema if present

**Verification**:
```bash
npm run build
node dist/cli.js doctor 2>&1 | grep -q "runr version:"
node dist/cli.js doctor 2>&1 | grep -q "Config:"
```

### Milestone 4: Add .runr/ directory write access check
**Task**: Verify write permissions to .runr/ directory.

**Acceptance criteria**:
- Checks if .runr/ exists
- Tests write access by creating/removing a temp file
- Reports clear error if write fails
- Shows runs directory status (count of runs if accessible)

**Verification**:
```bash
npm run build
node dist/cli.js doctor 2>&1 | grep -q ".runr/ directory:"
```

### Milestone 5: Add worktree sanity check
**Task**: If worktree mode was used, verify worktree is still valid.

**Acceptance criteria**:
- Detects if any runs used worktree mode
- Checks if worktree paths still exist
- Reports orphaned worktrees
- Suggests cleanup if needed

**Verification**:
```bash
npm run build
node dist/cli.js doctor 2>&1 | grep -q "Worktree"
pnpm test -- src/commands/__tests__/doctor.test.ts
```

### Milestone 6: Add comprehensive tests
**Task**: Write unit tests for all doctor checks.

**Acceptance criteria**:
- Test git repo detection (positive + negative)
- Test working tree status reporting
- Test version + config detection
- Test .runr/ write access
- Test worktree validation
- All tests pass

**Verification**:
```bash
npm run build
pnpm test -- src/commands/__tests__/doctor.test.ts
pnpm test  # all tests should still pass
```

## Scope
**Allowlist**:
- `src/commands/doctor.ts` (new file)
- `src/commands/__tests__/doctor.test.ts` (new file)
- `src/cli.ts` (add command registration)
- `package.json` (if updating version helpers)

**Blocked**:
- No changes to core supervisor/runner logic
- No changes to state machine
- No changes to existing commands (except cli.ts registration)

## Verification
After each milestone:
```bash
npm run build
pnpm test
```

Final verification:
```bash
npm run build
pnpm test
node dist/cli.js doctor
node dist/cli.js doctor --help
```

## Notes
- Keep diagnostic output concise (one line per check)
- Use emojis sparingly (only if user-facing output benefits from visual hierarchy)
- Exit code: 0 if all checks pass, 1 if any check fails
- Make each check independent (failure of one doesn't block others)
