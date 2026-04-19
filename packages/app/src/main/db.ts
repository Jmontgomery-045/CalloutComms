import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let sqlDb: Database | null = null
let dbFilePath: string

// ── Persistence ──────────────────────────────────────────────────────────────

function persist(): void {
  fs.writeFileSync(dbFilePath, Buffer.from(sqlDb!.export()))
}

// ── Query helpers ─────────────────────────────────────────────────────────────

function runQuery<T extends Record<string, unknown>>(sql: string, params: unknown[]): T[] {
  const stmt = sqlDb!.prepare(sql)
  const rows: T[] = []
  stmt.bind(params as sql.BindParams)
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

// ── better-sqlite3-compatible API ─────────────────────────────────────────────

export interface RunResult {
  lastInsertRowid: number
}

interface PreparedStatement {
  run(...args: unknown[]): RunResult
  all<T extends Record<string, unknown> = Record<string, unknown>>(...args: unknown[]): T[]
  get<T extends Record<string, unknown> = Record<string, unknown>>(...args: unknown[]): T | undefined
}

function normaliseParams(args: unknown[]): unknown[] {
  // Support both .run(a, b, c) and .run([a, b, c])
  if (args.length === 1 && Array.isArray(args[0])) return args[0] as unknown[]
  return args
}

function prepare(sql: string): PreparedStatement {
  return {
    run(...args: unknown[]): RunResult {
      if (!sqlDb) throw new Error('DB not initialised')
      sqlDb.run(sql, normaliseParams(args) as sql.BindParams)
      persist()
      const result = sqlDb.exec('SELECT last_insert_rowid() AS id')
      const id = (result[0]?.values[0]?.[0] as number | bigint | undefined) ?? 0
      return { lastInsertRowid: Number(id) }
    },
    all<T extends Record<string, unknown>>(...args: unknown[]): T[] {
      if (!sqlDb) throw new Error('DB not initialised')
      return runQuery<T>(sql, normaliseParams(args))
    },
    get<T extends Record<string, unknown>>(...args: unknown[]): T | undefined {
      if (!sqlDb) throw new Error('DB not initialised')
      return runQuery<T>(sql, normaliseParams(args))[0]
    },
  }
}

// ── Public interface (matches better-sqlite3 subset used in this project) ─────

export interface Db {
  prepare(sql: string): PreparedStatement
}

export function getDb(): Db {
  if (!sqlDb) throw new Error('Database not initialised — call initDb() first')
  return { prepare }
}

// ── Initialisation ───────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs()
  dbFilePath = path.join(app.getPath('userData'), 'p2p.db')
  const buf = fs.existsSync(dbFilePath) ? fs.readFileSync(dbFilePath) : null
  sqlDb = buf ? new SQL.Database(buf) : new SQL.Database()

  sqlDb.run('PRAGMA foreign_keys = ON')

  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id           TEXT    PRIMARY KEY,
      public_key   BLOB    NOT NULL,
      private_key  BLOB    NOT NULL,
      display_name TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT '',
      profile_pic_path TEXT,
      profile_pic_hash TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id   TEXT    NOT NULL REFERENCES profiles(id),
      user_id      TEXT    NOT NULL,
      nickname     TEXT    NOT NULL,
      display_name TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT '',
      profile_pic_path TEXT,
      profile_pic_hash TEXT,
      public_key   TEXT    NOT NULL,
      blocked      INTEGER NOT NULL DEFAULT 0,
      added_at     INTEGER NOT NULL,
      UNIQUE(profile_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id      TEXT    NOT NULL REFERENCES profiles(id),
      contact_user_id TEXT    NOT NULL,
      direction       TEXT    NOT NULL CHECK(direction IN ('sent','received')),
      content         TEXT    NOT NULL,
      type            TEXT    NOT NULL DEFAULT 'text' CHECK(type IN ('text','file')),
      timestamp       INTEGER NOT NULL,
      read            INTEGER NOT NULL DEFAULT 0,
      reaction        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread
      ON messages(profile_id, contact_user_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_contacts_profile
      ON contacts(profile_id);
  `)

  // Save the freshly-created schema to disk
  persist()
}
