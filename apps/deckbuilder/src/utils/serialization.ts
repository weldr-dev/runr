import type { Action, Card, GameState } from '../engine/types';

export interface ExportedGameState {
  state: GameState;
  seed: number;
  actionLog: Action[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCard(value: unknown): value is Card {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNumber(value.cost) &&
    isNumber(value.damage)
  );
}

function isCardList(value: unknown): value is Card[] {
  return Array.isArray(value) && value.every(isCard);
}

function isAction(value: unknown): value is Action {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'play_card') {
    return typeof value.cardId === 'string';
  }

  return value.type === 'draw' || value.type === 'end_turn';
}

function isActionLog(value: unknown): value is Action[] {
  return Array.isArray(value) && value.every(isAction);
}

function isPlayer(value: unknown): value is GameState['player'] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNumber(value.hp) &&
    isNumber(value.block) &&
    isNumber(value.energy) &&
    isCardList(value.deck) &&
    isCardList(value.hand) &&
    isCardList(value.discard)
  );
}

function isEnemy(value: unknown): value is GameState['enemy'] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNumber(value.hp) &&
    (value.intent === 'attack' || value.intent === 'rest') &&
    isNumber(value.damage)
  );
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNumber(value.turn)) {
    return false;
  }

  if (!isRecord(value.rng) || !isNumber(value.rng.seed)) {
    return false;
  }

  if (!isPlayer(value.player) || !isEnemy(value.enemy)) {
    return false;
  }

  if (!isActionLog(value.actionLog)) {
    return false;
  }

  return true;
}

function isSameAction(left: Action, right: Action): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === 'play_card' && right.type === 'play_card') {
    return left.cardId === right.cardId;
  }

  return true;
}

function actionLogsMatch(left: Action[], right: Action[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isSameAction(left[index], right[index])) {
      return false;
    }
  }

  return true;
}

function isExportedGameState(value: unknown): value is ExportedGameState {
  if (!isRecord(value)) {
    return false;
  }

  if (!isGameState(value.state)) {
    return false;
  }

  if (!isNumber(value.seed) || !isActionLog(value.actionLog)) {
    return false;
  }

  if (value.seed !== value.state.rng.seed) {
    return false;
  }

  if (!actionLogsMatch(value.actionLog, value.state.actionLog)) {
    return false;
  }

  return true;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeExport(state: GameState): string {
  const payload: ExportedGameState = {
    state,
    seed: state.rng.seed,
    actionLog: state.actionLog
  };
  return JSON.stringify(payload, null, 2);
}

export function deserializeExport(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isExportedGameState(parsed)) {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}
