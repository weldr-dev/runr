import { isValidMoveTarget } from "./grid";
import { isValidAttackTarget, resolveCombat } from "./combat";
import type { Action, GameState, Position, Unit } from "./types";

function updateUnit(units: Unit[], updated: Unit): Unit[] {
  return units.map((unit) => (unit.id === updated.id ? updated : unit));
}

export function createInitialState(seed = 1): GameState {
  return {
    grid: { width: 8, height: 8 },
    units: [
      {
        id: "player-1",
        position: { x: 1, y: 6 },
        hp: 10,
        maxHp: 10,
        attack: 3,
        moveRange: 3,
        attackRange: 1,
        team: "player"
      },
      {
        id: "player-2",
        position: { x: 3, y: 6 },
        hp: 12,
        maxHp: 12,
        attack: 2,
        moveRange: 2,
        attackRange: 2,
        team: "player"
      },
      {
        id: "enemy-1",
        position: { x: 4, y: 1 },
        hp: 9,
        maxHp: 9,
        attack: 3,
        moveRange: 2,
        attackRange: 1,
        team: "enemy"
      },
      {
        id: "enemy-2",
        position: { x: 6, y: 1 },
        hp: 11,
        maxHp: 11,
        attack: 2,
        moveRange: 3,
        attackRange: 1,
        team: "enemy"
      }
    ],
    currentTeam: "player",
    turn: 1,
    rng: { seed }
  };
}

function canActUnit(state: GameState, unit: Unit): boolean {
  return unit.team === state.currentTeam;
}

function handleMove(
  state: GameState,
  unit: Unit,
  target: Position
): GameState {
  if (!canActUnit(state, unit)) {
    return state;
  }

  if (!isValidMoveTarget(unit, target, state.grid, state.units)) {
    return state;
  }

  return {
    ...state,
    units: updateUnit(state.units, { ...unit, position: target })
  };
}

function handleAttack(
  state: GameState,
  attacker: Unit,
  defender: Unit
): GameState {
  if (!canActUnit(state, attacker)) {
    return state;
  }

  if (!isValidAttackTarget(attacker, defender)) {
    return state;
  }

  const { defender: updatedDefender } = resolveCombat(attacker, defender);
  return {
    ...state,
    units: updateUnit(state.units, updatedDefender)
  };
}

export function step(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "move": {
      const unit = state.units.find((item) => item.id === action.unitId);
      if (!unit) {
        return state;
      }
      return handleMove(state, unit, action.target);
    }
    case "attack": {
      const attacker = state.units.find((item) => item.id === action.unitId);
      const defender = state.units.find((item) => item.id === action.targetId);
      if (!attacker || !defender) {
        return state;
      }
      return handleAttack(state, attacker, defender);
    }
    case "end_turn":
      return {
        ...state,
        currentTeam: state.currentTeam === "player" ? "enemy" : "player",
        turn: state.turn + 1
      };
    default:
      return state;
  }
}

