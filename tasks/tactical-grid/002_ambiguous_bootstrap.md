# Ambiguous Bootstrap Task

Build a tiny, deterministic tactical combat engine from scratch.

## Goal

Create a turn-based skirmish game on a grid. The engine should support units with stats (HP, attack power, move/attack range), movement, and melee or ranged attacks. Game state must be fully deterministic given an RNG seed.

## Requirements

- Use TypeScript with strict mode.
- All game logic must be pure functions (no side effects).
- Units belong to one of two teams.
- Movement is Manhattan distance, blocked by other units.
- Attacks reduce HP; at 0 HP the unit is removed from play.
- Include at least 6 passing Vitest tests covering move, attack, and determinism.

## Success criteria

```bash
npm test      # ≥ 6 tests pass
npm run lint  # no errors
npm run typecheck
```
