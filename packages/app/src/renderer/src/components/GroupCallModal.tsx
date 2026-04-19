import { useState } from 'react'
import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'
import Identicon from './Identicon'

const MAX_PARTICIPANTS = 5 // host + 5 = 6 total

type Props = { onClose(): void }

export default function GroupCallModal({ onClose }: Props) {
  const contacts = useAppStore((s) => s.contacts)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)

  const onlineContacts = contacts.filter((c) => c.online)

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else if (next.size < MAX_PARTICIPANTS) next.add(userId)
      return next
    })
  }

  async function start() {
    if (selected.size === 0) return
    setStarting(true)
    await getConnectionManager()?.startGroupCall([...selected])
    onClose()
  }

  return (
    <div style={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <h2 style={styles.title}>New group call</h2>
        <p style={styles.hint}>
          Select up to {MAX_PARTICIPANTS} online contacts. You will be the host.
        </p>

        {onlineContacts.length === 0 ? (
          <p style={styles.empty}>No contacts are online right now.</p>
        ) : (
          <div style={styles.list}>
            {onlineContacts.map((c) => {
              const checked = selected.has(c.user_id)
              const disabled = !checked && selected.size >= MAX_PARTICIPANTS
              return (
                <button
                  key={c.user_id}
                  style={{
                    ...styles.row,
                    background: checked ? 'rgba(0,179,122,0.15)' : 'transparent',
                    border: `1px solid ${checked ? 'rgba(0,179,122,0.4)' : 'var(--border)'}`,
                    opacity: disabled ? 0.4 : 1,
                  }}
                  onClick={() => toggle(c.user_id)}
                  disabled={disabled}
                >
                  <Identicon userId={c.user_id} size={32} />
                  <span style={styles.name}>{c.nickname}</span>
                  <span style={{ ...styles.check, opacity: checked ? 1 : 0 }}>✓</span>
                </button>
              )
            })}
          </div>
        )}

        <p style={styles.count}>
          {selected.size}/{MAX_PARTICIPANTS} selected · {selected.size + 1}/6 total
        </p>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.startBtn, opacity: selected.size > 0 && !starting ? 1 : 0.4 }}
            onClick={start}
            disabled={selected.size === 0 || starting}
          >
            {starting ? 'Starting…' : 'Start group call'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 28, width: 400,
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  title: { fontSize: 18, fontWeight: 700 },
  hint: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: -6 },
  empty: { fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 8,
    cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
    transition: 'background 0.1s',
  },
  name: { flex: 1, fontSize: 14, fontWeight: 500 },
  check: { color: 'var(--accent-light)', fontWeight: 700, fontSize: 16 },
  count: { fontSize: 12, color: 'var(--text-muted)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: {
    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
    borderRadius: 8, padding: '8px 16px', fontWeight: 500,
  },
  startBtn: {
    background: 'var(--accent)', color: '#fff',
    borderRadius: 8, padding: '8px 16px', fontWeight: 600,
  },
}
