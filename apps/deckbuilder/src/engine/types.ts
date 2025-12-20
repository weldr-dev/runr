export interface Card {
  id: string;
  name: string;
  cost: number;
  damage: number;
}

export interface Player {
  hp: number;
  energy: number;
  deck: Card[];
  hand: Card[];
  discard: Card[];
}

export interface Enemy {
  hp: number;
  intent: 'attack' | 'rest';
  damage: number;
}

export interface RNGState {
  seed: number;
}

export interface GameState {
  turn: number;
  rng: RNGState;
  player: Player;
  enemy: Enemy;
}

export type Action =
  | { type: 'draw' }
  | { type: 'play_card'; cardId: string }
  | { type: 'end_turn' };
