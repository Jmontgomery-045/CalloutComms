import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'
import Identicon from './Identicon'
import ActiveCallBar from './ActiveCallBar'
import GroupCallModal from './GroupCallModal'

export default function ConversationView() {
  const activeProfile = useAppStore((s) => s.activeProfile)
  const contacts = useAppStore((s) => s.contacts)
  const selectedContactId = useAppStore((s) => s.selectedContactId)
  const messages = useAppStore((s) => s.messages)
  const setMessages = useAppStore((s) => s.setMessages)
  const appendMessage = useAppStore((s) => s.appendMessage)

  const call = useAppStore((s) => s.call)
  const contact = contacts.find((c) => c.user_id === selectedContactId)
  const thread = selectedContactId ? (messages[selectedContactId] ?? []) : []
  const onCall = call.contactId === selectedContactId && call.status !== 'idle'

  const [input, setInput] = useState('')
  const [showGroupCallModal, setShowGroupCallModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load message history when conversation changes
  useEffect(() => {
    if (!activeProfile || !selectedContactId) return
    window.api.messages.get(activeProfile.id, selectedContactId).then((msgs) => {
      setMessages(selectedContactId, msgs)
    })
    if (contact?.online) {
      window.api.messages.markRead(activeProfile.id, selectedContactId)
    }
  }, [selectedContactId, activeProfile?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length])

  if (!contact) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyTitle}>No conversation selected</p>
        <p style={styles.emptyHint}>Pick a contact from the sidebar to start chatting.</p>
      </div>
    )
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || !activeProfile || !contact) return

    const cm = getConnectionManager()
    if (!cm) return

    const sent = cm.sendMessage(contact.user_id, text)
    if (!sent) return // data channel not open

    setInput('')

    const result = await window.api.messages.save({
      profileId: activeProfile.id,
      contactUserId: contact.user_id,
      direction: 'sent',
      content: text,
      type: 'text',
      timestamp: Date.now(),
    })

    appendMessage(contact.user_id, {
      id: result.id,
      direction: 'sent',
      content: text,
      type: 'text',
      timestamp: Date.now(),
      read: 1,
      reaction: null,
    })
  }

  const canSend = contact.online && input.trim().length > 0

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <Identicon userId={contact.user_id} size={36} />
        <div style={styles.headerInfo}>
          <span style={styles.headerName}>{contact.nickname}</span>
          <span
            style={{
              ...styles.headerStatus,
              color: contact.online ? 'var(--online)' : 'var(--text-muted)',
            }}
          >
            {contact.online ? 'Online' : 'Offline'}
            {contact.status ? ` — ${contact.status}` : ''}
          </span>
        </div>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.callBtn, opacity: call.status === 'idle' ? 1 : 0.4 }}
            disabled={call.status !== 'idle'}
            title="Start group call"
            onClick={() => setShowGroupCallModal(true)}
          >
            👥
          </button>
          <button
            style={{
              ...styles.callBtn,
              opacity: contact.online && call.status === 'idle' ? 1 : 0.4,
              background: onCall ? 'rgba(239,68,68,0.2)' : 'var(--bg-tertiary)',
              color: onCall ? 'var(--danger)' : 'var(--text-primary)',
            }}
            disabled={!contact.online || (call.status !== 'idle' && !onCall)}
            title={!contact.online ? 'Contact is offline' : onCall ? 'End call' : 'Voice call'}
            onClick={() => {
              const cm = getConnectionManager()
              if (!cm) return
              if (onCall) cm.endCall()
              else void cm.initiateCall(contact.user_id)
            }}
          >
            {onCall ? '✕' : '☎'}
          </button>
        </div>
        {showGroupCallModal && <GroupCallModal onClose={() => setShowGroupCallModal(false)} />}
      </div>

      {/* Messages */}
      <div style={{ ...styles.messageList, paddingBottom: onCall ? 64 : 20 }}>
        {thread.length === 0 && (
          <p style={styles.noMessages}>
            {contact.online
              ? 'Say hello — messages are end-to-end encrypted and never leave your devices.'
              : 'Messages can only be sent when both of you are online simultaneously.'}
          </p>
        )}
        {thread.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ActiveCallBar />

      {/* Input */}
      <div style={styles.inputArea}>
        <input
          style={{
            ...styles.input,
            opacity: contact.online ? 1 : 0.5,
          }}
          placeholder={
            contact.online ? `Message ${contact.nickname}…` : `${contact.nickname} is offline`
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={!contact.online}
        />
        <button
          style={{ ...styles.sendBtn, opacity: canSend ? 1 : 0.4 }}
          onClick={sendMessage}
          disabled={!canSend}
        >
          ↑
        </button>
      </div>
    </div>
  )
}

type Message = ReturnType<typeof useAppStore.getState>['messages'][string][number]

function MessageBubble({ message }: { message: Message }) {
  const isSent = message.direction === 'sent'
  return (
    <div style={{ ...styles.bubbleWrap, justifyContent: isSent ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          ...styles.bubble,
          background: isSent ? 'var(--accent)' : 'var(--bg-tertiary)',
          borderRadius: isSent ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        }}
      >
        <span style={styles.bubbleText}>{message.content}</span>
        <span style={styles.bubbleTime}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: 'var(--text-muted)',
  },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  emptyHint: { fontSize: 13 },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  headerName: { fontWeight: 600, fontSize: 15 },
  headerStatus: { fontSize: 12 },
  headerActions: { display: 'flex', gap: 8 },
  callBtn: {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 16,
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  noMessages: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 'auto',
    marginBottom: 'auto',
    maxWidth: 360,
    alignSelf: 'center',
  },
  bubbleWrap: { display: 'flex' },
  bubble: {
    maxWidth: '68%',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' },
  bubbleTime: { fontSize: 11, color: 'rgba(255,255,255,0.45)', alignSelf: 'flex-end' },
  inputArea: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '9px 16px',
    color: 'var(--text-primary)',
  },
  sendBtn: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '50%',
    width: 36,
    height: 36,
    flexShrink: 0,
    fontSize: 16,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
}
