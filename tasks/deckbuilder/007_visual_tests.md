# Task: Visual Board Tests

Add tests for the visual board components created in Task 6.

## Current State
- Board.tsx, Card.tsx, PlayerStats.tsx components exist and work
- App.tsx integrates Board with persistence, replay, and autoplay
- Only 12 tests exist (9 engine + 3 AI)
- No tests for visual components

## Requirements

### Milestone 1: Component Render Tests
- Test Board renders all zones (enemy, hand, deck pile, discard pile, player stats)
- Test Card renders name, cost, damage
- Test Card shows playable vs unplayable states correctly

### Milestone 2: Interaction and Integration Tests
- Test click-to-play dispatches correct action
- Test autoplay updates UI correctly (state changes reflect in components)
- Test same seed produces identical visual state

## Files Expected
- apps/deckbuilder/src/components/Board.test.tsx (new)

## Success Contract
1. `npm test` passes with **≥5 new tests** added
2. Tests cover: zone rendering, card states, click interaction, determinism
3. All 12 existing tests still pass
4. No changes to component implementation (test-only task)

## Scope
Only add test files in apps/deckbuilder/src/
