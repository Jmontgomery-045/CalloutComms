import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'

export default function IncomingGroupCall() {
  const invite = useAppStore((s) => s.groupCall.pendingInvite)
  if (!invite) return null

  const cm = getConnectionManager()

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.icon}>👥</div>
        <div style={styles.info}>
          <span style={styles.label}>Group call</span>
          <span style={styles.name}>
            <strong>{invite.hostNickname}</strong>
            {invite.currentCount > 1 ? ` + ${invite.currentCount - 1} others` : ''}
          </span>
        </div>
        <div style={styles.actions}>
          <button style={styles.joinBtn} onClick={() => cm?.acceptGroupInvite()}>
            Join
          </button>
          <button style={styles.declineBtn} onClick={() => cm?.declineGroupInvite()}>
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', top: 20, left: '50%',
    transform: 'translateX(-50%)', zIndex: 300,
  },
  card: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--bg-secondary)', border: '1px solid rgba(0,179,122,0.4)',
    borderRadius: 12, padding: '14px 20px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)', minWidth: 320,
  },
  icon: { fontSize: 22 },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  label: {
    fontSize: 11, color: 'var(--accent-light)',
    textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
  },
  name: { fontSize: 15, color: 'var(--text-primary)' },
  actions: { display: 'flex', gap: 8 },
  joinBtn: {
    background: 'var(--accent)', color: '#fff',
    borderRadius: 8, padding: '7px 16px', fontWeight: 600, fontSize: 13,
  },
  declineBtn: {
    background: 'rgba(239,68,68,0.15)', color: 'var(--danger)',
    borderRadius: 8, padding: '7px 16px', fontWeight: 600, fontSize: 13,
  },
}
