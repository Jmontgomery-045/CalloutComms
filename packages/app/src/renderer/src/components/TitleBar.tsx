import { useEffect, useState } from 'react'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.api.win.isMaximized().then(setMaximized)
    window.api.win.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div style={styles.bar}>
      <div style={styles.drag}>
        <span style={styles.wordmark}>callout</span>
        <span style={styles.tag}>COMMS</span>
      </div>

      <div style={styles.controls}>
        <WinBtn onClick={() => window.api.win.minimize()} title="Minimise">
          <MinimiseIcon />
        </WinBtn>
        <WinBtn onClick={() => window.api.win.maximize()} title={maximized ? 'Restore' : 'Maximise'}>
          {maximized ? <RestoreIcon /> : <MaximiseIcon />}
        </WinBtn>
        <WinBtn onClick={() => window.api.win.close()} title="Close" danger>
          <CloseIcon />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode
  onClick(): void
  title: string
  danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.btn,
        background: hovered
          ? danger
            ? '#c42b2b'
            : 'var(--bg-hover)'
          : 'transparent',
        color: hovered ? (danger ? '#fff' : 'var(--text-primary)') : 'var(--text-muted)',
      }}
    >
      {children}
    </button>
  )
}

function MinimiseIcon() {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
      <rect width="10" height="1" />
    </svg>
  )
}

function MaximiseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
      <rect x="2.5" y="0.5" width="7" height="7" />
      <polyline points="0.5,2.5 0.5,9.5 7.5,9.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="0" y1="0" x2="10" y2="10" />
      <line x1="10" y1="0" x2="0" y2="10" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 36,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    // @ts-ignore — Electron drag region
    WebkitAppRegion: 'drag',
  },
  drag: {
    flex: 1,
    display: 'flex',
    alignItems: 'baseline',
    gap: 7,
    paddingLeft: 14,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    color: 'var(--text-primary)',
  },
  tag: {
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: '0.14em',
    color: 'var(--accent-light)',
  },
  controls: {
    display: 'flex',
    // @ts-ignore
    WebkitAppRegion: 'no-drag',
  },
  btn: {
    width: 46,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'default',
    transition: 'background 0.1s, color 0.1s',
  },
}
