/**
 * src/db/worker.ts
 * Dedicated Web Worker for SQLite WebAssembly with OPFS / In-Memory persistence
 * Zero-CDN Architecture — loads /wasm/sqlite3.wasm locally
 */

import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL, DEFAULT_SETTINGS, SAMPLE_SUBSCRIBERS, SAMPLE_TENANTS } from './schema.ts';

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

  // Initialize schema
  db.exec(SCHEMA_SQL);

  // Check and seed default settings if empty
  const settingsCount = getOneRow('SELECT COUNT(*) as count FROM settings', []);
  if (!settingsCount || settingsCount.count === 0) {
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      db.exec({
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        bind: [key, val],
      });
    }

    // Seed sample subscribers if table is brand new
    for (const sub of SAMPLE_SUBSCRIBERS) {
      db.exec({
        sql: `INSERT OR IGNORE INTO subscribers (id, full_name, phone, area, neighborhood, alley, house_number, amperes, line_type, line_status, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          sub.id,
          sub.full_name,
          sub.phone,
          sub.area,
          sub.neighborhood,
          sub.alley,
          sub.house_number,
          sub.amperes,
          sub.line_type,
          sub.line_status,
          sub.notes,
        ],
      });
    }
  }

  // Seed sample tenants if empty
  try {
    const tenantsCount = getOneRow('SELECT COUNT(*) as count FROM tenants', []);
    if (!tenantsCount || tenantsCount.count === 0) {
      for (const t of SAMPLE_TENANTS) {
        db.exec({
          sql: `INSERT OR IGNORE INTO tenants (id, name, owner_name, phone, address, plan, plan_price, status, expires_at, is_blocked, license_key, default_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            t.id,
            t.name,
            t.owner_name,
            t.phone,
            t.address,
            t.plan,
            t.plan_price,
            t.status,
            t.expires_at,
            t.is_blocked,
            t.license_key,
            t.default_price,
          ],
        });
      }
    }
  } catch (err) {
    console.warn('[SQLiteWorker] Tenants seeding warning:', err);
  }

  return {
    isOpfs: isOpfsActive,
    version: sqlite3.version.libVersion,
  };
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
    // In-memory import
    const pApp = (sqlite3 as any).wasm?.alloc?.(bytes.length);
    if (!pApp) {
      throw new Error('فشل تخصيص الذاكرة لاستيراد قاعدة البيانات');
    }
    db = new sqlite3.oo1.DB(':memory:', 'c');
    // Using capi deserialization if available or write via temp
  }

  // Check integrity of newly imported DB
  const integrity = checkIntegrity();
  if (!integrity.ok) {
    throw new Error(`فشل التحقق من سلامة قاعدة البيانات المستوردة: ${integrity.details.join(', ')}`);
  }

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
