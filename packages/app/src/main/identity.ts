import sodium from 'libsodium-wrappers'
import { getDb } from './db'

// Bitcoin/IPFS base58 alphabet
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let result = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1'
  return result + digits.reverse().map((d) => B58[d]).join('')
}

export function deriveUserId(publicKey: Uint8Array): string {
  // 20-byte BLAKE2b hash of the public key, base58-encoded → ~27 char ID
  const hash = sodium.crypto_generichash(20, publicKey)
  return base58Encode(hash)
}

export interface Profile {
  id: string
  displayName: string
  status: string
  profilePicPath: string | null
  profilePicHash: string | null
}

export async function createProfile(displayName: string): Promise<Profile> {
  await sodium.ready
  const kp = sodium.crypto_sign_keypair()
  const id = deriveUserId(kp.publicKey)
  const now = Date.now()

  getDb()
    .prepare(
      `INSERT INTO profiles (id, public_key, private_key, display_name, status, created_at)
       VALUES (?, ?, ?, ?, '', ?)`
    )
    .run(id, Buffer.from(kp.publicKey), Buffer.from(kp.privateKey), displayName, now)

  return { id, displayName, status: '', profilePicPath: null, profilePicHash: null }
}

export function getProfiles(): Profile[] {
  return (
    getDb()
      .prepare(
        `SELECT id, display_name, status, profile_pic_path, profile_pic_hash
         FROM profiles ORDER BY created_at`
      )
      .all() as {
      id: string
      display_name: string
      status: string
      profile_pic_path: string | null
      profile_pic_hash: string | null
    }[]
  ).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    status: r.status,
    profilePicPath: r.profile_pic_path,
    profilePicHash: r.profile_pic_hash,
  }))
}

export function getPrivateKey(profileId: string): Uint8Array {
  const row = getDb()
    .prepare('SELECT private_key FROM profiles WHERE id = ?')
    .get(profileId) as { private_key: Buffer } | undefined
  if (!row) throw new Error(`Profile not found: ${profileId}`)
  return new Uint8Array(row.private_key)
}

export function getPublicKey(profileId: string): Uint8Array {
  const row = getDb()
    .prepare('SELECT public_key FROM profiles WHERE id = ?')
    .get(profileId) as { public_key: Buffer } | undefined
  if (!row) throw new Error(`Profile not found: ${profileId}`)
  return new Uint8Array(row.public_key)
}
