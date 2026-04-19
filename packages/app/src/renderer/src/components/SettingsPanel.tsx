import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app'
import AvatarCropModal from './AvatarCropModal'
import { getConnectionManager } from '../lib/connection-manager'

const STATUS_PRESETS = ['Available', 'Busy', 'Away']

export default function SettingsPanel() {
  const activeProfile = useAppStore((s) => s.activeProfile)
  const setActiveProfile = useAppStore((s) => s.setActiveProfile)

  const [displayName, setDisplayName] = useState(activeProfile?.displayName ?? '')
  const [status, setStatus] = useState(activeProfile?.status ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [exportPassword, setExportPassword] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  const [typingIndicators, setTypingIndicators] = useState(
    () => localStorage.getItem('pref:typingIndicators') !== 'false'
  )
  const [readReceipts, setReadReceipts] = useState(
    () => localStorage.getItem('pref:readReceipts') !== 'false'
  )

  const [picHovered, setPicHovered] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local fields in sync if profile changes externally
  useEffect(() => {
    if (activeProfile) {
      setDisplayName(activeProfile.displayName)
      setStatus(activeProfile.status)
    }
  }, [activeProfile?.id])

  if (!activeProfile) return null

  function copyId() {
    navigator.clipboard.writeText(activeProfile!.id)
    setCopied(true)
    if (copyTimeout.current) clearTimeout(copyTimeout.current)
    copyTimeout.current = setTimeout(() => setCopied(false), 1500)
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(file)
    // Reset so choosing the same file again still fires onChange
    e.target.value = ''
  }

  async function onCropSave(dataUrl: string) {
    setCropSrc(null)
    const result = await window.api.identity.saveCroppedProfilePic(activeProfile!.id, dataUrl)
    const updated = { ...activeProfile!, profilePicPath: result.filename, profilePicHash: result.hash }
    setActiveProfile(updated)
    getConnectionManager()?.broadcastProfile(updated.displayName, updated.status, updated.profilePicPath)
  }

  function removeProfilePic() {
    const prev = activeProfile!
    const updated = { ...prev, profilePicPath: null, profilePicHash: null }
    setActiveProfile(updated)
    window.api.identity.removeProfilePic(prev.id).catch(() => setActiveProfile(prev))
    getConnectionManager()?.broadcastProfile(updated.displayName, updated.status, null)
  }

  async function saveProfile() {
    if (!displayName.trim()) return
    setSaving(true)
    setSaveMsg('')
    const name = displayName.trim()
    const stat = status.trim()
    await window.api.identity.updateProfile(activeProfile!.id, name, stat)
    const updated = { ...activeProfile!, displayName: name, status: stat }
    setActiveProfile(updated)
    getConnectionManager()?.broadcastProfile(name, stat, updated.profilePicPath)
    setSaving(false)
    setSaveMsg('Saved')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function exportIdentity() {
    if (!exportPassword) return
    setExporting(true)
    setExportMsg('')
    const result = await window.api.identity.export(activeProfile!.id, exportPassword)
    setExporting(false)
    if (result.success) {
      setExportMsg(`Saved to ${result.path}`)
      setExportPassword('')
    } else {
      setExportMsg('Export cancelled.')
    }
  }

  function toggleTyping(val: boolean) {
    setTypingIndicators(val)
    localStorage.setItem('pref:typingIndicators', String(val))
  }

  function toggleReadReceipts(val: boolean) {
    setReadReceipts(val)
    localStorage.setItem('pref:readReceipts', String(val))
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <h1 style={styles.pageTitle}>Settings</h1>

        {/* ── Profile ─────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Profile</h2>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={onFileChosen}
          />

          {/* Avatar picker */}
          <div style={styles.avatarRow}>
            <button
              style={styles.avatarWrap}
              onClick={openFilePicker}
              onMouseEnter={() => setPicHovered(true)}
              onMouseLeave={() => setPicHovered(false)}
              title="Change profile picture"
            >
              {activeProfile.profilePicPath ? (
                <img
                  src={`callout-file://${encodeURIComponent(activeProfile.profilePicPath)}`}
                  style={styles.avatarImg}
                />
              ) : (
                <div style={styles.avatarPlaceholder}>
                  {activeProfile.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              {picHovered && (
                <div style={styles.avatarOverlay}>
                  <span style={styles.cameraIcon}>📷</span>
                  <span style={styles.changeText}>Change</span>
                </div>
              )}
            </button>
            <div style={styles.avatarHint}>
              <span style={styles.avatarName}>{activeProfile.displayName}</span>
              <span style={styles.hintSmall}>JPG, PNG or WebP · Max recommended 2 MB</span>
              <div style={styles.avatarBtns}>
                <button style={styles.changePhotoBtn} onClick={openFilePicker}>
                  {activeProfile.profilePicPath ? 'Change photo' : 'Upload photo'}
                </button>
                {activeProfile.profilePicPath && (
                  <button style={styles.removePhotoBtn} onClick={removeProfilePic}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <label style={styles.label}>Display name</label>
          <input
            style={styles.input}
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />

          <label style={styles.label}>Status</label>
          <div style={styles.presets}>
            {STATUS_PRESETS.map((p) => (
              <button
                key={p}
                style={{
                  ...styles.presetBtn,
                  background: status === p ? 'rgba(0,179,122,0.2)' : 'var(--bg-tertiary)',
                  border: `1px solid ${status === p ? 'rgba(0,179,122,0.5)' : 'var(--border)'}`,
                  color: status === p ? 'var(--accent-light)' : 'var(--text-primary)',
                }}
                onClick={() => setStatus(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            style={{ ...styles.input, marginTop: 6 }}
            value={status}
            maxLength={150}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Custom status…"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={styles.charCount}>{status.length}/150</span>
            <div style={{ flex: 1 }} />
            {saveMsg && <span style={styles.saveMsg}>{saveMsg}</span>}
            <button
              style={{ ...styles.primaryBtn, opacity: displayName.trim() && !saving ? 1 : 0.4 }}
              disabled={!displayName.trim() || saving}
              onClick={saveProfile}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </section>

        {/* ── Identity ────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Identity</h2>

          <label style={styles.label}>Your ID</label>
          <div style={styles.idBox}>
            <span style={styles.idText}>{activeProfile.id}</span>
            <button style={styles.copyBtn} onClick={copyId}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p style={styles.hint}>
            Share this with contacts so they can add you. Your private key never leaves this device.
          </p>

          <label style={{ ...styles.label, marginTop: 16 }}>Export identity backup</label>
          <p style={styles.hint}>
            Encrypts your key pair with a password and saves it as a JSON file. Keep it safe — anyone
            with your backup file and password can impersonate you.
          </p>
          <div style={styles.exportRow}>
            <input
              style={{ ...styles.input, flex: 1, marginTop: 0 }}
              type="password"
              placeholder="Backup password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
            />
            <button
              style={{ ...styles.primaryBtn, opacity: exportPassword && !exporting ? 1 : 0.4 }}
              disabled={!exportPassword || exporting}
              onClick={exportIdentity}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
          {exportMsg && <p style={styles.exportMsg}>{exportMsg}</p>}
        </section>

        {/* ── About ───────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>About</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Version</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              v{__APP_VERSION__}
            </span>
          </div>
        </section>

        {/* ── Preferences ─────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Preferences</h2>

          <ToggleRow
            label="Typing indicators"
            description="Let contacts see when you are typing"
            value={typingIndicators}
            onChange={toggleTyping}
          />
          <ToggleRow
            label="Read receipts"
            description="Let contacts know when you've read their messages"
            value={readReceipts}
            onChange={toggleReadReceipts}
          />
        </section>
      </div>

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onSave={onCropSave}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange(v: boolean): void
}) {
  return (
    <div style={styles.toggleRow}>
      <div style={styles.toggleInfo}>
        <span style={styles.toggleLabel}>{label}</span>
        <span style={styles.toggleDesc}>{description}</span>
      </div>
      <button
        style={{
          ...styles.toggle,
          background: value ? 'var(--accent)' : 'var(--bg-tertiary)',
        }}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
      >
        <span
          style={{
            ...styles.toggleThumb,
            transform: value ? 'translateX(22px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    marginBottom: 8,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    cursor: 'pointer',
    background: 'transparent',
    padding: 0,
    border: 'none',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    background: '#0d2e24',
    color: '#00e5a0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 700,
  },
  avatarOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cameraIcon: {
    fontSize: 20,
  },
  changeText: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    letterSpacing: '0.04em',
  },
  avatarHint: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  avatarBtns: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  changePhotoBtn: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--accent-light)',
    background: 'transparent',
    padding: 0,
  },
  removePhotoBtn: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--danger)',
    background: 'transparent',
    padding: 0,
  },
  avatarName: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  hintSmall: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  root: {
    flex: 1,
    overflowY: 'auto',
    background: 'var(--bg-primary)',
  },
  content: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '32px 24px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 16,
  },
  section: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: 8,
  },
  input: {
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
  },
  presets: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  presetBtn: {
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  charCount: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  saveMsg: {
    fontSize: 13,
    color: 'var(--online)',
  },
  primaryBtn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  },
  idBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
  },
  idText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
  },
  copyBtn: {
    background: 'transparent',
    color: 'var(--accent-light)',
    fontSize: 13,
    fontWeight: 600,
    padding: '2px 6px',
    flexShrink: 0,
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginTop: 2,
  },
  exportRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  exportMsg: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
    wordBreak: 'break-all',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '10px 0',
    borderTop: '1px solid var(--border)',
  },
  toggleInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  toggleDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
    cursor: 'pointer',
    padding: 0,
    overflow: 'hidden',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
}
