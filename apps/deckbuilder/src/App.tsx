import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getNextAction } from './ai/ai';
import { AutoPlayControls } from './components/AutoPlayControls';
import { createInitialState, step, Action } from './engine/engine';
import { ReplayControls } from './components/ReplayControls';
import { usePersistence } from './hooks/usePersistence';
import { deserializeExport, serializeExport } from './utils/serialization';
import type { GameState } from './engine/types';

export default function App() {
  const {
    state,
    setState,
    autoSaveEnabled,
    setAutoSaveEnabled,
    clearSavedState
  } = usePersistence(() => createInitialState(1));
  const [importError, setImportError] = useState<string | null>(null);
  const [replaySeed, setReplaySeed] = useState<number | null>(null);
  const [replayActions, setReplayActions] = useState<Action[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(300);
  const autoPlayStopRef = useRef(false);

  const dispatch = (action: Action) => {
    setState((current) => step(current, action));
  };

  const describeAction = (action: Action, currentState: GameState) => {
    switch (action.type) {
      case 'draw':
        return 'AI draws a card';
      case 'play_card': {
        const card = currentState.player.hand.find(
          (handCard) => handCard.id === action.cardId
        );
        if (card) {
          return `AI plays ${card.name} (cost ${card.cost}, dmg ${card.damage})`;
        }
        return `AI plays card ${action.cardId}`;
      }
      case 'end_turn':
        return 'AI ends the turn';
      default:
        return 'AI waits';
    }
  };

  const pushActionLog = (entry: string) => {
    setActionLog((prev) => {
      const next = [...prev, entry];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  };

  const autoPlayGame = async () => {
    if (isAutoPlaying) {
      return;
    }
    if (state.player.hp <= 0 || state.enemy.hp <= 0) {
      return;
    }
    setIsAutoPlaying(true);
    setActionLog([]);
    autoPlayStopRef.current = false;
    let currentState = state;
    try {
      while (true) {
        if (
          autoPlayStopRef.current ||
          currentState.player.hp <= 0 ||
          currentState.enemy.hp <= 0
        ) {
          break;
        }
        const nextAction = getNextAction(currentState);
        const action = nextAction ?? { type: 'end_turn' as const };
        pushActionLog(describeAction(action, currentState));
        const nextState = step(currentState, action);
        currentState = nextState;
        setState(nextState);
        await new Promise((resolve) => setTimeout(resolve, autoPlaySpeed));
      }
    } finally {
      autoPlayStopRef.current = false;
      setIsAutoPlaying(false);
    }
  };

  const stopAutoPlay = () => {
    autoPlayStopRef.current = true;
  };

  const isGameOver = state.player.hp <= 0 || state.enemy.hp <= 0;

  const stopReplay = () => {
    setIsReplaying(false);
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  };

  const startReplay = () => {
    if (replaySeed === null || replayActions.length === 0) {
      return;
    }
    stopReplay();
    setReplayIndex(0);
    setState(() => createInitialState(replaySeed));
    setIsReplaying(true);
  };

  const startNewGame = () => {
    setImportError(null);
    stopReplay();
    stopAutoPlay();
    setReplaySeed(null);
    setReplayActions([]);
    setReplayIndex(0);
    clearSavedState();
    setState(() => createInitialState(1));
  };

  const handleExport = () => {
    const payload = serializeExport(state);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'deckbuilder-save.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const nextState = deserializeExport(text);
      if (!nextState) {
        setImportError('Invalid save file. Please check the JSON and try again.');
        return;
      }
      setImportError(null);
      stopReplay();
      setReplaySeed(nextState.rng.seed);
      setReplayActions(nextState.actionLog);
      setReplayIndex(0);
      setState(nextState);
    } catch {
      setImportError('Unable to read the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (!isReplaying) {
      if (replayTimerRef.current !== null) {
        window.clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    if (replayIndex >= replayActions.length) {
      setIsReplaying(false);
      return;
    }

    replayTimerRef.current = window.setTimeout(() => {
      setState((current) => step(current, replayActions[replayIndex]));
      setReplayIndex((index) => index + 1);
    }, 500);

    return () => {
      if (replayTimerRef.current !== null) {
        window.clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [isReplaying, replayActions, replayIndex, setState]);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Deckbuilder Prototype</h1>
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={autoSaveEnabled}
            onChange={(event) => setAutoSaveEnabled(event.target.checked)}
          />
          Auto-save
        </label>
        <button type="button" onClick={startNewGame}>
          New Game
        </button>
        <button type="button" onClick={handleExport}>
          Export
        </button>
        <button type="button" onClick={handleImportClick}>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </section>
      {importError ? (
        <p style={{ color: '#b91c1c', marginBottom: 16 }} role="alert">
          {importError}
        </p>
      ) : null}
      <ReplayControls
        totalActions={replayActions.length}
        currentIndex={replayIndex}
        isReplaying={isReplaying}
        canReplay={replaySeed !== null && replayActions.length > 0}
        onReplay={startReplay}
        onStop={stopReplay}
      />
      <section style={{ marginBottom: 16 }}>
        <h2>Player</h2>
        <p>HP: {state.player.hp}</p>
        <p>Energy: {state.player.energy}</p>
      </section>
      <section style={{ marginBottom: 16 }}>
        <h2>Enemy</h2>
        <p>HP: {state.enemy.hp}</p>
        <p>Intent: {state.enemy.intent}</p>
      </section>
      <section style={{ marginBottom: 16 }}>
        <h2>Hand</h2>
        {state.player.hand.length === 0 ? (
          <p>(empty)</p>
        ) : (
          <ul>
            {state.player.hand.map((card) => (
              <li key={card.id}>
                {card.name} (cost {card.cost}, dmg {card.damage}){' '}
                <button
                  type="button"
                  disabled={isAutoPlaying || isReplaying}
                  onClick={() => dispatch({ type: 'play_card', cardId: card.id })}
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            disabled={isAutoPlaying || isReplaying}
            onClick={() => dispatch({ type: 'draw' })}
          >
            Draw
          </button>
          <button
            type="button"
            disabled={isAutoPlaying || isReplaying}
            onClick={() => dispatch({ type: 'end_turn' })}
          >
            End Turn
          </button>
        </div>
        <AutoPlayControls
          isAutoPlaying={isAutoPlaying}
          actionLog={actionLog}
          autoPlaySpeed={autoPlaySpeed}
          turn={state.turn}
          isGameOver={isGameOver}
          onAutoPlayGame={autoPlayGame}
          onStopAutoPlay={stopAutoPlay}
          onSpeedChange={setAutoPlaySpeed}
        />
      </section>
      <section style={{ marginTop: 16 }}>
        <h2>Action Log</h2>
        <p>Total actions: {state.actionLog.length}</p>
        {state.actionLog.length === 0 ? (
          <p>(no actions yet)</p>
        ) : (
          <ol>
            {state.actionLog.map((action, index) => (
              <li key={`${action.type}-${index}`}>
                {action.type === 'play_card'
                  ? `play_card (${action.cardId})`
                  : action.type}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
