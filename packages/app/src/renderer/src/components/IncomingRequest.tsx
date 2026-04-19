import { useState } from 'react'
import { useAppStore, type IncomingRequest } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'

export default function IncomingRequestBanner() {
  const req = useAppStore((s) => s.incomingRequests[0])
  if (!req) return null
  return <RequestCard req={req} />
}

function RequestCard({ req }: { req: IncomingRequest }) {
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const cm = getConnectionManager()

  async function accept() {
    if (!cm) return
    setBusy(true)
    await cm.acceptRequest(req, nickname)
    setBusy(false)
  }

  function ignore() {
    cm?.ignoreRequest()
  }

  async function block() {
    if (!cm) return
    setBusy(true)
    await cm.blockRequest(req)
    setBusy(false)
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.from}>
            <strong>{req.fromDisplayName}</strong>
            <span style={styles.id}> ({req.fromId.slice(0, 10)}…)</span>
          </span>
          <span style={styles.label}>Connection request</span>
        </div>

        {req.message && <p style={styles.message}>"{req.message}"</p>}

        <div style={styles.nicknameRow}>
          <label style={styles.nicknameLabel}>Your nickname for them</label>
          <input
            style={styles.nicknameInput}
            placeholder={req.fromDisplayName}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={64}
          />
        </div>

        <div style={styles.actions}>
          <button
            style={{ ...styles.addBtn, opacity: busy ? 0.6 : 1 }}
            onClick={accept}
            disabled={busy}
          >
            Add
          </button>
          <button style={styles.ignoreBtn} onClick={ignore} disabled={busy}>
            Ignore
          </button>
          <button style={styles.blockBtn} onClick={block} disabled={busy}>
            Block
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 20,
    right: 20,
    zIndex: 200,
    maxWidth: 360,
    width: '100%',
  },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  from: { fontSize: 14, color: 'var(--text-primary)' },
  id: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' },
  label: {
    fontSize: 11,
    color: 'var(--accent-light)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  message: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    fontStyle: 'italic',
    background: 'var(--bg-tertiary)',
    borderRadius: 6,
    padding: '6px 10px',
  },
  nicknameRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  nicknameLabel: { fontSize: 12, color: 'var(--text-muted)' },
  nicknameInput: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '7px 10px',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  actions: { display: 'flex', gap: 6 },
  addBtn: {
    flex: 1,
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 6,
    padding: '7px 0',
    fontWeight: 600,
    fontSize: 13,
  },
  ignoreBtn: {
    flex: 1,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    borderRadius: 6,
    padding: '7px 0',
    fontSize: 13,
  },
  blockBtn: {
    flex: 1,
    background: 'rgba(239,68,68,0.15)',
    color: 'var(--danger)',
    borderRadius: 6,
    padding: '7px 0',
    fontSize: 13,
  },
}
