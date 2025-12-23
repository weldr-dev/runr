import type { GameState } from '../engine/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  const rng = value.rng;
  const player = value.player;
  const enemy = value.enemy;
  const actionLog = value.actionLog;

  if (!isRecord(rng) || typeof rng.seed !== 'number') {
    return false;
  }

  if (!isRecord(player)) {
    return false;
  }

  if (
    typeof player.hp !== 'number' ||
    typeof player.block !== 'number' ||
    typeof player.energy !== 'number' ||
    !Array.isArray(player.deck) ||
    !Array.isArray(player.hand) ||
    !Array.isArray(player.discard)
  ) {
    return false;
  }

  if (!isRecord(enemy)) {
    return false;
  }

  if (
    typeof enemy.hp !== 'number' ||
    (enemy.intent !== 'attack' && enemy.intent !== 'rest') ||
    typeof enemy.damage !== 'number'
  ) {
    return false;
  }

  if (typeof value.turn !== 'number' || !Array.isArray(actionLog)) {
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
