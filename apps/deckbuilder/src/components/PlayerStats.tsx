import { CSSProperties } from 'react';
import { HealthBar } from './HealthBar';
import { EnergyBar } from './EnergyBar';

interface PlayerStatsProps {
  hp: number;
  maxHp?: number;
  energy: number;
  maxEnergy?: number;
  block: number;
  label?: string;
}

export function PlayerStats({
  hp,
  maxHp = 40,
  energy,
  maxEnergy = 3,
  block,
  label = 'Player'
}: PlayerStatsProps) {
  const blockStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 6,
    background: 'rgba(71, 85, 105, 0.4)',
    border: '1px solid rgba(148, 163, 184, 0.3)'
  };

  const shieldIconStyle: CSSProperties = {
    width: 14,
    height: 17,
    background: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    boxShadow: block > 0 ? '0 0 8px rgba(148, 163, 184, 0.5)' : 'none',
    opacity: block > 0 ? 1 : 0.4,
    transition: 'opacity 200ms ease-out, box-shadow 200ms ease-out'
  };

  return (
    <section
      style={{
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 10,
        padding: 8,
        background: 'linear-gradient(140deg, rgba(22, 101, 52, 0.3), rgba(20, 83, 45, 0.2))',
        minWidth: 180,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: '#86efac',
          textAlign: 'center',
          marginBottom: 6
        }}
      >
        {label}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Health Bar */}
        <div
          style={{
            padding: '5px 8px',
            borderRadius: 6,
            background: 'rgba(127, 29, 29, 0.4)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <HealthBar current={hp} max={maxHp} size="medium" />
        </div>

        {/* Energy and Block row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 6
          }}
        >
          {/* Energy Pips */}
          <div
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              background: 'rgba(14, 116, 144, 0.3)',
              border: '1px solid rgba(34, 211, 238, 0.3)'
            }}
          >
            <EnergyBar current={energy} max={maxEnergy} />
          </div>

          {/* Block Display */}
          <div style={blockStyle}>
            <div style={shieldIconStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{ fontSize: 8, textTransform: 'uppercase', color: '#cbd5e1', letterSpacing: 0.5 }}
              >
                Block
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{block}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
