# Task: Compact UI Polish

Make the UI tight, focused, and fit comfortably on screen. Currently the layout is too spread out with scattered controls and wasted space.

## Current Problems (from screenshot)

1. **Replay bar too prominent** - Full-width bar showing "Progress: 0/0" even when not replaying
2. **Too much vertical spacing** - Large gaps between enemy zone, hand, and player zone
3. **Controls scattered everywhere** - Top-left has auto-save/export, bottom-left has draw/end turn/AI log
4. **AI Actions log visible by default** - Debug-style list taking prime real estate
5. **Empty hand wastes space** - "YOUR HAND (empty)" still takes vertical room
6. **Doesn't fit viewport** - Requires scrolling to see everything

## Design Goals

- **Single viewport** - Entire game visible without scrolling on a typical laptop screen
- **Integrated controls** - All actions accessible from within the game board area
- **Minimal chrome** - Hide/collapse things that aren't actively needed
- **Focus on gameplay** - Board is the star, controls are secondary

## Requirements

### Milestone 1: Compact Game Board
- Reduce padding/margins in enemy zone, hand zone, player zone
- Tighten vertical spacing - zones should feel connected, not floating islands
- Board should be max ~600px tall total (enemy + hand + player)
- Hand zone: when empty, just show minimal placeholder, not big empty area

### Milestone 2: Integrated Controls
- Move Draw/End Turn buttons INTO the player zone (near energy/HP)
- Auto-Play button near the action buttons, not separate
- Remove the floating bottom-left control panel
- Speed selector: small dropdown or icons, not prominent

### Milestone 3: Collapse Replay & AI Log
- Replay section: HIDE completely when not replaying (replayActions.length === 0)
- When replaying: show compact inline bar, not full-width section
- AI Actions log: HIDE by default, or show as small collapsible panel
- These are secondary features, not primary UI

### Milestone 4: Header Cleanup
- Compact top bar: title + essential buttons (New Game, Auto-save toggle)
- Export/Import: move to a menu or smaller icons
- No giant headers or separators

### Milestone 5: Final Polish
- Verify everything fits in ~900px viewport height without scrolling
- All features still work (persistence, replay when active, autoplay)
- All tests pass

## Visual Targets

```
┌─────────────────────────────────────────┐
│  Deckbuilder    [New] [≡]    ☑Auto-save │  <- Compact header
├─────────────────────────────────────────┤
│           ┌─────────────┐               │
│   ENEMY   │ HP ████░░░░ │  ⚔️ 6        │  <- Enemy zone (compact)
│           └─────────────┘               │
│                                         │
│    [Card1] [Card2] [Card3] [Card4]      │  <- Hand (cards in row)
│                                         │
│  ┌────┐  ┌─────────────────────┐ ┌────┐ │
│  │DECK│  │ HP ██████████ 40/40 │ │DISC│ │  <- Player zone
│  │ 5  │  │ ⚡⚡⚡    🛡️ 0       │ │ 2  │ │
│  └────┘  │  [Draw] [End Turn]  │ └────┘ │  <- Controls IN player zone
│          └─────────────────────┘        │
│             [▶ Auto-Play] [Speed: ▾]    │  <- Auto-play compact
└─────────────────────────────────────────┘
```

## Anti-Patterns to Avoid
- Full-width bars for secondary features (replay progress)
- Controls floating outside the game board
- Debug-style lists visible by default
- Giant padding/margins between zones
- Scrolling required to see basic game state

## Files to Modify
- apps/deckbuilder/src/components/Board.tsx
- apps/deckbuilder/src/components/PlayerStats.tsx
- apps/deckbuilder/src/components/Card.tsx (if needed for sizing)
- apps/deckbuilder/src/components/ReplayControls.tsx
- apps/deckbuilder/src/components/AutoPlayControls.tsx
- apps/deckbuilder/src/App.tsx

## Success Contract
1. **Fits viewport**: Game fully visible in 900px height without scrolling
2. **Controls integrated**: Draw/End Turn inside player zone, no floating panels
3. **Replay hidden**: No replay bar visible when replayActions.length === 0
4. **AI log hidden**: Not visible by default (can be in collapsed panel or removed)
5. **No regressions**: All 44 tests pass, all features work

## Scope
Only modify files in apps/deckbuilder/
