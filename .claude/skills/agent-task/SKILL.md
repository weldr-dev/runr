# Agent Task Skill

This skill provides context for creating and managing agent tasks.

## When to Use

Auto-invoke this skill when:
- User wants to create a new automated task
- User is editing `.agent/tasks/*.md` files
- User asks about task structure or milestones
- User wants to break down work into agent-executable steps

## Task File Format

Tasks live in `.agent/tasks/<name>.md`:

```markdown
# Task Title

## Objective
Clear, specific description of what to accomplish.

## Scope
owns:
  - src/feature/**
  - tests/feature/**

denylist:
  - "*.config.js"

## Milestones

### 1. Setup
- [ ] Create directory structure
- [ ] Add base types

### 2. Implementation
- [ ] Implement core logic
- [ ] Add error handling

### 3. Testing
- [ ] Write unit tests
- [ ] Verify all tests pass

## Verification
tier0: npm run build
tier1: npm test -- --grep "feature"
tier2: npm run test:e2e

## Context
Any additional information the agent needs:
- Related files to reference
- Architectural constraints
- Edge cases to handle
```

## Scope Configuration

### owns (allowlist)
Files/directories the agent CAN modify:
```yaml
owns:
  - src/components/Button.tsx    # Specific file
  - src/utils/**                 # Directory glob
  - "*.test.ts"                  # Pattern
```

### denylist
Files the agent must NOT modify:
```yaml
denylist:
  - src/config/secrets.ts
  - "*.lock"
```

### Presets
Common scope patterns:
```yaml
owns:
  - preset:docs      # Documentation files
  - preset:tests     # Test files
  - preset:config    # Config files
```

## Milestone Design

Good milestones are:
- **Atomic**: One logical unit of work
- **Verifiable**: Clear completion criteria
- **Ordered**: Each builds on the previous
- **Scoped**: Don't touch files outside `owns`

## Verification Tiers

| Tier | Purpose | Example |
|------|---------|---------|
| tier0 | Fast sanity check | `npm run build` |
| tier1 | Unit tests | `npm test` |
| tier2 | Integration/E2E | `npm run test:e2e` |

## Validation

Before running, validate a task:
```bash
agent preflight <task-name>
```

This checks:
- Task file syntax
- Scope conflicts with other runs
- Verification commands exist
