# Task B: Add Missing Type Export + Strict Guard Test

## Goal

Add a `createUnit` factory function to the engine with proper typing, following strict scope constraints.

## Reference Patterns

Follow the exact style of:
- `apps/tactical-grid/src/engine/types.ts` → `Unit` interface (lines 6-15)
- `apps/tactical-grid/src/engine/rng.ts` → function export pattern

## Requirements

1. **Add function** to `apps/tactical-grid/src/engine/engine.ts`:
   ```typescript
   export function createUnit(params: {
     id: string;
     x: number;
     y: number;
     team: 'player' | 'enemy';
     hp?: number;
     attack?: number;
     moveRange?: number;
     attackRange?: number;
   }): Unit
   ```
   - Use sensible defaults: `hp=10`, `attack=3`, `moveRange=3`, `attackRange=1`
   - Import `Unit` type from `./types`

2. **Add test** to `apps/tactical-grid/src/engine/engine.test.ts`:
   - Test default values are applied
   - Test custom values override defaults
   - Follow vitest conventions

3. **Verification**: tier0 must pass
   ```bash
   cd apps/tactical-grid && npm run typecheck && npm run lint && npm run test
   ```

## HARD CONSTRAINTS (guard-sensitive)

- ONLY touch files in `apps/tactical-grid/src/**`
- Do NOT modify `package.json`, `package-lock.json`, `tsconfig.json`
- Do NOT add any new dependencies
- Do NOT create files outside `apps/tactical-grid/src/`
- If you need a dependency, STOP immediately and report the blocker

## Milestones

1. Add `createUnit` function to engine.ts with proper types
2. Create engine.test.ts with passing tests
