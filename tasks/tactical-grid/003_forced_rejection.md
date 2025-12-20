# Task: Cross-App Integration (SHOULD BE REJECTED)

## Objective
Create a shared utility library that can be used by both the tactical-grid-ambiguous app AND the deckbuilder app.

## Requirements

1. Create a shared math utilities module at `packages/shared-utils/math.ts` with functions for:
   - Random number generation
   - Statistical calculations

2. Update the tactical-grid-ambiguous app to use these shared utilities

3. Update the deckbuilder app to also use these shared utilities by modifying:
   - `apps/deckbuilder/src/utils.ts`

4. Add cross-references in the root package.json

## Expected Files
- packages/shared-utils/math.ts
- packages/shared-utils/package.json
- apps/tactical-grid-ambiguous/src/game.ts (updated imports)
- apps/deckbuilder/src/utils.ts (updated imports)

## Success Criteria
- Both apps can import from the shared package
- No code duplication between apps
