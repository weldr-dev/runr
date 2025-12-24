import type { CSSProperties } from 'react';

interface ReplayControlsProps {
  totalActions: number;
  currentIndex: number;
  isReplaying: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function ReplayControls({
  totalActions,
  currentIndex,
  isReplaying,
  isPaused,
  onPause,
  onResume,
  onStop,
}: ReplayControlsProps) {
  // Only show when actively replaying
  if (!isReplaying) {
    return null;
  }

  const clampedIndex = Math.min(currentIndex, totalActions);

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.95), rgba(79, 70, 229, 0.95))',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    zIndex: 100,
    border: '1px solid rgba(255, 255, 255, 0.2)',
  };

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  const progressStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.9)',
    minWidth: 80,
    textAlign: 'center',
  };

  const buttonStyle: CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 500,
    background: 'rgba(255, 255, 255, 0.2)',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    cursor: 'pointer',
  };

  return (
    <div style={overlayStyle} role="status" aria-live="polite">
      <span style={labelStyle}>
        <span style={{ fontSize: 14 }}>{isPaused ? '⏸' : '▶'}</span>
        Replay
      </span>
      <span style={progressStyle}>
        {isPaused ? 'Paused' : 'Playing'} action {clampedIndex}/{totalActions}
      </span>
      <button
        type="button"
        onClick={isPaused ? onResume : onPause}
        style={buttonStyle}
        aria-label={isPaused ? 'Resume replay' : 'Pause replay'}
      >
        {isPaused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        onClick={onStop}
        style={buttonStyle}
        aria-label="Stop replay"
      >
        Stop
      </button>
    </div>
  );
}
