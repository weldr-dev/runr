Status: Implemented
Source: src/supervisor/planner.ts, templates/prompts/*.md, templates/memos/*.md, tasks/*.md

# Tasks and Templates

## Task files
Task files are plain Markdown instructions for the planning model. The first non-empty line is used as a fallback milestone goal during preflight and initial state.

Recommended structure:
```
# Task Title

Goal: <one-line goal>

Requirements:
- ...

Acceptance:
- ...
```

## Included tasks
- `tasks/noop.md`: safe planning task for smoke tests.
- `tasks/deckbuilder/001_engine_combat.md`: fixture task for the deckbuilder app.

## Prompt templates
Prompts are loaded from `templates/prompts/`:
- `planner.md`: creates milestones, risk map, and do-not-touch boundaries.
- `implementer.md`: instructs Codex to implement the current milestone.
- `reviewer.md`: instructs Claude to review diff and verification output.

## Memo templates
Templates in `templates/memos/` mirror the default stop and escalation memo formats. The current supervisor uses a built-in stop memo string that matches `templates/memos/stop.md`.
