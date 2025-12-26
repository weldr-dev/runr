# Task A: Add Pathfinding Utility + Test

## Goal

Add a `getValidMoveTargets` function to the grid module that returns all positions a unit can legally move to.

## Reference Patterns

Follow the exact style of these existing functions:
- `apps/tactical-grid/src/engine/grid.ts` → `isValidMoveTarget()` (lines 25-40)
- `apps/tactical-grid/src/engine/grid.ts` → `distance()` (lines 3-5)

## Requirements

1. **Add function** to `apps/tactical-grid/src/engine/grid.ts`:
   ```typescript
   export function getValidMoveTargets(
     unit: Unit,
     grid: { width: number; height: number },
     units: Unit[]
   ): Position[]
   ```
   - Return all positions within `unit.moveRange` that pass `isValidMoveTarget()`
   - Reuse existing `distance()` and `isValidMoveTarget()` helpers

2. **Add test file** `apps/tactical-grid/src/engine/grid.test.ts`:
   - Test `getValidMoveTargets()` with at least 2 cases:
     - Unit in corner (limited moves)
     - Unit blocked by another unit
   - Follow vitest conventions: `describe`, `it`, `expect`

3. **Verification**: tier0 must pass
   ```bash
   cd apps/tactical-grid && npm run typecheck && npm run lint && npm run test
   ```

## Constraints

- Only modify files in `apps/tactical-grid/src/**`
- Do NOT install new dependencies
- Do NOT modify `package.json` or lockfiles
- If deps are needed, STOP and report the blocker

## Milestones

1. Add `getValidMoveTargets` function to grid.ts
2. Create grid.test.ts with passing tests
