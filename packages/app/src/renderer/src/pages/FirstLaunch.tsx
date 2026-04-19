import { useState } from 'react'
import { useAppStore } from '../store/app'

export default function FirstLaunch() {
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const addProfile = useAppStore((s) => s.addProfile)

  async function handleCreate() {
    const name = displayName.trim()
    if (!name) return setError('Display name is required')
    setLoading(true)
    setError('')
    try {
      const profile = await window.api.identity.createProfile(name)
      addProfile(profile)
    } catch (e) {
      setError('Failed to create profile. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <span style={styles.logoWord}>callout</span>
          <span style={styles.logoTag}>COMMS</span>
        </div>
        <h1 style={styles.title}>Welcome</h1>
        <p style={styles.subtitle}>Private, peer-to-peer messaging and voice calls.</p>

        <div style={styles.warning}>
          <strong>Before you begin:</strong> Your identity and encryption keys are stored
          only on this device. Without a backup, they cannot be recovered if you
          uninstall or lose access to your device.
        </div>

        <label style={styles.label}>Your display name</label>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. Alice"
          maxLength={64}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create identity'}
        </button>

        <p style={styles.hint}>
          You can change your display name and add a profile picture later in settings.
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  logoWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  logoWord: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: 'var(--text-primary)',
    lineHeight: 1,
  },
  logoTag: {
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: '0.15em',
    color: 'var(--accent-light)',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  subtitle: {
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginTop: -8,
  },
  warning: {
    background: 'rgba(0,179,122,0.1)',
    border: '1px solid rgba(0,179,122,0.3)',
    borderRadius: 'var(--radius)',
    padding: '12px 14px',
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.6,
  },
  label: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: -8,
  },
  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--text-primary)',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  error: {
    color: 'var(--danger)',
    fontSize: 13,
    marginTop: -8,
  },
  btn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    padding: '11px 0',
    width: '100%',
    fontWeight: 600,
    fontSize: 14,
    transition: 'background 0.15s',
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
