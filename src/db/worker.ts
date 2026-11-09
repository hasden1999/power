/**
 * src/db/worker.ts
 * Dedicated Web Worker for SQLite WebAssembly with OPFS / In-Memory persistence
 * Zero-CDN Architecture — loads /wasm/sqlite3.wasm locally
 */

import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL, INDEXES_SQL, DEFAULT_SETTINGS } from './schema.ts';

let sqlite3: Sqlite3Static | null = null;
let db: any = null;
let isOpfsActive = false;
let currentDbName = '/ampereji.sqlite3';

interface WorkerRequest {
  id: string;
  type: 'INIT' | 'EXEC' | 'RUN' | 'GET_ALL' | 'GET_ONE' | 'EXPORT' | 'IMPORT' | 'INTEGRITY_CHECK';
  payload?: any;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

function respond(id: string, success: boolean, data?: any, error?: string): void {
  self.postMessage({ id, success, data, error } as WorkerResponse);
}

/**
 * Initialize SQLite module and open DB
 */
async function initDatabase(useOpfs: boolean): Promise<{ isOpfs: boolean; version: string }> {
  if (!sqlite3) {
    sqlite3 = await sqlite3InitModule({
      print: (msg) => console.log('[SQLiteWorker]', msg),
      printErr: (err) => console.error('[SQLiteWorker:Error]', err),
      locateFile: (file: string) => `/wasm/${file}`,
    });
  }

  // Close previous DB if open
  if (db) {
    try {
      db.close();
    } catch (_) {}
    db = null;
  }

  isOpfsActive = false;

  if (useOpfs && 'OpfsDb' in sqlite3.oo1) {
    try {
      db = new sqlite3.oo1.OpfsDb(currentDbName);
      isOpfsActive = true;
      console.log('[SQLiteWorker] Connected to SQLite OPFS Database:', currentDbName);
    } catch (err) {
      console.warn('[SQLiteWorker] Failed to open OpfsDb, falling back to in-memory DB:', err);
      db = new sqlite3.oo1.DB(':memory:', 'c');
      isOpfsActive = false;
    }
  } else {
    db = new sqlite3.oo1.DB(':memory:', 'c');
    isOpfsActive = false;
    console.log('[SQLiteWorker] Connected to in-memory SQLite Database (:memory:)');
  }

  // Execute pragmas for performance and integrity
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  initializeSchema();

  return {
    isOpfs: isOpfsActive,
    version: sqlite3.version.libVersion,
  };
}

/**
 * Create missing tables/columns/indexes and repair rows from older builds.
 *
 * This runs both at startup and after importing a backup, so restoring a
 * database produced by an older release cannot leave the app without the
 * tables or columns the current build expects.
 */
function initializeSchema(): void {
  // Initialize tables first so old databases receive new tables as well.
  db.exec(SCHEMA_SQL);

  // Auto-migration for databases created by older builds.
  const subscribersHadTenant = ensureColumn('subscribers', 'tenant_id', "TEXT DEFAULT 'tenant-default'");
  const billingHadTenant = ensureColumn('billing', 'tenant_id', "TEXT DEFAULT 'tenant-default'");
  const expensesHadTenant = ensureColumn('expenses', 'tenant_id', "TEXT DEFAULT 'tenant-default'");
  ensureColumn('tenants', 'default_price', 'REAL DEFAULT 12000');
  ensureColumn('tenants', 'license_key', "TEXT DEFAULT ''");

  // Very old billing tables may predate the stored remainder column.
  const billingHadRemaining = ensureColumn('billing', 'remaining', 'REAL DEFAULT 0');
  ensureColumn('billing', 'payment_date', 'TEXT');
  if (billingHadRemaining) {
    db.exec('UPDATE billing SET remaining = MAX(COALESCE(total_due, 0) - COALESCE(total_paid, 0), 0)');
  }

  // Indexes run only after the migration above guarantees their columns exist.
  db.exec(INDEXES_SQL);

  // Seed every missing settings key without overwriting user values.
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    db.exec({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      bind: [key, val],
    });
  }

