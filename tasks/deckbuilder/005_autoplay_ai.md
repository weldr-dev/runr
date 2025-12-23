# Task: Autoplay / AI Turn

Add an AI opponent that can play turns automatically using simple heuristics.

## Current State
- Working game with persistence, replay, seed control
- Player manually draws, plays cards, ends turn
- Enemy has fixed "attack" intent each turn
- No automated decision-making

## Requirements

### Milestone 1: AI Decision Engine
- Create AI module with simple heuristics:
  - Draw cards until hand has 3+ cards or deck empty
  - Play highest damage card that can be afforded
  - Repeat until no energy or no playable cards
  - End turn
- AI decisions must be deterministic (same seed = same choices)

### Milestone 2: Auto-Play Button
- Add "Auto-Play Turn" button to UI
- When clicked, AI plays the current turn automatically
- Show each action with brief delay (300ms) for visibility
- Disable manual controls during auto-play
- Log AI decisions in action log

### Milestone 3: Full Auto-Play Mode
- Add "Auto-Play Game" toggle
- When enabled, AI plays all turns until win/lose
- Add speed control (slow: 500ms, normal: 300ms, fast: 100ms)
- Allow stopping mid-game
- Show turn counter during auto-play

### Milestone 4: AI Tests
- Add test: AI makes deterministic choices for same seed
- Add test: AI plays until game ends (doesn't infinite loop)
- Add test: AI respects energy constraints
- All existing tests still pass

## Files Expected
- apps/deckbuilder/src/ai/ai.ts (new - decision engine)
- apps/deckbuilder/src/ai/ai.test.ts (new - AI tests)
- apps/deckbuilder/src/App.tsx (updated)
- apps/deckbuilder/src/components/AutoPlayControls.tsx (new)

## Success Contract
1. `npm run dev` shows Auto-Play Turn button and Auto-Play Game toggle
2. Clicking Auto-Play Turn plays one complete turn automatically
3. Same seed produces identical AI decisions across runs
4. Auto-Play Game runs to completion (win or lose)
5. `npm test` passes with ≥3 new AI tests

## Scope
Only modify files in apps/deckbuilder/
