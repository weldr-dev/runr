import { describe, expect, it } from 'vitest';
import { deserialize, deserializeExport, serialize, serializeExport } from '../utils/serialization';
import { applyDamage, createInitialState, step } from './engine';

function buildSampleState(seed: number) {
  let state = createInitialState(seed);
  state = step(state, { type: 'draw' });
  const firstCard = state.player.hand[0];
  if (!firstCard) {
    throw new Error('Expected a card in hand');
  }
  state = step(state, { type: 'play_card', cardId: firstCard.id });
  state = step(state, { type: 'end_turn' });
  state = step(state, { type: 'draw' });
  const secondCard = state.player.hand[0];
  if (!secondCard) {
    throw new Error('Expected a card in hand');
  }
  state = step(state, { type: 'play_card', cardId: secondCard.id });
  return state;
}

describe('engine', () => {
  it('draws a deterministic card', () => {
    const state = createInitialState(2);
    const next = step(state, { type: 'draw' });
    expect(next.player.hand).toHaveLength(1);
    expect(next.player.hand[0].id).toBe('strike-2');
  });

  it('plays a card and damages enemy', () => {
    const state = createInitialState(1);
    const drawn = step(state, { type: 'draw' });
    const card = drawn.player.hand[0];
    const afterPlay = step(drawn, { type: 'play_card', cardId: card.id });
    expect(afterPlay.enemy.hp).toBeLessThan(state.enemy.hp);
    expect(afterPlay.player.energy).toBe(state.player.energy - card.cost);
  });

  it('applies damage to block before hp and floors at 0', () => {
    const target = { hp: 10, block: 5 };
    const reduced = applyDamage(target, 7);
    expect(reduced.block).toBe(0);
    expect(reduced.hp).toBe(8);

    const floored = applyDamage(target, 20);
    expect(floored.block).toBe(0);
    expect(floored.hp).toBe(0);
  });

  it('reduces damage with block without dropping hp', () => {
    const target = { hp: 12, block: 8 };
    const reduced = applyDamage(target, 5);
    expect(reduced.block).toBe(3);
    expect(reduced.hp).toBe(12);
  });

  it('never allows block or hp to go negative', () => {
    const target = { hp: 4, block: 2 };
    const reduced = applyDamage(target, 10);
    expect(reduced.block).toBe(0);
    expect(reduced.hp).toBe(0);
  });

  it('end turn triggers a deterministic enemy attack', () => {
    const state = createInitialState(1);
    const withBlock = {
      ...state,
      player: {
        ...state.player,
        hp: 20,
        block: 4
      }
    };
    const after = step(withBlock, { type: 'end_turn' });
    expect(after.player.hp).toBe(18);
    expect(after.player.block).toBe(0);
    expect(after.turn).toBe(withBlock.turn + 1);
  });

  it('save/restore round-trip produces identical serialized state', () => {
    const state = buildSampleState(7);
    const saved = serialize(state);
    const restored = deserialize(saved);
    expect(restored).not.toBeNull();
    if (!restored) {
      throw new Error('Expected restored state');
    }
    expect(serialize(restored)).toBe(saved);
  });

  it('export/import round-trip produces identical state', () => {
    const state = buildSampleState(11);
    const exported = serializeExport(state);
    const restored = deserializeExport(exported);
    expect(restored).not.toBeNull();
    if (!restored) {
      throw new Error('Expected exported state');
    }
    expect(serialize(restored)).toBe(serialize(state));
  });

  it('replay with same seed produces identical final state', () => {
    const initialSeed = 5;
    const state = buildSampleState(initialSeed);
    const replayed = state.actionLog.reduce(
      (current, action) => step(current, action),
      createInitialState(initialSeed)
    );
    expect(serialize(replayed)).toBe(serialize(state));
  });
});
