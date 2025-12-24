import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card as CardData } from '../engine/types';

interface CardProps {
  card: CardData;
  playerEnergy: number;
  onPlay?: (cardId: string) => void;
  disabled?: boolean;
  isPlaying?: boolean;
}

// Poker card proportions: ~2.5:3.5 ratio (width:height) - compact size
const CARD_WIDTH = 120;
const CARD_HEIGHT = 168;

export function Card({ card, playerEnergy, onPlay, disabled = false, isPlaying = false }: CardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isPlayable = card.cost <= playerEnergy;
  const canActivate = isPlayable && !disabled && Boolean(onPlay);

  // Determine status message
  const getStatusMessage = () => {
    if (disabled) return 'Actions locked';
    if (!isPlayable) return 'Not enough energy';
    return 'Playable';
  };

  // Compute dynamic styles
  const getTransform = () => {
    if (isPlaying) {
      return 'translateY(-200px) scale(0.8) rotate(10deg)';
    }
    if (canActivate && isHovered) {
      return 'translateY(-8px) scale(1.05)';
    }
    return 'translateY(0) scale(1)';
  };

  const getBoxShadow = () => {
    if (!canActivate) {
      return '0 2px 4px rgba(0, 0, 0, 0.1)';
    }
    if (isHovered) {
      return '0 16px 32px rgba(34, 197, 94, 0.3), 0 0 0 2px rgba(34, 197, 94, 0.5)';
    }
    return '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(34, 197, 94, 0.4)';
  };

  const cardStyle: CSSProperties = {
    position: 'relative',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: isPlaying
      ? 'transform 300ms ease-out, opacity 300ms ease-out, box-shadow 200ms ease, filter 200ms ease'
      : 'transform 200ms ease, box-shadow 200ms ease, filter 200ms ease',
    cursor: canActivate ? 'pointer' : 'not-allowed',
    transform: getTransform(),
    boxShadow: isPlaying ? '0 20px 40px rgba(239, 68, 68, 0.5)' : getBoxShadow(),
    filter: canActivate ? 'none' : 'grayscale(0.6) brightness(0.9)',
    opacity: isPlaying ? 0 : canActivate ? 1 : 0.7,
    background: canActivate
      ? 'linear-gradient(145deg, #fefefe 0%, #f8fafc 100%)'
      : 'linear-gradient(145deg, #e2e8f0 0%, #cbd5e1 100%)',
    border: canActivate ? '1px solid #d1d5db' : '1px solid #94a3b8'
  };

  // Cost badge in top-left corner
  const costBadgeStyle: CSSProperties = {
    position: 'absolute',
    top: 6,
    left: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  };

  const costOrbStyle: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: canActivate
      ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
      : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
    border: '2px solid rgba(255, 255, 255, 0.8)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
  };

  const costLabelStyle: CSSProperties = {
    fontSize: 8,
    fontWeight: 600,
    color: canActivate ? '#64748b' : '#94a3b8',
    marginTop: 2
  };

  // Card name area
  const nameStyle: CSSProperties = {
    marginTop: 32,
    padding: '0 6px',
    fontSize: 11,
    fontWeight: 700,
    color: canActivate ? '#1e293b' : '#64748b',
    textAlign: 'center',
    lineHeight: 1.2
  };

  // Card art placeholder area
  const artAreaStyle: CSSProperties = {
    flex: 1,
    margin: '3px 6px',
    borderRadius: 5,
    background: canActivate
      ? 'linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%)'
      : 'linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  // Stats row at bottom
  const statsRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 6px 5px'
  };

  // Damage badge
  const damageBadgeStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  };

  const damageOrbStyle: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 5,
    background: canActivate
      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
      : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
    border: '2px solid rgba(255, 255, 255, 0.8)',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
  };

  const damageLabelStyle: CSSProperties = {
    fontSize: 8,
    fontWeight: 600,
    color: canActivate ? '#64748b' : '#94a3b8',
    marginTop: 2
  };

  // Status text
  const statusStyle: CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    color: canActivate ? '#22c55e' : '#94a3b8',
    textAlign: 'center',
    flex: 1
  };

  return (
    <div
      role={onPlay ? 'button' : undefined}
      tabIndex={canActivate ? 0 : undefined}
      aria-disabled={!canActivate}
      aria-label={`${card.name}, costs ${card.cost} energy, deals ${card.damage} damage${canActivate ? ', playable' : disabled ? ', actions locked' : ', not enough energy'}`}
      onClick={() => {
        if (canActivate && onPlay) {
          onPlay(card.id);
        }
      }}
      onKeyDown={(event) => {
        if (!canActivate || !onPlay) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPlay(card.id);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={cardStyle}
    >
      {/* Cost badge */}
      <div style={costBadgeStyle}>
        <div style={costOrbStyle}>{card.cost}</div>
        <span style={costLabelStyle}>Cost</span>
      </div>

      {/* Card name */}
      <div style={nameStyle}>{card.name}</div>

      {/* Art area placeholder */}
      <div style={artAreaStyle}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>⚔</span>
      </div>

      {/* Stats row */}
      <div style={statsRowStyle}>
        {/* Status message */}
        <span style={statusStyle}>{getStatusMessage()}</span>

        {/* Damage badge */}
        <div style={damageBadgeStyle}>
          <div style={damageOrbStyle}>{card.damage}</div>
          <span style={damageLabelStyle}>Damage</span>
        </div>
      </div>
    </div>
  );
}
