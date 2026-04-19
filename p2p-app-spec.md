# P2P Voice & Messaging Application — Project Specification

## Overview

A Windows-first (eventually cross-platform) peer-to-peer voice and messaging application. No user accounts. No centralised data storage. Privacy by architecture.

---

## Core Principles

- No user accounts or registration
- Signalling server is stateless — brokers connections only, stores nothing
- All voice and messaging data flows peer-to-peer
- All persistent data lives on the user's local machine only
- End-to-end encrypted by default

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI framework | React |
| Desktop shell | Electron |
| Language | TypeScript (throughout) |
| Signalling server | Node.js + WebSockets |
| Local database | SQLite via better-sqlite3 |
| Cryptography | libsodium (libsodium-wrappers) |
| Audio mixing | Web Audio API |
| Voice + data channels | WebRTC (built into Electron/Chromium) |
| Signalling deployment | Railway or Fly.io (free tier initially) |

---

## Identity

- On first launch, the app generates an **Ed25519 key pair** using libsodium
- A unique **User ID** is derived from the public key (base58 encoded hash)
- The private key is stored locally and never leaves the device
- The User ID is permanent for that install
- Users may have **multiple profiles** on a single install, each with its own key pair and ID
- There are no usernames, emails, or passwords

### Profile Data (all stored locally)

- **User ID** — derived from public key, immutable
- **Display name** — user's chosen name, shared with contacts on connection
- **Status** — short text string (~150 char max), shared with contacts on connection
- **Profile picture** — stored locally, synced P2P on change

---

## Signalling Server

- Node.js + WebSocket server
- Maintains an in-memory map of `UserID → active WebSocket connection`
- **Stores nothing persistently** — no database, no logs
- Brokers connection handshakes only (SDP offers/answers, ICE candidates)
- Once a P2P connection is established, the server is out of the picture entirely

### What the server handles

- Online presence routing (is a given ID currently connected?)
- Connection request delivery (if recipient is online)
- ICE candidate exchange during handshake

### What the server does NOT handle

- Message storage
- Connection request queuing (if recipient is offline, request fails — user must retry)
- Any user data or metadata persistence

---

## NAT Traversal

- **STUN**: Use Google's public STUN servers (`stun.l.google.com`) for address discovery
- **TURN**: Self-hosted coturn instance on a small VPS as fallback relay for ~15-20% of connections that cannot go direct
- **ICE**: Standard ICE framework via WebRTC handles STUN-first, TURN-fallback automatically

---

## Contact System

### Adding a Contact

1. User copies their ID via a **[Copy]** button in their profile area
2. They share it out-of-band (text, email, in person)
3. The receiving user pastes the ID into an **Add Contact** field
4. A connection request form appears:
   - Recipient ID (pre-filled, truncated display)
   - Message field (max 200 characters)
   - **[Send Request]** button
5. Request is delivered via signalling server **only if recipient is currently online**
6. If recipient is offline, request fails with a clear message: *"Recipient is offline — try again when they're online"*
7. No pending state is stored on the server

### Receiving a Request

The recipient sees a notification:

```
Connection request from "Alice" (7xK9mP2q...)
"Hi, it's Alice from work!"

[Add]  [Ignore]  [Block]
```

- **Add** — both appear in each other's contact lists; recipient prompted to assign a nickname
- **Ignore** — request dismissed silently, sender sees no response
- **Block** — request dismissed, that ID cannot send future requests

### Nicknames

- Each user assigns their own local nickname to each contact
- Nicknames are stored locally only, never shared
- The contact's **display name** is shown during the request flow as a hint
- Once a nickname is assigned, it overrides the display name in all UI

### Contact List UI

```
Contacts
├── Alice     (online)
├── Dave      (online)
└── Sarah     (offline)
```

- Online/offline status visible for all contacts
- Call and message buttons greyed out for offline contacts

---

## Profile Sync (P2P)

When two contacts connect, they exchange a handshake payload:

```json
{
  "id": "7xK9mP2q...",
  "displayName": "Alice",
  "status": "Away until Friday 🌴",
  "profilePicHash": "a3f9c2..."
}
```

### Profile Picture Sync

