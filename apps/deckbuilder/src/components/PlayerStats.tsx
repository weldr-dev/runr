interface PlayerStatsProps {
  hp: number;
  energy: number;
  block: number;
  label?: string;
}

export function PlayerStats({ hp, energy, block, label = 'Player' }: PlayerStatsProps) {
  return (
    <section
      style={{
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 16,
        padding: 16,
        background: 'linear-gradient(140deg, rgba(22, 101, 52, 0.3), rgba(20, 83, 45, 0.2))',
        minWidth: 220,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#86efac',
          textAlign: 'center',
          marginBottom: 12
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '10px 8px',
            borderRadius: 10,
            background: 'rgba(127, 29, 29, 0.4)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#fca5a5' }}>HP</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fef2f2' }}>{hp}</div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '10px 8px',
            borderRadius: 10,
            background: 'rgba(14, 116, 144, 0.3)',
            border: '1px solid rgba(34, 211, 238, 0.3)'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#67e8f9' }}>Energy</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ecfeff' }}>{energy}</div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '10px 8px',
            borderRadius: 10,
            background: 'rgba(71, 85, 105, 0.4)',
            border: '1px solid rgba(148, 163, 184, 0.3)'
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#cbd5e1' }}>Block</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{block}</div>
        </div>
      </div>
    </section>
  );
}
