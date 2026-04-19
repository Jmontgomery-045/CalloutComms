import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'
import Identicon from './Identicon'

export default function GroupCallPanel() {
  const groupCall = useAppStore((s) => s.groupCall)
  const activeProfile = useAppStore((s) => s.activeProfile)
  const contacts = useAppStore((s) => s.contacts)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [duration, setDuration] = useState(0)
  const [showPassHost, setShowPassHost] = useState(false)
  const startRef = useRef(Date.now())

  const isHost = groupCall.hostId === activeProfile?.id
  const cm = getConnectionManager()

  // Duration timer
  useEffect(() => {
    startRef.current = Date.now()
    const id = setInterval(() => setDuration(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Remote audio (participant side — host's mixed stream)
  useEffect(() => {
    const handler = (e: Event) => {
      const stream = (e as CustomEvent<MediaStream>).detail
      if (audioRef.current) audioRef.current.srcObject = stream
    }
    window.addEventListener('group-remote-stream', handler)
    return () => window.removeEventListener('group-remote-stream', handler)
  }, [])

  if (!groupCall.active) return null

  const mins = Math.floor(duration / 60)
  const secs = String(duration % 60).padStart(2, '0')

  const participants = groupCall.participants.slice().sort((a, b) => a.joinOrder - b.joinOrder)
  const otherParticipants = participants.filter((p) => p.userId !== activeProfile?.id)

  function nicknameFor(userId: string) {
    if (userId === activeProfile?.id) return 'You'
    return contacts.find((c) => c.user_id === userId)?.nickname ?? userId.slice(0, 8)
  }

  return (
    <div style={styles.panel}>
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.dot} />
          <span style={styles.title}>Group Call</span>
          <span style={styles.count}>{groupCall.participants.length}/6</span>
        </div>
        <span style={styles.timer}>{mins}:{secs}</span>
      </div>

      {/* Participant grid */}
      <div style={styles.grid}>
        {participants.map((p) => {
          const name = nicknameFor(p.userId)
          const isMe = p.userId === activeProfile?.id
          const isCallHost = p.userId === groupCall.hostId
          return (
            <div key={p.userId} style={styles.tile}>
              <Identicon userId={p.userId} size={48} />
              <span style={styles.tileName}>
                {name}
                {isCallHost && <span style={styles.hostBadge}> Host</span>}
              </span>
              {isMe && groupCall.muted && <span style={styles.muteIcon}>🔇</span>}

              {/* Host can kick non-host participants */}
              {isHost && !isMe && !isCallHost && (
                <button
                  style={styles.kickBtn}
                  onClick={() => cm?.kickParticipant(p.userId)}
                  title="Remove from call"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          style={{ ...styles.ctrlBtn, background: groupCall.muted ? 'rgba(239,68,68,0.2)' : 'var(--bg-tertiary)' }}
          onClick={() => cm?.toggleGroupMute()}
        >
          {groupCall.muted ? '🔇 Unmute' : '🎤 Mute'}
        </button>

        {isHost && (
          <div style={{ position: 'relative' }}>
            <button
              style={styles.ctrlBtn}
              onClick={() => setShowPassHost((v) => !v)}
            >
              Pass Host ▾
            </button>
            {showPassHost && (
              <div style={styles.dropdown}>
                {otherParticipants.map((p) => (
                  <button
                    key={p.userId}
                    style={styles.dropdownItem}
                    onClick={() => { cm?.passHost(p.userId); setShowPassHost(false) }}
                  >
                    {nicknameFor(p.userId)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          style={{ ...styles.ctrlBtn, background: 'rgba(239,68,68,0.2)', color: 'var(--danger)', marginLeft: 'auto' }}
          onClick={() => cm?.leaveGroupCall()}
        >
          {isHost ? 'End call' : 'Leave'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'var(--online)', flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 700 },
  count: {
    fontSize: 12, color: 'var(--text-muted)',
    background: 'var(--bg-tertiary)', borderRadius: 20,
    padding: '2px 8px',
  },
  timer: { fontSize: 14, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' },
  grid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 16,
    padding: 24,
    alignContent: 'start',
    overflowY: 'auto',
  },
  tile: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '24px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  tileName: { fontSize: 14, fontWeight: 500, textAlign: 'center', color: 'var(--text-primary)' },
  hostBadge: { fontSize: 11, color: 'var(--accent-light)', fontWeight: 600 },
  muteIcon: { fontSize: 18 },
  kickBtn: {
    position: 'absolute', top: 8, right: 8,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, padding: '2px 5px', borderRadius: 4,
    opacity: 0, transition: 'opacity 0.1s',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 24px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  ctrlBtn: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderRadius: 8, padding: '8px 16px',
    fontSize: 13, fontWeight: 500,
  },
  dropdown: {
    position: 'absolute', bottom: '110%', left: 0,
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 8, overflow: 'hidden', minWidth: 140,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  dropdownItem: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '9px 14px', fontSize: 13, color: 'var(--text-primary)',
    background: 'transparent', transition: 'background 0.1s',
  },
}
