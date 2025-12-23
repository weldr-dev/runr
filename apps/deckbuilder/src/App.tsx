import { createInitialState, step, Action } from './engine/engine';
import { usePersistence } from './hooks/usePersistence';

export default function App() {
  const {
    state,
    setState,
    autoSaveEnabled,
    setAutoSaveEnabled,
    clearSavedState
  } = usePersistence(() => createInitialState(1));

  const dispatch = (action: Action) => {
    setState((current) => step(current, action));
  };

  const startNewGame = () => {
    clearSavedState();
    setState(() => createInitialState(1));
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Deckbuilder Prototype</h1>
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
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
      </section>
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
                  onClick={() => dispatch({ type: 'play_card', cardId: card.id })}
                >
                  Play
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={() => dispatch({ type: 'draw' })}>
          Draw
        </button>
        <button type="button" onClick={() => dispatch({ type: 'end_turn' })}>
          End Turn
        </button>
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
