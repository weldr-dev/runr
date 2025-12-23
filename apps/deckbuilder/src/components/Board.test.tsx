import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Board } from './Board';
import { Card } from './Card';
import type { Player, Enemy, Card as CardData } from '../engine/types';

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
      expect(html).toContain('HP:');
      expect(html).toContain('45');
    });

    it('renders enemy intent', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ intent: 'attack' });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Intent:');
      expect(html).toContain('attack');
    });

    it('renders enemy damage', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ damage: 15 });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Damage:');
      expect(html).toContain('15');
    });

    it('renders rest intent when enemy is resting', () => {
      const player = createTestPlayer();
      const enemy = createTestEnemy({ intent: 'rest' });
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('rest');
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
      expect(html).toContain('Deck Pile');
      expect(html).toContain('>5<');
    });

    it('displays zero when deck is empty', () => {
      const player = createTestPlayer({ deck: [] });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Deck Pile');
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
      expect(html).toContain('Discard Pile');
      expect(html).toContain('>3<');
    });

    it('displays zero when discard is empty', () => {
      const player = createTestPlayer({ discard: [] });
      const enemy = createTestEnemy();
      const html = renderToString(<Board player={player} enemy={enemy} />);
      expect(html).toContain('Discard Pile');
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
      expect(html).toContain('Hand Zone');
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
  });
});
