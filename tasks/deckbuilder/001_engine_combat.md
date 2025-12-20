# Task 001: Engine Combat Core

Goal: Implement core combat mechanics in the deckbuilder engine.

Requirements:
- Add `block` to player state.
- Add `applyDamage()` that consumes block before HP.
- Implement `endTurn()` where the enemy attacks for fixed damage (6).
- Add tests:
  1) block reduces damage
  2) block never goes negative
  3) hp never goes below 0
  4) endTurn triggers enemy attack deterministically

Acceptance:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
