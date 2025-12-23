import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '../engine/types';
import { deserialize, serialize } from '../utils/serialization';

const STATE_KEY = 'deckbuilder:auto-save';
const TOGGLE_KEY = 'deckbuilder:auto-save:enabled';

function safeGetItem(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (quota, privacy mode).
  }
}

function safeRemoveItem(key: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

function loadAutoSaveEnabled(): boolean {
  const raw = safeGetItem(TOGGLE_KEY);
  if (raw === null) {
    return true;
  }
  return raw === 'true';
}

function loadState(): GameState | null {
  const raw = safeGetItem(STATE_KEY);
  if (!raw) {
    return null;
  }
  return deserialize(raw);
}

function saveState(state: GameState): void {
  safeSetItem(STATE_KEY, serialize(state));
}

export function usePersistence(initialStateFactory: () => GameState) {
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(loadAutoSaveEnabled);
  const [state, setState] = useState(() => {
    if (autoSaveEnabled) {
      const saved = loadState();
      if (saved) {
        return saved;
      }
    }
    return initialStateFactory();
  });

  useEffect(() => {
    safeSetItem(TOGGLE_KEY, autoSaveEnabled ? 'true' : 'false');
  }, [autoSaveEnabled]);

  useEffect(() => {
    if (!autoSaveEnabled) {
      return;
    }
    saveState(state);
  }, [autoSaveEnabled, state]);

  const clearSavedState = useCallback(() => {
    safeRemoveItem(STATE_KEY);
  }, []);

  return {
    state,
    setState,
    autoSaveEnabled,
    setAutoSaveEnabled,
    clearSavedState
  };
}
