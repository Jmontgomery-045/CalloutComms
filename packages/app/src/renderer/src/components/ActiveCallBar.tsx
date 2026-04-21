import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'

export default function ActiveCallBar() {
  const call = useAppStore((s) => s.call)
  const contacts = useAppStore((s) => s.contacts)
  const [duration, setDuration] = useState('0:00')
  const audioRef = useRef<HTMLAudioElement>(null)

  // Tick the call timer
  useEffect(() => {
    if (call.status !== 'active' || !call.startTime) return
    const tick = () => {
      const secs = Math.floor((Date.now() - call.startTime!) / 1000)
      setDuration(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [call.status, call.startTime])

  // Route remote audio to the hidden <audio> element
  useEffect(() => {
    const el = audioRef.current
    if (!el || !call.remoteStream) return
    const tracks = call.remoteStream.getAudioTracks()
    console.log('[callout:audio] setting srcObject — tracks=', tracks.map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })))
    el.srcObject = call.remoteStream
    el.muted = false
    el.volume = 1
    // Explicitly call play() — Electron's autoplay can silently fail on hidden elements
    el.play()
      .then(() => console.log('[callout:audio] play() resolved. paused=', el.paused, 'muted=', el.muted, 'volume=', el.volume, 'readyState=', el.readyState))
      .catch((err) => console.error('[callout:audio] play() rejected:', err))
    const logState = (ev: Event) => console.log(`[callout:audio] event=${ev.type} paused=${el.paused} currentTime=${el.currentTime} readyState=${el.readyState}`)
    const events = ['loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'stalled', 'suspend', 'error', 'emptied']
    events.forEach(e => el.addEventListener(e, logState))
    return () => events.forEach(e => el.removeEventListener(e, logState))
  }, [call.remoteStream])

  if (call.status !== 'calling' && call.status !== 'active') return null

  const contact = contacts.find((c) => c.user_id === call.contactId)
  const cm = getConnectionManager()
  const name = contact?.nickname ?? call.contactId?.slice(0, 10) + '…'

  return (
    <div style={styles.bar}>
      {/* Hidden audio element — plays remote stream */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      <div style={styles.left}>
        <span style={{ ...styles.dot, background: call.status === 'active' ? 'var(--online)' : '#f59e0b' }} />
        <span style={styles.name}>{name}</span>
        <span style={styles.duration}>
          {call.status === 'calling' ? 'Calling…' : duration}
        </span>
      </div>

      <div style={styles.right}>
        {call.status === 'active' && (
          <button
            style={{ ...styles.btn, background: call.muted ? 'rgba(239,68,68,0.2)' : 'var(--bg-tertiary)' }}
            onClick={() => cm?.toggleMute()}
            title={call.muted ? 'Unmute' : 'Mute'}
          >
            {call.muted ? '🔇' : '🎤'}
          </button>
        )}
        <button
          style={{ ...styles.btn, background: 'rgba(239,68,68,0.2)', color: 'var(--danger)' }}
          onClick={() => cm?.endCall()}
          title="End call"
        >
          ✕ End
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 'var(--sidebar-w)',
    right: 0,
    height: 52,
    background: 'rgba(13,17,23,0.95)',
    backdropFilter: 'blur(8px)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    zIndex: 50,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: { fontWeight: 600, fontSize: 14 },
  duration: { fontSize: 13, color: 'var(--text-muted)' },
  right: { display: 'flex', gap: 8 },
  btn: {
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
  },
}
