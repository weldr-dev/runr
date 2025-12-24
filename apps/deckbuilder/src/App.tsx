import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { getNextAction } from './ai/ai';
import { Board } from './components/Board';
import { createInitialState, step, Action } from './engine/engine';
import { ReplayControls } from './components/ReplayControls';
import { usePersistence } from './hooks/usePersistence';
import { deserializeExport, serializeExport } from './utils/serialization';
import { Modal } from './components/Modal';
import { GameMenu } from './components/GameMenu';

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
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(300);
  const autoPlayStopRef = useRef(false);
  const [isEnemyTurn, setIsEnemyTurn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'end_turn') {
      setIsEnemyTurn(true);
      setTimeout(() => {
        setState((current) => step(current, action));
        setIsEnemyTurn(false);
      }, 600);
    } else {
      setState((current) => step(current, action));
    }
  }, [setState]);

  const autoPlayGame = async () => {
    if (isAutoPlaying) {
      return;
    }
    if (state.player.hp <= 0 || state.enemy.hp <= 0) {
      return;
    }
    setIsAutoPlaying(true);
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

  const openMenu = () => setIsMenuOpen(true);
  const closeMenu = () => setIsMenuOpen(false);
  const openSettings = () => setIsSettingsOpen(true);
  const closeSettings = () => setIsSettingsOpen(false);

  const canReplay = replaySeed !== null && replayActions.length > 0;

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
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0c0a1d 0%, #1a1333 50%, #0f0d1a 100%)',
        color: '#e2e8f0'
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 40,
          maxHeight: 40,
          padding: '0 16px',
          background: 'linear-gradient(180deg, #1e293b, #0f172a)',
          borderBottom: '1px solid #334155'
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>Deckbuilder</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={startNewGame}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 500,
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            New Game
          </button>
          <button
            type="button"
            onClick={openMenu}
            aria-label="Open menu"
            style={{
              padding: '4px 8px',
              fontSize: 18,
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ☰
          </button>
          <span
            title={autoSaveEnabled ? 'Auto-save enabled' : 'Auto-save disabled'}
            style={{
              fontSize: 10,
              color: autoSaveEnabled ? '#22c55e' : '#64748b'
            }}
          >
            ●
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </header>
      <div style={{ padding: 24 }}>
      {importError ? (
        <p style={{ color: '#fca5a5', marginBottom: 16 }} role="alert">
          {importError}
        </p>
      ) : null}
      <ReplayControls
        totalActions={replayActions.length}
        currentIndex={replayIndex}
        isReplaying={isReplaying}
        canReplay={canReplay}
        onReplay={startReplay}
        onStop={stopReplay}
      />
      <Board
        player={state.player}
        enemy={state.enemy}
        onPlayCard={(cardId) => dispatch({ type: 'play_card', cardId })}
        disableActions={isAutoPlaying || isReplaying || isEnemyTurn}
        isEnemyTurn={isEnemyTurn}
        onDraw={() => dispatch({ type: 'draw' })}
        onEndTurn={() => dispatch({ type: 'end_turn' })}
        isAutoPlaying={isAutoPlaying}
        isGameOver={isGameOver}
        autoPlaySpeed={autoPlaySpeed}
        onAutoPlayGame={autoPlayGame}
        onStopAutoPlay={stopAutoPlay}
        onSpeedChange={setAutoPlaySpeed}
      />

      <Modal isOpen={isMenuOpen} onClose={closeMenu} title="Game Menu">
        <GameMenu
          onExport={handleExport}
          onImport={handleImportClick}
          onReplay={startReplay}
          onSettings={openSettings}
          canReplay={canReplay}
          onClose={closeMenu}
        />
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={closeSettings} title="Settings">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(event) => setAutoSaveEnabled(event.target.checked)}
            />
            Auto-save game progress
          </label>
        </div>
      </Modal>
      </div>
    </main>
  );
}
