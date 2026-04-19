# Callout

**Private, peer-to-peer voice and messaging. No accounts. No servers. No data leaving your device.**

Callout is a desktop app for encrypted 1-to-1 and group voice calls and messaging. Identities are generated locally, contacts and messages are stored in a local SQLite database, and all communication happens directly between peers over WebRTC. There is no backend that stores anything about you.

---

## How it works

When you first launch Callout, it generates an Ed25519 keypair locally using libsodium. Your user ID is a base58-encoded 20-byte BLAKE2b hash of your public key — roughly 27 characters, and the only thing you share with contacts. It never leaves your device on its own.

All messages, calls, contacts, and keys are stored in a SQLite database on your machine via sql.js (a pure WASM build — no native compilation). Nothing is synced to any server.

Voice calls and messages travel directly between peers over encrypted WebRTC data channels and audio tracks. A lightweight signalling server exists only to broker the initial WebRTC handshake (exchanging SDP offers/answers and ICE candidates). Once the connection is established, the signalling server is out of the picture entirely. It stores no messages, no keys, no metadata, and no user records of any kind.

---

## Features

- **1-to-1 encrypted messaging** over WebRTC data channels
- **1-to-1 and group voice calls** — groups support up to 6 participants with host-mixed audio
- **Contact management** with custom nicknames
- **Profile pictures** with an in-app crop and reposition tool
- **Deterministic identicons** for contacts without a profile picture
- **Custom status** — choose from presets or write your own
- **Identity export** — encrypted backup file for moving your identity to another device
- **Typing indicators and read receipts** — both toggleable
- **Custom frameless window** in the style of VS Code or Discord

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 29 + electron-vite |
| UI | React 18 + TypeScript |
| State | Zustand |
| P2P transport | WebRTC (data channels + audio) |
| Cryptography | libsodium-wrappers (Ed25519, BLAKE2b, symmetric encryption) |
| Local storage | sql.js (SQLite via WASM) |
| Signalling | ws (Node.js WebSocket server) |

---

## Getting started

**Requirements:** Node.js 18+, npm 9+

```bash
# Clone the repo
git clone <repo-url>
cd callout

# Install dependencies for all packages
npm install
```

You need two terminals to run the app in development:

```bash
# Terminal 1 — signalling server
npm run dev:server

# Terminal 2 — Electron app
npm run dev:app
```

### Building for production

```bash
npm run build:server   # builds the signalling server
npm run build:app      # packages the Electron app
```

---

## Project structure

```
callout/
├── packages/
│   ├── app/           # Electron application
│   │   ├── src/
│   │   │   ├── main/       # Electron main process
│   │   │   ├── preload/    # Preload scripts (context bridge)
│   │   │   └── renderer/   # React UI
│   └── server/        # Stateless WebSocket signalling server
├── package.json       # Root workspace config
```

---

## The signalling server

WebRTC connections require an initial handshake to exchange connection details (SDP and ICE candidates) before a direct peer link can be established. The signalling server handles this brokering step.

It does not:
- Store any messages
- Store any user identities or keys
- Log or retain metadata about calls or sessions
- See the content of any communication

Once two peers have connected directly, the signalling server plays no further role. You can self-host the server — it is a single stateless Node.js process with no database and no configuration beyond a port number.
