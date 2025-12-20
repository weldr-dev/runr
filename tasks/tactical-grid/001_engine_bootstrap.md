# Task 001: Tactical Grid Combat Engine Bootstrap

Create a new turn-based tactical combat game engine from scratch.

## Project Setup

Create a new package at `apps/tactical-grid/` with:

```
apps/tactical-grid/
  package.json
  tsconfig.json
  vitest.config.ts
  eslint.config.cjs
  src/
    engine/
      types.ts
      rng.ts
      grid.ts
      combat.ts
      engine.ts
    index.ts
  src/engine/engine.test.ts
  README.md
```

### package.json requirements
- Name: `tactical-grid`
- Scripts: `test`, `typecheck`, `lint`
- Dependencies: `vitest`, `typescript`, `eslint` (dev)
- No React, no Vite dev server needed

### tsconfig.json
- Strict mode enabled
- ES2020+ target
- Node module resolution

## Engine Design

### types.ts
```typescript
interface Position { x: number; y: number; }

interface Unit {
  id: string;
  position: Position;
  hp: number;
  maxHp: number;
  attack: number;
  moveRange: number;
  attackRange: number;
  team: 'player' | 'enemy';
}

interface GameState {
  grid: { width: number; height: number; };
  units: Unit[];
  currentTeam: 'player' | 'enemy';
  turn: number;
  rng: RNGState;
}

type Action =
  | { type: 'move'; unitId: string; target: Position }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'end_turn' };
```

### rng.ts
- Copy the deterministic RNG pattern from deckbuilder
- `nextInt(rng, max)` returns `{ value, rng }`

### grid.ts
- `distance(a: Position, b: Position): number` - Manhattan distance
- `isInBounds(state, pos): boolean`
- `getUnitAt(state, pos): Unit | undefined`
- `isValidMoveTarget(state, unit, target): boolean`
  - Within moveRange
  - In bounds
  - Not occupied

### combat.ts
- `isValidAttackTarget(state, attacker, target): boolean`
  - Within attackRange
  - Different team
  - Target has HP > 0
- `resolveCombat(attacker, defender): { defender: Unit }`
  - Simple: defender.hp -= attacker.attack
  - Floor at 0

### engine.ts
- `createInitialState(seed, config?): GameState`
  - Default: 8x8 grid
  - 2 player units, 2 enemy units
  - Deterministic positions based on seed
- `step(state, action): GameState`
  - Validates actions, applies changes
  - end_turn switches currentTeam, increments turn

## Tests Required (6 minimum)

1. Unit can move within range to empty cell
2. Unit cannot move beyond moveRange
3. Unit cannot move to occupied cell
4. Attack deals correct damage to target
5. Attack fails if target out of range
6. Game state is deterministic from same seed

## Non-requirements
- No UI (engine-only package)
- No AI opponent logic
- No pathfinding (just range validation)
- No terrain/obstacles (empty grid)

## README.md
Brief description of:
- What the game is
- How to run tests
- Basic rules (movement, combat, turns)

## Acceptance Criteria
- `npm install` succeeds
- `npm run lint` passes
- `npm run typecheck` passes
- `npm run test` passes (6+ tests)
- All files in specified structure exist
