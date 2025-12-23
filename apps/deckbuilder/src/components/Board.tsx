import type { CSSProperties } from 'react';
import type { Enemy, Player } from '../engine/types';
import { Card } from './Card';
import { PlayerStats } from './PlayerStats';

interface BoardProps {
  player: Player;
  enemy: Enemy;
  onPlayCard?: (cardId: string) => void;
  disableActions?: boolean;
}

function CardStack({
  count,
  label,
  variant
}: {
  count: number;
  label: string;
  variant: 'deck' | 'discard';
}) {
  const isDeck = variant === 'deck';
  const baseColor = isDeck ? '#3b82f6' : '#ef4444';
  const darkColor = isDeck ? '#1e40af' : '#991b1b';

  const stackStyle: CSSProperties = {
    position: 'relative',
    width: 70,
    height: 95,
    perspective: '200px'
  };

  const cardLayers = Math.min(count, 5);
  const cards = [];

  for (let i = 0; i < cardLayers; i++) {
    const offset = i * 2;
    cards.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          borderRadius: 8,
          background: `linear-gradient(135deg, ${baseColor}, ${darkColor})`,
          border: `2px solid ${darkColor}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          transform: `translateY(${-offset}px) translateX(${offset * 0.5}px)`,
          zIndex: cardLayers - i
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={stackStyle}>{cards}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#f8fafc',
          textShadow: '0 2px 4px rgba(0,0,0,0.5)'
        }}
      >
        {count}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: '#94a3b8'
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function Board({ player, enemy, onPlayCard, disableActions = false }: BoardProps) {
  const handCount = player.hand.length;

  const getCardTransform = (index: number, total: number): CSSProperties => {
    if (total <= 1) {
      return { transform: 'rotate(0deg) translateY(0px)' };
    }
    const centerIndex = (total - 1) / 2;
    const offset = index - centerIndex;
    const maxRotation = 8;
    const rotation = offset * (maxRotation / Math.max(total - 1, 1));
    const arcHeight = 12;
    const normalizedDistance = Math.abs(offset) / centerIndex;
    const yOffset = normalizedDistance * normalizedDistance * arcHeight;

    return {
      transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
      transformOrigin: 'center bottom'
    };
  };

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        width: 'min(100%, 1100px)',
        minHeight: 600,
        margin: '0 auto',
        padding: '24px 20px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        borderRadius: 20,
        border: '2px solid #334155',
        boxShadow: 'inset 0 0 80px rgba(99, 102, 241, 0.1), 0 8px 32px rgba(0,0,0,0.4)'
      }}
    >
      {/* Enemy Zone - Top */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: 20,
          background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.15), rgba(153, 27, 27, 0.1))',
          borderRadius: 16,
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: '#fca5a5'
          }}
        >
          Enemy
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'rgba(127, 29, 29, 0.6)',
              borderRadius: 12,
              border: '1px solid #dc2626'
            }}
          >
            <span style={{ fontSize: 12, color: '#fca5a5', textTransform: 'uppercase' }}>HP</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#fef2f2' }}>{enemy.hp}</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 16px',
              background: 'rgba(245, 158, 11, 0.2)',
              borderRadius: 12,
              border: '1px solid rgba(245, 158, 11, 0.5)'
            }}
          >
            <span style={{ fontSize: 11, color: '#fcd34d', textTransform: 'uppercase' }}>
              Intent: {enemy.intent}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fef3c7' }}>
              {enemy.damage} DMG
            </span>
          </div>
        </div>
      </div>

      {/* Hand Zone - Middle */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px 0'
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: '#64748b',
            marginBottom: 16
          }}
        >
          Your Hand
        </div>
        {handCount === 0 ? (
          <p style={{ margin: 0, color: '#475569', fontStyle: 'italic' }}>(empty)</p>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-end',
              gap: handCount > 5 ? 8 : 16,
              paddingBottom: 20
            }}
          >
            {player.hand.map((card, index) => (
              <div key={card.id} style={{ ...getCardTransform(index, handCount), flexShrink: 0 }}>
                <Card
                  card={card}
                  playerEnergy={player.energy}
                  onPlay={onPlayCard}
                  disabled={disableActions}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Player Zone - Bottom */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 24,
          padding: '16px 20px',
          background: 'linear-gradient(0deg, rgba(34, 197, 94, 0.1), transparent)',
          borderRadius: 16,
          border: '1px solid rgba(34, 197, 94, 0.2)'
        }}
      >
        {/* Deck Pile */}
        <CardStack count={player.deck.length} label="Deck" variant="deck" />

        {/* Player Stats */}
        <PlayerStats hp={player.hp} energy={player.energy} block={player.block} />

        {/* Discard Pile */}
        <CardStack count={player.discard.length} label="Discard" variant="discard" />
      </div>
    </section>
  );
}
