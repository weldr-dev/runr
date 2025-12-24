export interface Position {
  x: number;
  y: number;
}

export interface Unit {
  id: string;
  position: Position;
  hp: number;
  maxHp: number;
  attack: number;
  moveRange: number;
  attackRange: number;
  team: "player" | "enemy";
}

export interface RNGState {
  seed: number;
}

export type Action =
  | { type: "move"; unitId: string; target: Position }
  | { type: "attack"; unitId: string; targetId: string }
  | { type: "end_turn" };

export interface GameState {
  grid: { width: number; height: number };
  units: Unit[];
  currentTeam: "player" | "enemy";
  turn: number;
  rng: RNGState;
}
