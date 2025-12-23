interface AutoPlayControlsProps {
  isAutoPlaying: boolean;
  actionLog: string[];
  onAutoPlayTurn: () => void;
}

export function AutoPlayControls({
  isAutoPlaying,
  actionLog,
  onAutoPlayTurn
}: AutoPlayControlsProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
      <button type="button" onClick={onAutoPlayTurn} disabled={isAutoPlaying}>
        Auto-Play Turn
      </button>
      <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
        <strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>AI Actions</strong>
        {actionLog.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#666' }}>(no actions yet)</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {actionLog.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
