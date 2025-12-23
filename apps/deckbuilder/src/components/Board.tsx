import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Enemy, Player } from '../engine/types';
import { Card } from './Card';
import { EnemyIntent } from './EnemyIntent';
import { HealthBar } from './HealthBar';
import { PlayerStats } from './PlayerStats';

interface BoardProps {
  player: Player;
  enemy: Enemy;
  maxPlayerHp?: number;
  maxEnemyHp?: number;
  onPlayCard?: (cardId: string) => void;
  disableActions?: boolean;
  isEnemyTurn?: boolean;
}

interface DamagePopup {
  id: number;
  damage: number;
  x: number;
  y: number;
}

function DamageNumber({ damage, onComplete }: { damage: number; onComplete: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('exit'), 400);
    const exitTimer = setTimeout(onComplete, 800);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [onComplete]);

  const style: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: phase === 'enter'
      ? 'translate(-50%, -50%) scale(1.2)'
      : 'translate(-50%, -100%) scale(0.8)',
    fontSize: 32,
    fontWeight: 900,
    color: '#ef4444',
    textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(239, 68, 68, 0.8)',
    opacity: phase === 'enter' ? 1 : 0,
    transition: 'all 400ms ease-out',
    pointerEvents: 'none',
    zIndex: 100
  };

  return <div style={style}>-{damage}</div>;
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

export function Board({
  player,
  enemy,
  maxPlayerHp = 40,
  maxEnemyHp = 30,
  onPlayCard,
  disableActions = false,
  isEnemyTurn = false
}: BoardProps) {
  const handCount = player.hand.length;
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [playerShake, setPlayerShake] = useState(false);
  const prevEnemyHp = useRef(enemy.hp);
  const prevPlayerHp = useRef(player.hp);
  const popupIdRef = useRef(0);

  // Track enemy HP changes for damage popup
  useEffect(() => {
    if (prevEnemyHp.current > enemy.hp) {
      const damage = prevEnemyHp.current - enemy.hp;
      const id = popupIdRef.current++;
      setDamagePopups((prev) => [...prev, { id, damage, x: 0, y: 0 }]);
    }
    prevEnemyHp.current = enemy.hp;
  }, [enemy.hp]);

  // Track player HP changes for shake effect
  useEffect(() => {
    if (prevPlayerHp.current > player.hp) {
      setPlayerShake(true);
      const timer = setTimeout(() => setPlayerShake(false), 400);
      return () => clearTimeout(timer);
    }
    prevPlayerHp.current = player.hp;
  }, [player.hp]);

  const removeDamagePopup = (id: number) => {
    setDamagePopups((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePlayCard = (cardId: string) => {
    if (!onPlayCard) return;
    setPlayingCardId(cardId);
    setTimeout(() => {
      setPlayingCardId(null);
      onPlayCard(cardId);
    }, 300);
  };

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
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: 20,
          background: isEnemyTurn
            ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.35), rgba(153, 27, 27, 0.25))'
            : 'linear-gradient(180deg, rgba(239, 68, 68, 0.15), rgba(153, 27, 27, 0.1))',
          borderRadius: 16,
          border: isEnemyTurn ? '2px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.3)',
          boxShadow: isEnemyTurn ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none',
          transition: 'all 300ms ease'
        }}
      >
        {/* Damage popups */}
        {damagePopups.map((popup) => (
          <DamageNumber
            key={popup.id}
            damage={popup.damage}
            onComplete={() => removeDamagePopup(popup.id)}
          />
        ))}
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: isEnemyTurn ? '#fef2f2' : '#fca5a5',
            transition: 'color 300ms ease'
          }}
        >
          {isEnemyTurn ? 'Enemy Acting...' : 'Enemy'}
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
              padding: '12px 16px',
              background: 'rgba(127, 29, 29, 0.6)',
              borderRadius: 12,
              border: '1px solid #dc2626',
              minWidth: 180
            }}
          >
            <HealthBar current={enemy.hp} max={maxEnemyHp} size="medium" />
          </div>
          <EnemyIntent intent={enemy.intent} damage={enemy.damage} />
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
                  onPlay={handlePlayCard}
                  disabled={disableActions || playingCardId !== null}
                  isPlaying={playingCardId === card.id}
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
          background: playerShake
            ? 'linear-gradient(0deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.1))'
            : 'linear-gradient(0deg, rgba(34, 197, 94, 0.1), transparent)',
          borderRadius: 16,
          border: playerShake ? '2px solid #ef4444' : '1px solid rgba(34, 197, 94, 0.2)',
          boxShadow: playerShake ? '0 0 30px rgba(239, 68, 68, 0.5)' : 'none',
          animation: playerShake ? 'shake 0.4s ease-in-out' : 'none',
          transition: 'background 200ms ease, border 200ms ease, box-shadow 200ms ease'
        }}
      >
        {/* Deck Pile */}
        <CardStack count={player.deck.length} label="Deck" variant="deck" />

        {/* Player Stats */}
        <PlayerStats hp={player.hp} maxHp={maxPlayerHp} energy={player.energy} block={player.block} />

        {/* Discard Pile */}
        <CardStack count={player.discard.length} label="Discard" variant="discard" />
      </div>
    </section>
  );
}
