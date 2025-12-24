import type { CSSProperties } from 'react';

interface GameMenuProps {
  onExport: () => void;
  onImport: () => void;
  onReplay: () => void;
  onSettings: () => void;
  canReplay: boolean;
  onClose: () => void;
}

interface MenuItemProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ label, onClick, disabled = false }: MenuItemProps) {
  const itemStyle: CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
    background: disabled ? '#1e293b' : 'linear-gradient(135deg, #334155, #1e293b)',
    color: disabled ? '#64748b' : '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 150ms ease',
    opacity: disabled ? 0.6 : 1
  };

  const handleHover = (e: React.MouseEvent<HTMLButtonElement>, isHover: boolean) => {
    if (disabled) return;
    const target = e.currentTarget;
    target.style.background = isHover
      ? 'linear-gradient(135deg, #475569, #334155)'
      : 'linear-gradient(135deg, #334155, #1e293b)';
    target.style.borderColor = isHover ? '#6366f1' : '#475569';
  };

  return (
    <button
      type="button"
      style={itemStyle}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={(e) => handleHover(e, true)}
      onMouseLeave={(e) => handleHover(e, false)}
    >
      {label}
    </button>
  );
}

export function GameMenu({
  onExport,
  onImport,
  onReplay,
  onSettings,
  canReplay,
  onClose
}: GameMenuProps) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  };

  const handleExport = () => {
    onExport();
    onClose();
  };

  const handleImport = () => {
    onImport();
    onClose();
  };

  const handleReplay = () => {
    if (canReplay) {
      onReplay();
      onClose();
    }
  };

  const handleSettings = () => {
    onSettings();
    onClose();
  };

  return (
    <div style={containerStyle}>
      <MenuItem label="Export Save" onClick={handleExport} />
      <MenuItem label="Import Save" onClick={handleImport} />
      <MenuItem
        label={canReplay ? 'Replay Game' : 'Replay (No save loaded)'}
        onClick={handleReplay}
        disabled={!canReplay}
      />
      <MenuItem label="Settings" onClick={handleSettings} />
    </div>
  );
}
