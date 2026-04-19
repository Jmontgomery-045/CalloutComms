import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'

export default function IncomingCall() {
  const call = useAppStore((s) => s.call)
  const contacts = useAppStore((s) => s.contacts)

  if (call.status !== 'ringing' || !call.contactId) return null

  const contact = contacts.find((c) => c.user_id === call.contactId)
  const cm = getConnectionManager()

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.icon}>☎</div>

        <div style={styles.info}>
          <span style={styles.label}>Incoming call</span>
          <span style={styles.name}>{contact?.nickname ?? call.contactId!.slice(0, 10) + '…'}</span>
        </div>

        <div style={styles.actions}>
          <button style={styles.answerBtn} onClick={() => cm?.acceptCall()}>
            Answer
          </button>
          <button style={styles.declineBtn} onClick={() => cm?.rejectCall()}>
            Decline
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
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 300,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg-secondary)',
    border: '1px solid rgba(34,197,94,0.4)',
    borderRadius: 12,
    padding: '14px 20px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    minWidth: 320,
  },
  icon: {
    fontSize: 22,
    animation: 'ring 1s ease-in-out infinite',
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    fontSize: 11,
    color: 'var(--online)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  name: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  answerBtn: {
    background: 'var(--online)',
    color: '#fff',
    borderRadius: 8,
    padding: '7px 16px',
    fontWeight: 600,
    fontSize: 13,
  },
  declineBtn: {
    background: 'rgba(239,68,68,0.15)',
    color: 'var(--danger)',
    borderRadius: 8,
    padding: '7px 16px',
    fontWeight: 600,
    fontSize: 13,
  },
}