  // A fresh installation always has exactly one local tenant workspace.
  // On upgrades, the legacy settings profile becomes that workspace so the
  // owner keeps the generator name, phone, price and license they already had.
  try {
    const tenantsCount = getOneRow('SELECT COUNT(*) as count FROM tenants', []);
    if (!tenantsCount || tenantsCount.count === 0) {
      const settings = getSettingsMap();
      const trialStart = new Date(settings.trial_start_date || Date.now()).getTime();
      const safeTrialStart = Number.isFinite(trialStart) ? trialStart : Date.now();
      const expiresAt = new Date(safeTrialStart + 30 * 24 * 60 * 60 * 1000).toISOString();
      const licenseKey = settings.license_key || '';
      const isExpired = new Date(expiresAt).getTime() <= Date.now();
      const status = licenseKey ? 'active' : isExpired ? 'expired' : 'trial';

      db.exec({
        sql: `INSERT OR IGNORE INTO tenants (id, name, owner_name, phone, address, plan, plan_price, status, expires_at, is_blocked, license_key, default_price)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          'tenant-default',
          settings.generator_name || 'مولدتي الأهلية',
          'صاحب المولدة',
          settings.owner_phone || '',
          '',
          licenseKey ? 'monthly' : 'trial',
          licenseKey ? 15000 : 0,
          status,
          expiresAt,
          0,
          licenseKey,
          Number(settings.default_ampere_price) || 12000,
        ],
      });
    }

    // Repair orphan rows created by older half-migrated versions and move
    // pre-multi-tenant rows to the workspace the owner actually has selected.
    const settings = getSettingsMap();
    let activeTenantId = settings.active_tenant_id || 'tenant-default';
    if (!getOneRow('SELECT id FROM tenants WHERE id = ?', [activeTenantId])) {
      const firstTenant = getOneRow('SELECT id FROM tenants ORDER BY created_at LIMIT 1', []);
      activeTenantId = firstTenant?.id || 'tenant-default';
      db.exec({
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        bind: ['active_tenant_id', activeTenantId],
      });
    }

    const legacyTables: Array<[string, boolean]> = [
      ['subscribers', subscribersHadTenant],
      ['billing', billingHadTenant],
      ['expenses', expensesHadTenant],
    ];
    for (const [table, hadTenant] of legacyTables) {
      if (hadTenant) {
        // The column did not exist before this upgrade, so every row is legacy
        // data that belongs to the single active workspace.
        db.exec({ sql: `UPDATE ${table} SET tenant_id = ?`, bind: [activeTenantId] });
      } else {
        db.exec({
          sql: `UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''`,
          bind: [activeTenantId],
        });
      }
    }
  } catch (err) {
    console.warn('[SQLiteWorker] Tenants seeding/migration warning:', err);
  }

  db.exec({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    bind: ['db_version', '3'],
  });
}

/**
 * Add a column only when it is missing (idempotent, data-safe migration).
 */
function ensureColumn(table: string, column: string, definition: string): boolean {
  try {
    const columns = getAllRows(`PRAGMA table_info(${table})`, []);
    if (!columns.some((c: any) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
      console.log(`[SQLiteWorker] Migrated: ${table}.${column}`);
      return true;
    }
  } catch (err) {
    console.warn(`[SQLiteWorker] Could not ensure column ${table}.${column}:`, err);
  }
  return false;
}

/**
 * Execute query returning all rows as JS objects
 */
function getAllRows(sql: string, params: any[] = []): any[] {
  if (!db) throw new Error('Database is not initialized');
  const results: any[] = [];
  db.exec({
    sql,
    bind: params,
    rowMode: 'object',
    callback: (row: any) => {
      results.push(row);
    },
  });
  return results;
}

/**
 * Execute query returning single row as JS object
 */
function getOneRow(sql: string, params: any[] = []): any | null {
  if (!db) throw new Error('Database is not initialized');
  let result: any = null;
  db.exec({
    sql,
    bind: params,
    rowMode: 'object',
    callback: (row: any) => {
      if (!result) result = row;
    },
  });
  return result;
}

function getSettingsMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of getAllRows('SELECT key, value FROM settings', [])) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Run parameterized mutation statement (INSERT, UPDATE, DELETE)
 */
function runStatement(sql: string, params: any[] = []): { changes: number; lastInsertRowid: any } {
  if (!db) throw new Error('Database is not initialized');
  db.exec({
    sql,
    bind: params,
  });
  const changes = db.changes();
  return {
    changes,
    lastInsertRowid: null,
  };
}

/**
 * Check database integrity
 */
function checkIntegrity(): { ok: boolean; details: string[] } {
  if (!db) throw new Error('Database is not initialized');
  const rows = getAllRows('PRAGMA integrity_check', []);
  const details = rows.map((r: any) => Object.values(r)[0] as string);
  const ok = details.length === 1 && details[0] === 'ok';
  return { ok, details };
}

/**
 * Export raw SQLite database binary
 */
function exportDatabase(): Uint8Array {
  if (!db || !sqlite3) throw new Error('Database is not initialized');
  // Use sqlite3_js_db_export
  const capi = (sqlite3 as any).capi;
  if (capi && typeof capi.sqlite3_js_db_export === 'function') {
    return capi.sqlite3_js_db_export(db);
  }
  if (typeof db.export === 'function') {
    return db.export();
  }
  throw new Error('Database export function not supported by this SQLite build');
}

/**
 * Import and replace SQLite database from binary
 */
async function importDatabase(bytes: Uint8Array): Promise<boolean> {
  if (!sqlite3) throw new Error('SQLite not loaded');

  // Verify byte header first
  const header = new TextDecoder().decode(bytes.slice(0, 16));
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('الملف ليس قاعدة بيانات SQLite صالحة (توقيع غير مطابق)');
  }

  // Close existing db
  if (db) {
    try {
      db.close();
    } catch (_) {}
    db = null;
  }

  if (isOpfsActive) {
    // Write directly to OPFS
    const root = await navigator.storage.getDirectory();
    const cleanName = currentDbName.replace(/^\//, '');
    const fileHandle = await root.getFileHandle(cleanName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(bytes);
    await writable.close();

    db = new sqlite3.oo1.OpfsDb(currentDbName);
  } else {
    // In-memory import through SQLite's native deserialization API.
    const capi = (sqlite3 as any).capi;
    const wasm = (sqlite3 as any).wasm;
    if (!capi?.sqlite3_deserialize || !wasm?.allocFromTypedArray) {
      throw new Error('استيراد قاعدة البيانات غير مدعوم في محرك SQLite الحالي');
    }

    db = new sqlite3.oo1.DB(':memory:', 'c');
    const dataPtr = wasm.allocFromTypedArray(bytes);
    const flags = capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE;
    const rc = capi.sqlite3_deserialize(db.pointer, 'main', dataPtr, bytes.byteLength, bytes.byteLength, flags);
    if (rc !== 0) {
      throw new Error(`فشل استيراد قاعدة البيانات (SQLite ${rc})`);
    }
  }

  // Re-apply connection pragmas after replacing the database file/handle.
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Check integrity of newly imported DB
  const integrity = checkIntegrity();
  if (!integrity.ok) {
    throw new Error(`فشل التحقق من سلامة قاعدة البيانات المستوردة: ${integrity.details.join(', ')}`);
  }

  // Bring backups created by older releases up to the current schema before
  // the UI tries to query auth_users or tenant-scoped columns.
  initializeSchema();

  return true;
}

// Worker message dispatcher
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT': {
        const result = await initDatabase(Boolean(payload?.useOpfs));
        respond(id, true, result);
        break;
      }
      case 'EXEC': {
        if (!db) throw new Error('Database not initialized');
        db.exec(payload.sql);
        respond(id, true, true);
        break;
      }
      case 'RUN': {
        const res = runStatement(payload.sql, payload.params || []);
        respond(id, true, res);
        break;
      }
      case 'GET_ALL': {
        const rows = getAllRows(payload.sql, payload.params || []);
        respond(id, true, rows);
        break;
      }
      case 'GET_ONE': {
        const row = getOneRow(payload.sql, payload.params || []);
        respond(id, true, row);
        break;
      }
      case 'INTEGRITY_CHECK': {
        const result = checkIntegrity();
        respond(id, true, result);
        break;
      }
      case 'EXPORT': {
        const binary = exportDatabase();
        respond(id, true, binary);
        break;
      }
      case 'IMPORT': {
        const success = await importDatabase(payload.bytes);
        respond(id, true, success);
        break;
      }
      default:
        respond(id, false, null, `Unknown message type: ${type}`);
    }
  } catch (err: any) {
    console.error(`[SQLiteWorker Error on ${type}]:`, err);
    respond(id, false, null, err.message || String(err));
  }
};
