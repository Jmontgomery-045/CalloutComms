import { useState } from 'react'
import { getConnectionManager } from '../lib/connection-manager'

type Props = { onClose(): void }

export default function AddContactModal({ onClose }: Props) {
  const [targetId, setTargetId] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSend() {
    const id = targetId.trim()
    if (!id) return

    const cm = getConnectionManager()
    if (!cm) return

    if (id === cm.userId) {
      setErrorMsg("That's your own ID.")
      return
    }

    setStatus('sending')
    setErrorMsg('')

    try {
      await cm.sendContactRequest(id, message.trim())
      setStatus('sent')
    } catch {
      setStatus('error')
      setErrorMsg('Failed to send — check the ID and try again.')
    }
  }

  return (
    <div style={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Add contact</h2>
        <p style={styles.hint}>
          Ask the other person to copy their ID from the sidebar and share it with you.
        </p>

        <label style={styles.label}>Their ID</label>
        <input
          style={styles.input}
          placeholder="Paste user ID…"
          value={targetId}
          onChange={(e) => { setTargetId(e.target.value); setStatus('idle'); setErrorMsg('') }}
          autoFocus
          disabled={status === 'sent'}
        />

        <label style={styles.label}>Message (optional)</label>
        <textarea
          style={styles.textarea}
          placeholder="Hi, it's me from…"
          maxLength={200}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={status === 'sent'}
        />
        <span style={styles.charCount}>{message.length}/200</span>

        {errorMsg && <p style={styles.error}>{errorMsg}</p>}

        {status === 'sent' ? (
          <div style={styles.successBox}>
            Request sent. They'll see it the next time they're online.
          </div>
        ) : (
          <p style={styles.offlineNote}>
            The request will only be delivered if they are currently online.
          </p>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            {status === 'sent' ? 'Close' : 'Cancel'}
          </button>
          {status !== 'sent' && (
            <button
              style={{ ...styles.sendBtn, opacity: targetId.trim() && status !== 'sending' ? 1 : 0.5 }}
              onClick={handleSend}
              disabled={!targetId.trim() || status === 'sending'}
            >
              {status === 'sending' ? 'Sending…' : 'Send request'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 32,
    width: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  hint: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: -4 },
  label: { fontSize: 12, color: 'var(--text-muted)', marginBottom: -6 },
  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    width: '100%',
  },
  textarea: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    width: '100%',
    resize: 'none',
    height: 80,
    lineHeight: 1.5,
  },
  charCount: { fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-end', marginTop: -8 },
  error: { color: 'var(--danger)', fontSize: 13 },
  offlineNote: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  successBox: {
    background: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelBtn: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius)',
    padding: '8px 16px',
    fontWeight: 500,
  },
  sendBtn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '8px 16px',
    fontWeight: 600,
  },
}
