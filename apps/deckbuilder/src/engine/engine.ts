import { starterDeck } from './cards';
import { nextInt } from './rng';
import { Action, Card, GameState } from './types';

export function createInitialState(seed: number): GameState {
  return {
    turn: 1,
    rng: { seed },
    player: {
      hp: 40,
      block: 0,
      energy: 3,
      deck: [...starterDeck],
      hand: [],
      discard: []
    },
    enemy: {
      hp: 30,
      intent: 'attack',
      damage: 6
    },
    actionLog: []
  };
}

function drawCard(state: GameState): GameState {
  if (state.player.deck.length === 0) {
    return state;
  }
  const { value, rng } = nextInt(state.rng, state.player.deck.length);
  const deck = [...state.player.deck];
  const [card] = deck.splice(value, 1);
  return {
    ...state,
    rng,
    player: {
      ...state.player,
      deck,
      hand: [...state.player.hand, card]
    }
  };
}

export function applyDamage<T extends { hp: number; block?: number }>(
  target: T,
  damage: number
): T {
  const block = target.block ?? 0;
  const remainingDamage = Math.max(0, damage - block);
  const nextBlock = Math.max(0, block - damage);
  const nextHp = Math.max(0, target.hp - remainingDamage);

  if (target.block === undefined) {
    return { ...target, hp: nextHp };
  }

  return { ...target, hp: nextHp, block: nextBlock };
}

function playCard(state: GameState, card: Card): GameState {
  if (state.player.energy < card.cost) {
    return state;
  }
  const nextEnemy = applyDamage(state.enemy, card.damage);
  return {
    ...state,
    player: {
      ...state.player,
      energy: state.player.energy - card.cost,
      hand: state.player.hand.filter((handCard) => handCard.id !== card.id),
      discard: [...state.player.discard, card]
    },
    enemy: nextEnemy
  };
}

function enemyTurn(state: GameState): GameState {
  if (state.enemy.intent === 'attack') {
    const nextPlayer = applyDamage(state.player, 6);
    return {
      ...state,
      player: nextPlayer
    };
  }
  return state;
}

export function step(state: GameState, action: Action): GameState {
  let nextState = state;
  switch (action.type) {
    case 'draw':
      nextState = drawCard(state);
      break;
    case 'play_card': {
      const card = state.player.hand.find((handCard) => handCard.id === action.cardId);
      if (!card) {
        break;
      }
      nextState = playCard(state, card);
      break;
    }
    case 'end_turn': {
      const afterEnemy = enemyTurn(state);
      nextState = {
        ...afterEnemy,
        turn: afterEnemy.turn + 1,
        player: {
          ...afterEnemy.player,
          energy: 3,
          hand: []
        }
      };
      break;
    }
    default:
      break;
  }
  return {
    ...nextState,
    actionLog: [...state.actionLog, action]
  };
}

export type { Action } from './types';
