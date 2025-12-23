import type { CSSProperties } from 'react';

interface EnemyIntentProps {
  intent: 'attack' | 'rest';
  damage: number;
}

export function EnemyIntent({ intent, damage }: EnemyIntentProps) {
  const isAttack = intent === 'attack';

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 20px',
    background: isAttack
      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(153, 27, 27, 0.4))'
      : 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(30, 64, 175, 0.4))',
    borderRadius: 12,
    border: isAttack ? '2px solid #dc2626' : '2px solid #3b82f6',
    boxShadow: isAttack
      ? '0 0 20px rgba(239, 68, 68, 0.3), inset 0 0 15px rgba(239, 68, 68, 0.1)'
      : '0 0 20px rgba(59, 130, 246, 0.3), inset 0 0 15px rgba(59, 130, 246, 0.1)',
    minWidth: 80,
    transition: 'all 0.3s ease'
  };

  const iconStyle: CSSProperties = {
    fontSize: 32,
    lineHeight: 1,
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
  };

  const damageStyle: CSSProperties = {
    fontSize: 24,
    fontWeight: 800,
    color: '#fef2f2',
    textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 10px rgba(239, 68, 68, 0.5)',
    marginTop: 4
  };

  const labelStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: isAttack ? '#fca5a5' : '#93c5fd',
    marginTop: 2
  };

  return (
    <div style={containerStyle} title={isAttack ? `Attack for ${damage} damage` : 'Defending'}>
      <span style={iconStyle} role="img" aria-label={isAttack ? 'Attack' : 'Defend'}>
        {isAttack ? '⚔️' : '🛡️'}
      </span>
      {isAttack && <span style={damageStyle}>{damage}</span>}
      <span style={labelStyle}>{isAttack ? 'Attack' : 'Defend'}</span>
    </div>
  );
}
