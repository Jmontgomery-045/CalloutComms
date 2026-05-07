import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sodium from 'libsodium-wrappers-sumo'
import { createProfile, getProfiles, getPublicKey, getPrivateKey } from './identity'
import { getDb } from './db'

// ── Export / import types (v2 format) ─────────────────────────────────────────

export interface ExportOptions {
  includeProfile: boolean
  includeProfilePic: boolean
  includeContacts: boolean
  includeMessages: boolean
}

interface ExportContact {
  user_id: string
  nickname: string
  display_name: string
  status: string
  public_key: string
  blocked: number
  added_at: number
}

interface ExportMessage {
  contact_user_id: string
  direction: 'sent' | 'received'
  content: string
  type: 'text' | 'file'
  timestamp: number
  read: number
  reaction: string | null
}

/**
 * v3 export inner payload — never contains the user's keypair. Importing always
 * generates a fresh identity, so two machines can't share the same ID.
 */
interface ExportInner {
  displayName?: string
  status?: string
  profilePic?: {
    filename: string
    hashHex: string
    dataBase64: string
  }
  contacts?: ExportContact[]
  messages?: ExportMessage[]
}

/**
 * Decode the encrypted plaintext into the canonical inner payload.
 * Only v3 is supported — v1 and v2 contained keypairs (unsafe model now);
 * any backups produced before never actually decrypted on shipping builds
 * because the standard libsodium-wrappers build is missing crypto_pwhash.
 */
function decodeImportInner(version: number, plaintext: Uint8Array): ExportInner | null {
  if (version !== 3) return null
  try {
    const parsed = JSON.parse(Buffer.from(plaintext).toString('utf-8'))
    if (parsed && typeof parsed === 'object') {
      return parsed as ExportInner
    }
  } catch {
    // fall through
  }
  return null
}