- Each user stores a SHA-256 hash of their current profile picture locally
- On connection, hashes are compared
- If hashes differ (or no cached image exists), the image is requested and transferred over the WebRTC data channel
- Images are capped at **1MB**, resized and stored locally at **256×256px**
- Accepted formats: JPG, PNG (normalised on import)
- Users with no profile picture get a deterministic generated identicon based on their ID

### Display Name + Status

- Transmitted fresh on every connection (no caching needed, small strings)
- Character limit on status: ~150 characters
- Status presets available in UI: Available, Busy, Away, plus custom text field

---

## Messaging

- Available **only when both users are online simultaneously**
- Flows over the **WebRTC data channel** (same P2P connection as voice)
- End-to-end encrypted via WebRTC's built-in DTLS
- Message and voice share the same P2P connection

### Features

- Text messages
- File transfer (chunked over data channel, progress shown in message thread)
- Emoji reactions on messages
- Typing indicators (toggleable in settings, on by default)
- Read receipts (toggleable in settings, on by default)

### Local Storage

- Message history stored in a local **SQLite database** via better-sqlite3
- Each user holds only their own copy
- No sync across devices
- History is lost on reinstall unless user exports/backs up manually
- Warn user clearly about this on first launch

---

## Voice Calls (1-to-1)

- Pure P2P via WebRTC
- Opus codec for audio
- Server is not involved once connection is established
- TURN relay used as fallback only (~15-20% of calls)

---

## Group Calls

### Limits

- Maximum **6 participants** including host
- UI displays current count: `Group Call (4/6)`

### Host Model — Designated Host (Initiator)

- The user who **initiates** the group call is always the host
- Host role is established at call creation and known to all participants from the signalling handshake
- The host receives individual audio streams from all participants, mixes them using the **Web Audio API**, and rebroadcasts one mixed stream to each participant
- All other participants send one stream to the host and receive one mixed stream back

### Host Succession

If the host drops, succession follows **join order**:

```
Alice initiates — host (position 1)
Bob joins       — position 2
Carol joins     — position 3

Alice drops → Bob becomes host automatically
Bob drops   → Carol becomes host automatically
```

- Join order is recorded locally by each participant at call start
- All remaining peers independently calculate the same new host without needing to negotiate
- New host signals all participants: *"I'm taking over as host"*
- Brief interruption of ~2-4 seconds expected during handover

### Manual Host Transfer

- Current host can pass host role via UI dropdown: `[Pass Host to ▾]`
- All participants re-establish streams to the new host
- Brief interruption expected

### Group Call Permissions

- **Anyone** in the call can invite additional contacts (up to the 6 person cap)
- **Host only** has kick rights

### Group Call Messaging

- Text messaging is available simultaneously with voice in group calls
- Flows over WebRTC data channels between all participants

---

## Settings

| Setting | Default | Notes |
|---|---|---|
| Read receipts | On | Toggleable |
| Typing indicators | On | Toggleable |
| Profile picture | None | Local file picker, JPG/PNG |
| Display name | — | Free text |
| Status | — | Preset or custom |
| Manage profiles | — | Create/switch/delete local profiles |
| Export identity | — | Backup key as encrypted file |

---

## Privacy & Security Notes

- The signalling server never stores any content, connection requests, or user data
- Profile pictures are never hosted anywhere — synced directly between peers
- No message content ever touches any server
- Local nickname data never leaves the user's machine
- Voice traffic goes directly peer-to-peer in ~80-85% of calls; TURN relay for the remainder (encrypted, server cannot read content)
- Connection requests require both parties to be online simultaneously — no metadata trail on the server
- Block list is stored locally only

### Identity Backup Warning

Display clearly on first launch and in settings:

> Your ID and encryption keys are stored only on this device. If you uninstall or lose your device without making a backup, your ID cannot be recovered. Contacts who have your ID saved will have a dead entry and you will need to re-add them with a new ID.

Provide an **Export Identity** option that saves the key pair as an encrypted backup file.

---

## UI Structure (High Level)

```
App
├── Sidebar
│   ├── Your profile (ID, display name, status, avatar)
│   ├── Contact list (online/offline)
│   └── Add contact button
├── Main panel
│   ├── Conversation view (messages + call controls)
│   └── Empty state when no contact selected
└── Settings panel
```

---

## Out of Scope (for now)

- Video calls
- Mobile clients (planned for later, React Native)
- Group messaging outside of a call context
- Message search
- Message editing or deletion
- Disappearing messages
