import { useState } from 'react'
import { useAppStore } from '../store/app'
import { getConnectionManager } from '../lib/connection-manager'
import Identicon from './Identicon'
import AddContactModal from './AddContactModal'

type Props = { onSettings(): void }

export default function Sidebar({ onSettings }: Props) {
  const activeProfile = useAppStore((s) => s.activeProfile)
  const contacts = useAppStore((s) => s.contacts)
  const selectedContactId = useAppStore((s) => s.selectedContactId)
  const selectContact = useAppStore((s) => s.selectContact)
  const unreadCounts = useAppStore((s) => s.unreadCounts)
  const [copied, setCopied] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  if (!activeProfile) return null

  function copyId() {
    navigator.clipboard.writeText(activeProfile!.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const online = contacts.filter((c) => c.online)
  const offline = contacts.filter((c) => !c.online)

  return (
    <>
      <aside style={styles.sidebar}>
        {/* Profile header */}
        <div style={styles.profileArea}>
          {activeProfile.profilePicPath ? (
            <img
              src={`callout-file://${encodeURIComponent(activeProfile.profilePicPath)}`}
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <Identicon userId={activeProfile.id} size={40} />
          )}
          <div style={styles.profileInfo}>
            <span style={styles.profileName}>{activeProfile.displayName}</span>
            {activeProfile.status && (
              <span style={styles.profileStatus}>{activeProfile.status}</span>
            )}
          </div>
          <button style={styles.copyBtn} onClick={copyId} title="Copy your ID">
            {copied ? '✓' : '⎘'}
          </button>
          <button style={styles.settingsBtn} onClick={onSettings} title="Settings">
            ⚙
          </button>
        </div>

        <div style={styles.idRow}>
          <span style={styles.idText}>{activeProfile.id.slice(0, 14)}…</span>
        </div>

        {/* Contacts header */}
        <div style={styles.sectionHeader}>
          <span>Contacts</span>
          <button
            style={styles.addBtn}
            title="Add contact"
            onClick={() => setShowAddModal(true)}
          >
            +
          </button>
        </div>

        <div style={styles.contactList}>
          {contacts.length === 0 && (
            <p style={styles.empty}>
              No contacts yet.{' '}
              <button
                style={styles.emptyLink}
                onClick={() => setShowAddModal(true)}
              >
                Add someone
              </button>{' '}
              to get started.
            </p>
          )}

          {online.length > 0 && (
            <>
              <div style={styles.groupLabel}>Online — {online.length}</div>
              {online.map((c) => (
                <ContactRow
                  key={c.user_id}
                  contact={c}
                  selected={selectedContactId === c.user_id}
                  unread={unreadCounts[c.user_id] ?? 0}
                  onSelect={() => selectContact(c.user_id)}
                />
              ))}
            </>
          )}

          {offline.length > 0 && (
            <>
              <div style={styles.groupLabel}>Offline — {offline.length}</div>
              {offline.map((c) => (
                <ContactRow
                  key={c.user_id}
                  contact={c}
                  selected={selectedContactId === c.user_id}
                  unread={unreadCounts[c.user_id] ?? 0}
                  onSelect={() => selectContact(c.user_id)}
                />
              ))}
            </>
          )}
        </div>
      </aside>

      {showAddModal && <AddContactModal onClose={() => setShowAddModal(false)} />}
    </>
  )
}

type Contact = ReturnType<typeof useAppStore.getState>['contacts'][number]

function ContactRow({
  contact,
  selected,
  unread,
  onSelect,
}: {
  contact: Contact
  selected: boolean
  unread: number
  onSelect(): void
}) {
  const [hovered, setHovered] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation()
    if (refreshing) return
    setRefreshing(true)
    getConnectionManager()?.refreshContact(contact.user_id)
    setTimeout(() => setRefreshing(false), 2000)
  }

  return (
    <button
      style={{
        ...styles.contactRow,
        background: selected ? 'var(--bg-hover)' : 'transparent',
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ position: 'relative' }}>
        <Identicon userId={contact.user_id} size={32} />
        <span
          style={{
            ...styles.onlineDot,
            background: contact.online ? 'var(--online)' : 'var(--offline)',
          }}
        />
      </div>
      <div style={styles.contactInfo}>
        <span style={{
          ...styles.contactName,
          fontWeight: unread > 0 ? 700 : 500,
          color: unread > 0 ? 'var(--text-primary)' : undefined,
        }}>
          {contact.nickname}
        </span>
        <span style={styles.contactStatus}>
          {contact.status
            ? contact.status
            : contact.online
              ? 'Online'
              : 'Offline'}
        </span>
      </div>
      {unread > 0 && !hovered && (
        <span style={styles.unreadBadge}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      {hovered && (
        <span
          style={{
            ...styles.refreshBtn,
            opacity: refreshing ? 0.4 : 1,
            transform: refreshing ? 'rotate(360deg)' : 'none',
            transition: refreshing ? 'transform 0.6s linear' : 'none',
          }}
          onClick={handleRefresh}
          title="Refresh contact"
        >
          ↻
        </span>
      )}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w)',
    flexShrink: 0,
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  profileArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 14px 10px',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  profileName: {
    fontWeight: 600,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  profileStatus: {
    fontSize: 12,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 16,
    padding: '4px 6px',
    borderRadius: 4,
  },
  settingsBtn: {
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 16,
    padding: '4px 6px',
    borderRadius: 4,
  },
  idRow: {
    padding: '0 14px 12px',
    borderBottom: '1px solid var(--border)',
  },
  idText: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 14px 6px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  addBtn: {
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 18,
    lineHeight: 1,
    padding: '2px 4px',
    borderRadius: 4,
    cursor: 'pointer',
  },
  contactList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 6px 12px',
  },
  groupLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '8px 8px 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  empty: {
    fontSize: 13,
    color: 'var(--text-muted)',
    padding: '16px 8px',
    lineHeight: 1.6,
  },
  emptyLink: {
    background: 'transparent',
    color: 'var(--accent-light)',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 'inherit',
  },
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '7px 8px',
    borderRadius: 'var(--radius)',
    transition: 'background 0.1s',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-primary)',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: '50%',
    border: '2px solid var(--bg-secondary)',
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  contactName: {
    fontWeight: 500,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  contactStatus: {
    fontSize: 12,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  unreadBadge: {
    flexShrink: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
  },
  refreshBtn: {
    flexShrink: 0,
    fontSize: 16,
    color: 'var(--text-muted)',
    padding: '2px 4px',
    borderRadius: 4,
    cursor: 'pointer',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
