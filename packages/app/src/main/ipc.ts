import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sodium from 'libsodium-wrappers'
import { createProfile, getProfiles, getPublicKey, getPrivateKey } from './identity'
import { getDb } from './db'

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
    async (event, { profileId, password }: { profileId: string; password: string }) => {
      const { BrowserWindow } = await import('electron')
      const win = BrowserWindow.fromWebContents(event.sender)!
      await sodium.ready
      const privKey = getPrivateKey(profileId)
      const pubKey = getPublicKey(profileId)

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
      const plain = Buffer.concat([Buffer.from(privKey), Buffer.from(pubKey)])
      const ciphertext = sodium.crypto_secretbox_easy(plain, nonce, key)

      const payload = JSON.stringify({
        version: 1,
        profileId,
        salt: Buffer.from(salt).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
        ciphertext: Buffer.from(ciphertext).toString('base64'),
      })

      const result = await dialog.showSaveDialog(win, {
        title: 'Export Identity Backup',
        defaultPath: `p2p-identity-${profileId.slice(0, 8)}.json`,
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      })

      if (result.canceled || !result.filePath) return { success: false }
      fs.writeFileSync(result.filePath, payload, 'utf-8')
      return { success: true, path: result.filePath }
    }
  )

  // ── Contacts ─────────────────────────────────────────────────────────────────

  ipcMain.handle('contacts:get', (_e, profileId: string) =>
    getDb()
      .prepare(
        `SELECT id, user_id, nickname, display_name, status,
                profile_pic_path, profile_pic_hash, blocked, added_at
         FROM contacts WHERE profile_id = ? AND blocked = 0
         ORDER BY nickname COLLATE NOCASE`
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
