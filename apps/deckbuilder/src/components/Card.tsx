import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card as CardData } from '../engine/types';

interface CardProps {
  card: CardData;
  playerEnergy: number;
  onPlay?: (cardId: string) => void;
  disabled?: boolean;
}

export function Card({ card, playerEnergy, onPlay, disabled = false }: CardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isPlayable = card.cost <= playerEnergy;
  const canActivate = isPlayable && !disabled && Boolean(onPlay);
  const statusLabel = disabled ? 'Actions locked' : isPlayable ? 'Playable' : 'Not enough energy';

  const baseStyle: CSSProperties = {
    borderRadius: 16,
    padding: 14,
    minHeight: 140,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 12,
    transition: 'transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.12)',
    cursor: canActivate ? 'pointer' : 'not-allowed',
    opacity: canActivate ? 1 : 0.55,
    filter: canActivate ? 'none' : 'grayscale(0.5)',
    transform: canActivate && isHovered ? 'translateY(-3px)' : 'translateY(0)'
  };

  const activeStyle: CSSProperties = isPlayable && !disabled
    ? {
        border: '1px solid #22c55e',
        background: 'linear-gradient(140deg, #ecfdf3, #f0fdf4)'
      }
    : {
        border: '1px solid #94a3b8',
        background: 'linear-gradient(140deg, #f1f5f9, #e2e8f0)'
      };

  const hoverShadow: CSSProperties =
    canActivate && isHovered ? { boxShadow: '0 12px 20px rgba(34, 197, 94, 0.25)' } : {};

  return (
    <div
      role={onPlay ? 'button' : undefined}
      tabIndex={canActivate ? 0 : undefined}
      aria-disabled={!canActivate}
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
      onMouseEnter={() => {
        if (canActivate) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...baseStyle,
        ...activeStyle,
        ...hoverShadow
      }}
    >
      <div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: isPlayable ? '#064e3b' : '#334155',
            marginBottom: 6
          }}
        >
          {card.name}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: isPlayable && !disabled ? '#16a34a' : '#64748b'
          }}
        >
          {statusLabel}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div
          style={{
            flex: 1,
            borderRadius: 12,
            padding: '8px 10px',
            background: '#fff7ed',
            border: '1px solid #fdba74',
            textAlign: 'center',
            color: '#9a3412'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase' }}>Cost</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{card.cost}</div>
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: 12,
            padding: '8px 10px',
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            textAlign: 'center',
            color: '#1d4ed8'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase' }}>Damage</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{card.damage}</div>
        </div>
      </div>
    </div>
  );
}