export function registerIpcHandlers(): void {
  // ── Identity ────────────────────────────────────────────────────────────────

  ipcMain.handle('identity:get-profiles', () => getProfiles())

  ipcMain.handle('identity:create-profile', (_e, displayName: string) =>
    createProfile(displayName)
  )

  ipcMain.handle('identity:get-public-key', (_e, profileId: string) =>
    Buffer.from(getPublicKey(profileId)).toString('hex')
  )

  ipcMain.handle(
    'identity:update-profile',
    (_e, { id, displayName, status }: { id: string; displayName: string; status: string }) => {
      getDb()
        .prepare('UPDATE profiles SET display_name = ?, status = ? WHERE id = ?')
        .run(displayName, status, id)
    }
  )

  ipcMain.handle('identity:remove-profile-pic', (_e, profileId: string) => {
    getDb()
      .prepare('UPDATE profiles SET profile_pic_path = NULL, profile_pic_hash = NULL WHERE id = ?')
      .run(profileId)
  })

  ipcMain.handle('identity:get-profile-pic-data-url', (_e, filename: string) => {
    const filePath = path.join(app.getPath('userData'), 'profile-pics', filename)
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  })

  // Receives a PNG data URL from the renderer after the crop modal confirms
  ipcMain.handle('identity:save-cropped-profile-pic', (_e, { profileId, dataUrl }: { profileId: string; dataUrl: string }) => {
    const base64 = dataUrl.split(',')[1]
    const buf = Buffer.from(base64, 'base64')
    const hash = crypto.createHash('sha256').update(buf).digest('hex')
    const filename = `${hash}.png`

    const picsDir = path.join(app.getPath('userData'), 'profile-pics')
    if (!fs.existsSync(picsDir)) fs.mkdirSync(picsDir, { recursive: true })
    fs.writeFileSync(path.join(picsDir, filename), buf)

    getDb()
      .prepare('UPDATE profiles SET profile_pic_path = ?, profile_pic_hash = ? WHERE id = ?')
      .run(filename, hash, profileId)

    return { filename, hash }
  })

  ipcMain.handle(
    'identity:export',
    async (
      event,
      {
        profileId,
        password,
        options,
      }: {
        profileId: string
        password: string
        options?: ExportOptions
      }
    ) => {
      const { BrowserWindow } = await import('electron')
      const win = BrowserWindow.fromWebContents(event.sender)!
      await sodium.ready

      const opts: ExportOptions = {
        includeProfile: options?.includeProfile ?? true,
        includeProfilePic: options?.includeProfilePic ?? false,
        includeContacts: options?.includeContacts ?? true,
        includeMessages: options?.includeMessages ?? false,
      }

      // Backups intentionally never contain the keypair. Importing on another
      // device generates a fresh identity so two installs can't claim the same
      // ID. Only data fields (display name, status, contacts, messages, pic)
      // are eligible for export.
      const inner: ExportInner = {}

      if (opts.includeProfile) {
        const profileRow = getDb()
          .prepare('SELECT display_name, status FROM profiles WHERE id = ?')
          .get(profileId) as { display_name: string; status: string } | undefined
        if (profileRow) {
          inner.displayName = profileRow.display_name
          inner.status = profileRow.status
        }
      }

      if (opts.includeProfilePic) {
        const picRow = getDb()
          .prepare('SELECT profile_pic_path, profile_pic_hash FROM profiles WHERE id = ?')
          .get(profileId) as
          | { profile_pic_path: string | null; profile_pic_hash: string | null }
          | undefined
        if (picRow?.profile_pic_path) {
          const filePath = path.join(
            app.getPath('userData'),
            'profile-pics',
            picRow.profile_pic_path
          )
          if (fs.existsSync(filePath)) {
            inner.profilePic = {
              filename: picRow.profile_pic_path,
              hashHex: picRow.profile_pic_hash ?? '',
              dataBase64: fs.readFileSync(filePath).toString('base64'),
            }
          }
        }
      }

      if (opts.includeContacts) {
        inner.contacts = getDb()
          .prepare(
            `SELECT user_id, nickname, display_name, status, public_key, blocked, added_at
             FROM contacts WHERE profile_id = ?`
          )
          .all(profileId) as unknown as ExportContact[]
      }

      if (opts.includeMessages) {
        inner.messages = getDb()
          .prepare(
            `SELECT contact_user_id, direction, content, type, timestamp, read, reaction
             FROM messages WHERE profile_id = ?`
          )
          .all(profileId) as unknown as ExportMessage[]
      }

      const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
      const key = sodium.crypto_pwhash(
        sodium.crypto_secretbox_KEYBYTES,
        password,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT
      )
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
      const plaintext = Buffer.from(JSON.stringify(inner), 'utf-8')
      const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key)

      const payload = JSON.stringify({
        version: 3,
        salt: Buffer.from(salt).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        sections: {
          profile: opts.includeProfile,
          profilePic: opts.includeProfilePic && !!inner.profilePic,
          contacts: opts.includeContacts,
          messages: opts.includeMessages,
        },
      })

      const result = await dialog.showSaveDialog(win, {
        title: 'Export Callout Backup',
        defaultPath: `callout-backup-${profileId.slice(0, 8)}.json`,
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      })

      if (result.canceled || !result.filePath) return { success: false }
      fs.writeFileSync(result.filePath, payload, 'utf-8')
      return { success: true, path: result.filePath }
    }
  )

  // ── Identity reset ──────────────────────────────────────────────────────────

  ipcMain.handle('identity:reset', (_e, profileId: string) => {
    const db = getDb()
    db.prepare('DELETE FROM messages WHERE profile_id = ?').run(profileId)
    db.prepare('DELETE FROM contacts WHERE profile_id = ?').run(profileId)
    db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId)
    return { success: true }
  })

  // ── Identity import ─────────────────────────────────────────────────────────

  ipcMain.handle('identity:pick-import-file', async (event) => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Callout Backup',
      filters: [{ name: 'JSON backup', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false } as const
    }
    const filePath = result.filePaths[0]
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { ok: true, content, fileName: path.basename(filePath) } as const
    } catch (e) {
      return { ok: false, error: String(e) } as const
    }
  })

  ipcMain.handle(
    'identity:import',
    async (
      _event,
      {
        fileContent,
        password,
      }: {
        fileContent: string
        password: string
      }
    ) => {
      await sodium.ready

      let envelope:
        | {
            version: number
            salt: string
            nonce: string
            ciphertext: string
          }
        | undefined
      try {
        envelope = JSON.parse(fileContent)
      } catch {
        return { success: false, error: 'corrupt' as const }
      }
      if (!envelope || typeof envelope !== 'object') {
        return { success: false, error: 'corrupt' as const }
      }
      if (envelope.version !== 3) {
        return { success: false, error: 'unsupported-version' as const }
      }

      // Decrypt
      let plaintext: Uint8Array
      try {
        const salt = Buffer.from(envelope.salt, 'base64')
        const nonce = Buffer.from(envelope.nonce, 'base64')
        const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
        const key = sodium.crypto_pwhash(
          sodium.crypto_secretbox_KEYBYTES,
          password,
          salt,
          sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_ALG_DEFAULT
        )
        plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)
      } catch {
        return { success: false, error: 'bad-password' as const }
      }

      const inner = decodeImportInner(envelope.version, plaintext)
      if (!inner) return { success: false, error: 'corrupt' as const }

      // Always create a fresh profile with a new keypair. The imported display
      // name and status hydrate it; contacts are attached as pending requests.
      const newProfile = await createProfile(inner.displayName ?? '')
      const profileId = newProfile.id
      const db = getDb()
      const now = Date.now()

      if (inner.status) {
        db.prepare('UPDATE profiles SET status = ? WHERE id = ?').run(inner.status, profileId)
      }

      // Profile picture
      if (inner.profilePic) {
        const picsDir = path.join(app.getPath('userData'), 'profile-pics')
        if (!fs.existsSync(picsDir)) fs.mkdirSync(picsDir, { recursive: true })
        const filename = inner.profilePic.filename
        const buf = Buffer.from(inner.profilePic.dataBase64, 'base64')
        fs.writeFileSync(path.join(picsDir, filename), buf)
        db.prepare(
          'UPDATE profiles SET profile_pic_path = ?, profile_pic_hash = ? WHERE id = ?'
        ).run(filename, inner.profilePic.hashHex, profileId)
      }

      // Contacts: marked pending=1. The new identity has no relationship with
      // these IDs; the user re-establishes each via the "Request" button in
      // the sidebar, which fires a normal contact-request and clears pending
      // on send.
      let contactsImported = 0
      if (Array.isArray(inner.contacts)) {
        const insert = db.prepare(
          `INSERT INTO contacts
             (profile_id, user_id, nickname, display_name, status, public_key, blocked, added_at, pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        for (const c of inner.contacts) {
          try {
            insert.run(
              profileId,
              c.user_id,
              c.nickname,
              c.display_name ?? '',
              c.status ?? '',
              c.public_key,
              c.blocked ?? 0,
              c.added_at ?? now
            )
            contactsImported++
          } catch {
            // skip duplicates / bad rows
          }
        }
      }

      // Messages: imported under the new profile_id. The contact_user_id keeps
      // pointing to the original peers, so existing chat history threads
      // alongside the pending contact entries.
      let messagesImported = 0
      if (Array.isArray(inner.messages)) {
        const insert = db.prepare(
          `INSERT INTO messages
             (profile_id, contact_user_id, direction, content, type, timestamp, read, reaction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        for (const m of inner.messages) {
          try {
            insert.run(
              profileId,
              m.contact_user_id,
              m.direction,
              m.content,
              m.type,
              m.timestamp,
              m.read,
              m.reaction
            )
            messagesImported++
          } catch {
            // ignore
          }
        }
      }

      return {
        success: true as const,
        profileId,
        contactsImported,
        messagesImported,
      }
    }
  )

  ipcMain.handle(
    'contacts:clear-pending',
    (_e, { profileId, userId }: { profileId: string; userId: string }) => {
      getDb()
        .prepare('UPDATE contacts SET pending = 0 WHERE profile_id = ? AND user_id = ?')
        .run(profileId, userId)
    }
  )

  // ── Contacts ─────────────────────────────────────────────────────────────────

  ipcMain.handle('contacts:get', (_e, profileId: string) =>
    getDb()
      .prepare(
        `SELECT id, user_id, nickname, display_name, status,
                profile_pic_path, profile_pic_hash, blocked, pending, added_at
         FROM contacts WHERE profile_id = ? AND blocked = 0
         ORDER BY pending ASC, nickname COLLATE NOCASE`
      )
      .all(profileId)
  )

  ipcMain.handle(
    'contacts:add',
    (
      _e,
      {
        profileId,
        userId,
        nickname,
        displayName,
        publicKey,
      }: {
        profileId: string
        userId: string
        nickname: string
        displayName: string
        publicKey: string
      }
    ) => {
      getDb()
        .prepare(
          `INSERT INTO contacts (profile_id, user_id, nickname, display_name, public_key, added_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(profileId, userId, nickname, displayName, publicKey, Date.now())
    }
  )

  ipcMain.handle(
    'contacts:update-presence',
    (_e, { profileId, userId, displayName, status }: { profileId: string; userId: string; displayName: string; status: string }) => {
      getDb()
        .prepare(
          'UPDATE contacts SET display_name = ?, status = ? WHERE profile_id = ? AND user_id = ?'
        )
        .run(displayName, status, profileId, userId)
    }
  )

  ipcMain.handle(
    'contacts:save-profile-pic',
    (_e, { profileId, userId, dataUrl }: { profileId: string; userId: string; dataUrl: string }) => {
      const base64 = dataUrl.split(',')[1]
      const buf = Buffer.from(base64, 'base64')
      const hash = crypto.createHash('sha256').update(buf).digest('hex')
      const filename = `${hash}.png`
      const picsDir = path.join(app.getPath('userData'), 'profile-pics')
      if (!fs.existsSync(picsDir)) fs.mkdirSync(picsDir, { recursive: true })
      fs.writeFileSync(path.join(picsDir, filename), buf)
      getDb()
        .prepare('UPDATE contacts SET profile_pic_path = ?, profile_pic_hash = ? WHERE profile_id = ? AND user_id = ?')
        .run(filename, hash, profileId, userId)
      return { filename, hash }
    }
  )

  ipcMain.handle(
    'contacts:remove-profile-pic',
    (_e, { profileId, userId }: { profileId: string; userId: string }) => {
      getDb()
        .prepare('UPDATE contacts SET profile_pic_path = NULL, profile_pic_hash = NULL WHERE profile_id = ? AND user_id = ?')
        .run(profileId, userId)
    }
  )

  ipcMain.handle(
    'contacts:block',
    (_e, { profileId, userId }: { profileId: string; userId: string }) => {
      getDb()
        .prepare('UPDATE contacts SET blocked = 1 WHERE profile_id = ? AND user_id = ?')
        .run(profileId, userId)
    }
  )

  // ── Messages ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'messages:get',
    (_e, { profileId, contactUserId }: { profileId: string; contactUserId: string }) =>
      getDb()
        .prepare(
          `SELECT id, direction, content, type, timestamp, read, reaction
           FROM messages WHERE profile_id = ? AND contact_user_id = ?
           ORDER BY timestamp ASC`
        )
        .all(profileId, contactUserId)
  )

  ipcMain.handle(
    'messages:save',
    (
      _e,
      {
        profileId,
        contactUserId,
        direction,
        content,
        type,
        timestamp,
      }: {
        profileId: string
        contactUserId: string
        direction: 'sent' | 'received'
        content: string
        type: 'text' | 'file'
        timestamp: number
      }
    ) => {
      const result = getDb()
        .prepare(
          `INSERT INTO messages (profile_id, contact_user_id, direction, content, type, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(profileId, contactUserId, direction, content, type, timestamp)
      return { id: result.lastInsertRowid }
    }
  )

  ipcMain.handle(
    'messages:mark-read',
    (_e, { profileId, contactUserId }: { profileId: string; contactUserId: string }) => {
      getDb()
        .prepare(
          `UPDATE messages SET read = 1
           WHERE profile_id = ? AND contact_user_id = ? AND direction = 'received'`
        )
        .run(profileId, contactUserId)
    }
  )

  ipcMain.handle(
    'messages:set-reaction',
    (_e, { messageId, reaction }: { messageId: number; reaction: string | null }) => {
      getDb()
        .prepare('UPDATE messages SET reaction = ? WHERE id = ?')
        .run(reaction, messageId)
    }
  )
}
