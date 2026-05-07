import { useState } from 'react'
import type { Profile } from '../store/app'

type Props = {
  profile: Profile
  onCancel(): void
  onExportFirst(): void
  onConfirmed(): Promise<void> | void
}

/**
 * Two-input confirmation modal for the destructive "Reset me" flow.
 * The user must:
 *   1. Type their own display name exactly
 *   2. Paste their own user ID exactly
 * before the destructive action button enables.
 */
export default function ResetProfileModal({ profile, onCancel, onExportFirst, onConfirmed }: Props) {
  const [typedName, setTypedName] = useState('')
  const [typedId, setTypedId] = useState('')
  const [working, setWorking] = useState(false)

  const nameMatches = typedName.trim() === profile.displayName.trim() && profile.displayName.trim() !== ''
  const idMatches = typedId.trim() === profile.id

  const canConfirm = nameMatches && idMatches && !working

  async function confirm() {
    if (!canConfirm) return
    setWorking(true)
    try {
      await onConfirmed()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Reset profile</h2>

        <p style={styles.warning}>
          This permanently deletes your keypair, contacts, and message history for the
          <strong> {profile.displayName} </strong>
          profile. There is no undo. Anyone who has your current ID saved will see you as a dead
          contact and will need to re-add you with your new ID.
        </p>

        <div style={styles.exportFirst}>
          <div>
            <div style={styles.exportFirstTitle}>Make a backup first</div>
            <div style={styles.exportFirstHint}>
              Export your profile data, contacts, and chat history. You can import them under a
              new identity later — your old ID is gone for good.
            </div>
          </div>
          <button style={styles.exportBtn} onClick={onExportFirst}>
            Export backup…
          </button>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>
            Type your display name <code>{profile.displayName}</code>
          </label>
          <input
            style={styles.input}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={profile.displayName}
            autoFocus
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Paste your full ID</label>
          <input
            style={styles.input}
            value={typedId}
            onChange={(e) => setTypedId(e.target.value)}
            placeholder={profile.id}
            spellCheck={false}
          />
          <div style={styles.idHint}>
            Your ID: <code style={styles.idCode}>{profile.id}</code>
          </div>
        </div>

        <div style={styles.btnRow}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={working}>
            Cancel
          </button>
          <button
            style={{
              ...styles.dangerBtn,
              opacity: canConfirm ? 1 : 0.4,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
            disabled={!canConfirm}
            onClick={confirm}
          >
            {working ? 'Resetting…' : 'Reset everything'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: 480,
    maxWidth: '92vw',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 24,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 12px',
  },
  warning: {
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
    margin: '0 0 16px',
  },
  exportFirst: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    background: 'rgba(217, 119, 87, 0.08)',
    marginBottom: 18,
  },
  exportFirstTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 2,
  },
  exportFirstHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  exportBtn: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  idHint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 4,
    wordBreak: 'break-all',
  },
  idCode: {
    fontFamily: 'monospace',
    color: 'var(--text-primary)',
  },
  btnRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    padding: '9px 16px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13,
  },
  dangerBtn: {
    padding: '9px 16px',
    border: '1px solid #c4423b',
    borderRadius: 6,
    background: '#c4423b',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
  },
}
