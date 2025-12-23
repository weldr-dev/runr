import type { ReactNode } from 'react';

interface ReplayControlsProps {
  totalActions: number;
  currentIndex: number;
  isReplaying: boolean;
  canReplay: boolean;
  onReplay: () => void;
  onStop: () => void;
  status?: ReactNode;
}

export function ReplayControls({
  totalActions,
  currentIndex,
  isReplaying,
  canReplay,
  onReplay,
  onStop,
  status
}: ReplayControlsProps) {
  const clampedIndex = Math.min(currentIndex, totalActions);
  const progressMax = Math.max(totalActions, 1);

  return (
    <section
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16
      }}
    >
      <h2>Replay</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onReplay} disabled={!canReplay || isReplaying}>
          {isReplaying ? 'Replaying...' : 'Replay'}
        </button>
        <button type="button" onClick={onStop} disabled={!isReplaying}>
          Stop
        </button>
        <span aria-live="polite">
          Progress: {clampedIndex} / {totalActions}
        </span>
        {status}
      </div>
      <progress
        value={clampedIndex}
        max={progressMax}
        style={{ width: '100%', marginTop: 8 }}
      />
    </section>
  );
}
