import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Board } from './Board';
import { Card } from './Card';
import type { Player, Enemy, Card as CardData, Action } from '../engine/types';
import { createInitialState, step } from '../engine/engine';

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    hp: 50,
    block: 5,
    energy: 3,
    deck: [
      { id: 'card-1', name: 'Strike', cost: 1, damage: 6 },
      { id: 'card-2', name: 'Defend', cost: 1, damage: 0 },
      { id: 'card-3', name: 'Bash', cost: 2, damage: 8 },
    ],
    hand: [
      { id: 'hand-1', name: 'Strike', cost: 1, damage: 6 },
    ],
    discard: [
      { id: 'discard-1', name: 'Strike', cost: 1, damage: 6 },
      { id: 'discard-2', name: 'Defend', cost: 1, damage: 0 },
    ],
    ...overrides,
  };
}

function createTestEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    hp: 40,
    intent: 'attack',
    damage: 12,
    ...overrides,
  };
}

describe('Board', () => {
  describe('Enemy Zone', () => {
    it('renders enemy HP', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ hp: 45 });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('>HP<');
      expect(html).toContain('45');
    });

    it('renders attack intent with sword icon', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ intent: 'attack' });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('⚔️');
      expect(html).toContain('Attack');
    });

    it('renders enemy damage number alongside attack icon', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ damage: 15 });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('⚔️');
      expect(html).toContain('>15<');
    });

    it('renders defend intent with shield icon when enemy is resting', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ intent: 'rest' });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('🛡️');
      expect(html).toContain('Defend');
    });
  });

  describe('Deck Pile', () => {
    it('displays card count', () => {
      const player = createTestPlayer({
        deck: [
          { id: '1', name: 'Strike', cost: 1, damage: 6 },
          { id: '2', name: 'Strike', cost: 1, damage: 6 },
          { id: '3', name: 'Strike', cost: 1, damage: 6 },
          { id: '4', name: 'Strike', cost: 1, damage: 6 },
          { id: '5', name: 'Strike', cost: 1, damage: 6 },
        ],
      });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Deck');
      expect(html).toContain('>5<');
    });

    it('displays zero when deck is empty', () => {
      const player = createTestPlayer({ deck: [] });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Deck');
      expect(html).toContain('>0<');
    });
  });

  describe('Discard Pile', () => {
    it('displays discard count', () => {
      const player = createTestPlayer({
        discard: [
          { id: '1', name: 'Strike', cost: 1, damage: 6 },
          { id: '2', name: 'Defend', cost: 1, damage: 0 },
          { id: '3', name: 'Bash', cost: 2, damage: 8 },
        ],
      });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Discard');
      expect(html).toContain('>3<');
    });

    it('displays zero when discard is empty', () => {
      const player = createTestPlayer({ discard: [] });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Discard');
      expect(html).toContain('>0<');
    });
  });

  describe('Player Stats', () => {
    it('renders player HP', () => {
      const player = createTestPlayer({ hp: 75 });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('HP');
      expect(html).toContain('75');
    });

    it('renders player energy', () => {
      const player = createTestPlayer({ energy: 4 });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Energy');
      expect(html).toContain('>4<');
    });

    it('renders player block', () => {
      const player = createTestPlayer({ block: 10 });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Block');
      expect(html).toContain('>10<');
    });
  });

  describe('Hand Zone', () => {
    it('renders hand zone label', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Your Hand');
    });

    it('shows empty message when hand is empty', () => {
      const player = createTestPlayer({ hand: [] });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('(empty)');
    });

    it('renders cards when hand has cards', () => {
      const player = createTestPlayer({
        hand: [
          { id: 'h1', name: 'Strike', cost: 1, damage: 6 },
          { id: 'h2', name: 'Defend', cost: 1, damage: 0 },
        ],
      });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Strike');
      expect(html).toContain('Defend');
    });
  });

  describe('Card Component', () => {
    function createTestCard(overrides: Partial<CardData> = {}): CardData {
      return {
        id: 'test-card-1',
        name: 'Test Strike',
        cost: 2,
        damage: 8,
        ...overrides,
      };
    }

    it('displays card name, cost, and damage values', () => {
      const card = createTestCard({ name: 'Fireball', cost: 3, damage: 12 });
      const html = renderToString(<Card card={card} playerEnergy={5} />);
      expect(html).toContain('Fireball');
      expect(html).toContain('Cost');
      expect(html).toContain('>3<');
      expect(html).toContain('Damage');
      expect(html).toContain('>12<');
    });

    it('shows Playable status when player energy >= card cost', () => {
      const card = createTestCard({ cost: 2 });
      const html = renderToString(<Card card={card} playerEnergy={3} />);
      expect(html).toContain('Playable');
    });

    it('shows Not enough energy status when player energy < card cost', () => {
      const card = createTestCard({ cost: 3 });
      const html = renderToString(<Card card={card} playerEnergy={2} />);
      expect(html).toContain('Not enough energy');
    });

    it('shows Actions locked status when card is disabled', () => {
      const card = createTestCard({ cost: 1 });
      const html = renderToString(<Card card={card} playerEnergy={3} disabled={true} />);
      expect(html).toContain('Actions locked');
    });

    it('renders as button when onPlay is provided for playable card', () => {
      const card = createTestCard({ cost: 1 });
      const mockOnPlay = () => {};
      const html = renderToString(<Card card={card} playerEnergy={3} onPlay={mockOnPlay} />);
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-disabled="false"');
    });

    it('renders as disabled button when card is not playable', () => {
      const card = createTestCard({ cost: 5 });
      const mockOnPlay = () => {};
      const html = renderToString(<Card card={card} playerEnergy={2} onPlay={mockOnPlay} />);
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-disabled="true"');
    });

    it('renders as disabled button when actions are locked', () => {
      const card = createTestCard({ cost: 1 });
      const mockOnPlay = () => {};
      const html = renderToString(<Card card={card} playerEnergy={3} onPlay={mockOnPlay} disabled={true} />);
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-disabled="true"');
    });

    it('does not render role=button when onPlay is not provided', () => {
      const card = createTestCard({ cost: 1 });
      const html = renderToString(<Card card={card} playerEnergy={3} />);
      expect(html).not.toContain('role="button"');
    });
  });

  describe('Card Play Interaction', () => {
    function createTestCard(overrides: Partial<CardData> = {}): CardData {
      return {
        id: 'test-card-1',
        name: 'Test Strike',
        cost: 2,
        damage: 8,
        ...overrides,
      };
    }

    it('playable card renders with interactive attributes for click handling', () => {
      const card = createTestCard({ id: 'card-abc', cost: 1 });
      const mockOnPlay = () => {};
      const html = renderToString(<Card card={card} playerEnergy={3} onPlay={mockOnPlay} />);
      // Verify card is marked as interactive (button role, not disabled)
      expect(html).toContain('role="button"');
      expect(html).toContain('aria-disabled="false"');
      expect(html).toContain('tabindex="0"');
    });

    it('unplayable card renders without interactive attributes', () => {
      const card = createTestCard({ id: 'card-xyz', cost: 5 });
      const mockOnPlay = () => {};
      const html = renderToString(<Card card={card} playerEnergy={2} onPlay={mockOnPlay} />);
      // Card should be marked as disabled (not interactive)
      expect(html).toContain('aria-disabled="true"');
      // Should not have tabindex for keyboard focus since it's not interactive
      expect(html).not.toContain('tabindex="0"');
    });
  });

  describe('State Updates', () => {
    it('reflects updated player HP after damage', () => {
      const enemy = createTestEnemy();

      // Initial state
      const playerBefore = createTestPlayer({ hp: 50 });
      const htmlBefore = renderToString(<Board player={playerBefore} enemy={enemy} />);
      expect(htmlBefore).toContain('>50<');

      // After taking damage
      const playerAfter = createTestPlayer({ hp: 38 });
      const htmlAfter = renderToString(<Board player={playerAfter} enemy={enemy} />);
      expect(htmlAfter).toContain('>38<');
      expect(htmlAfter).not.toContain('>50<');
    });

    it('reflects updated enemy HP after attack', () => {
      const player = createTestPlayer();

      // Initial state
      const enemyBefore = createTestEnemy({ hp: 40 });
      const htmlBefore = renderToString(<Board player={player} enemy={enemyBefore} />);
      expect(htmlBefore).toContain('>HP<');
      expect(htmlBefore).toContain('40');

      // After dealing damage
      const enemyAfter = createTestEnemy({ hp: 34 });
      const htmlAfter = renderToString(<Board player={player} enemy={enemyAfter} />);
      expect(htmlAfter).toContain('34');
    });

    it('reflects card moving from hand to discard after play', () => {
      const enemy = createTestEnemy();

      // Before playing card - 2 cards in hand, 1 in discard
      const playerBefore = createTestPlayer({
        hand: [
          { id: 'h1', name: 'Strike', cost: 1, damage: 6 },
          { id: 'h2', name: 'Defend', cost: 1, damage: 0 },
        ],
        discard: [
          { id: 'd1', name: 'Bash', cost: 2, damage: 8 },
        ],
        energy: 3,
      });
      const htmlBefore = renderToString(<Board player={playerBefore} enemy={enemy} />);
      expect(htmlBefore).toContain('Strike');
      expect(htmlBefore).toContain('Defend');
      expect(htmlBefore).toContain('>1<'); // discard count

      // After playing Strike - 1 card in hand, 2 in discard
      const playerAfter = createTestPlayer({
        hand: [
          { id: 'h2', name: 'Defend', cost: 1, damage: 0 },
        ],
        discard: [
          { id: 'd1', name: 'Bash', cost: 2, damage: 8 },
          { id: 'h1', name: 'Strike', cost: 1, damage: 6 },
        ],
        energy: 2,
      });
      const htmlAfter = renderToString(<Board player={playerAfter} enemy={enemy} />);
      expect(htmlAfter).toContain('Defend');
      expect(htmlAfter).toContain('>2<'); // updated discard count
    });

    it('reflects energy decrease after playing a card', () => {
      const enemy = createTestEnemy();

      // Before: 3 energy
      const playerBefore = createTestPlayer({ energy: 3 });
      const htmlBefore = renderToString(<Board player={playerBefore} enemy={enemy} />);
      expect(htmlBefore).toContain('Energy');
      expect(htmlBefore).toContain('>3<');

      // After playing 1-cost card: 2 energy
      const playerAfter = createTestPlayer({ energy: 2 });
      const htmlAfter = renderToString(<Board player={playerAfter} enemy={enemy} />);
      expect(htmlAfter).toContain('>2<');
    });

    it('reflects block gained after playing defend', () => {
      const enemy = createTestEnemy();

      // Before: 0 block
      const playerBefore = createTestPlayer({ block: 0 });
      const htmlBefore = renderToString(<Board player={playerBefore} enemy={enemy} />);
      expect(htmlBefore).toContain('Block');
      expect(htmlBefore).toContain('>0<');

      // After playing Defend: 5 block
      const playerAfter = createTestPlayer({ block: 5 });
      const htmlAfter = renderToString(<Board player={playerAfter} enemy={enemy} />);
      expect(htmlAfter).toContain('>5<');
    });
  });

  describe('Determinism', () => {
    it('produces identical visual state from same seed and actions', () => {
      const seed = 12345;
      const actions: Action[] = [
        { type: 'draw' },
        { type: 'draw' },
        { type: 'draw' },
      ];

      // Create first game state and apply actions
      let state1 = createInitialState(seed);
      for (const action of actions) {
        state1 = step(state1, action);
      }

      // Create second game state from same seed and apply same actions
      let state2 = createInitialState(seed);
      for (const action of actions) {
        state2 = step(state2, action);
      }

      // Render both states
      const html1 = renderToString(<Board player={state1.player} enemy={state1.enemy} />);
      const html2 = renderToString(<Board player={state2.player} enemy={state2.enemy} />);

      // Both renders should be identical
      expect(html1).toBe(html2);
    });

    it('produces identical visual state after multiple turns with same seed', () => {
      const seed = 99999;

      // Helper to run a full game sequence
      function runGameSequence(initialSeed: number) {
        let state = createInitialState(initialSeed);
        // Draw 3 cards
        state = step(state, { type: 'draw' });
        state = step(state, { type: 'draw' });
        state = step(state, { type: 'draw' });
        // Play the first card in hand (if exists)
        if (state.player.hand.length > 0) {
          state = step(state, { type: 'play_card', cardId: state.player.hand[0].id });
        }
        // End turn
        state = step(state, { type: 'end_turn' });
        // Start next turn - draw cards
        state = step(state, { type: 'draw' });
        state = step(state, { type: 'draw' });
        return state;
      }

      const state1 = runGameSequence(seed);
      const state2 = runGameSequence(seed);

      const html1 = renderToString(<Board player={state1.player} enemy={state1.enemy} />);
      const html2 = renderToString(<Board player={state2.player} enemy={state2.enemy} />);

      expect(html1).toBe(html2);
    });

    it('produces different visual states from different seeds', () => {
      const actions: Action[] = [
        { type: 'draw' },
        { type: 'draw' },
        { type: 'draw' },
      ];

      // Create game states with different seeds
      let state1 = createInitialState(11111);
      let state2 = createInitialState(22222);

      for (const action of actions) {
        state1 = step(state1, action);
        state2 = step(state2, action);
      }

      const html1 = renderToString(<Board player={state1.player} enemy={state1.enemy} />);
      const html2 = renderToString(<Board player={state2.player} enemy={state2.enemy} />);

      // Different seeds should produce different hand orderings (thus different HTML)
      expect(html1).not.toBe(html2);
    });
  });
});
