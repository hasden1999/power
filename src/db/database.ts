/**
 * src/db/database.ts
 * Main Thread Client Interface to SQLite WASM Web Worker
 * Thread-Safe, Asynchronous, Typed Database Client for Ampereji
 */

import type {
  Subscriber,
  BillingRecord,
  Expense,
  AppSettings,
  MonthlyReport,
  BillStatus,
} from '../types/index.ts';
import { platform } from '../platform.ts';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: any;
}

export class DatabaseClient {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private isInitialized = false;
  private isOpfs = false;
  private libVersion = '';
  private modificationCount = 0;
  private readonly AUTO_BACKUP_THRESHOLD = 50;

  constructor() {}

  /**
   * Initialize worker and SQLite connection
   */
  public async init(): Promise<{ isOpfs: boolean; version: string }> {
    if (this.isInitialized && this.worker) {
      return { isOpfs: this.isOpfs, version: this.libVersion };
    }

    const platformInfo = platform.getPlatformInfo();
    const useOpfs = platformInfo.isStandalone;

    // Request persistent storage if supported
    if (useOpfs && typeof navigator.storage?.persist === 'function') {
      try {
        const persisted = await navigator.storage.persist();
        console.log('[Ampereji:DB] Persistent storage requested, granted:', persisted);
      } catch (err) {
        console.warn('[Ampereji:DB] Could not request persistent storage:', err);
      }
    }

    // Initialize Web Worker with Vite URL loader
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, success, data, error } = e.data;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        if (success) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(error || 'Worker operation failed'));
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error('[Ampereji:DB:WorkerError]', err);
    };

    const res = await this.send<{ isOpfs: boolean; version: string }>('INIT', { useOpfs });
    this.isInitialized = true;
    this.isOpfs = res.isOpfs;
    this.libVersion = res.version;

    // Load initial modification count
    try {
      const settings = await this.getSettings();
      this.modificationCount = settings.modificationCount || 0;
    } catch (_) {}

    return res;
  }

  private send<T = any>(type: string, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Database worker not initialized. Call db.init() first.'));
      }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Database operation timed out: ${type}`));
        }
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, payload });
    });
  }

  private async notifyModification(): Promise<void> {
    this.modificationCount++;
    if (this.modificationCount % this.AUTO_BACKUP_THRESHOLD === 0) {
      window.dispatchEvent(new CustomEvent('ampereji:trigger-auto-backup'));
    }
    // Update setting counter
    try {
      await this.send('RUN', {
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        params: ['modification_count', this.modificationCount.toString()],
      });
    } catch (_) {}
  }

  /* ----------------------------------------------------
   * SUBSCRIBERS CRUD
   * ---------------------------------------------------- */

  public async getSubscribers(search: string = '', statusFilter: string = 'الكل'): Promise<Subscriber[]> {
    let sql = 'SELECT * FROM subscribers WHERE 1=1';
    const params: any[] = [];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (full_name LIKE ? OR phone LIKE ? OR alley LIKE ? OR neighborhood LIKE ? OR area LIKE ?)';
      params.push(q, q, q, q, q);
    }

    if (statusFilter !== 'الكل' && statusFilter) {
      sql += ' AND line_status = ?';
      params.push(statusFilter);
    }

    sql += ' ORDER BY full_name COLLATE NOCASE ASC';

    const rows = await this.send<any[]>('GET_ALL', { sql, params });
    return rows.map((r) => this.mapSubscriber(r));
  }

  public async getSubscriberById(id: string): Promise<Subscriber | null> {
    const row = await this.send<any>('GET_ONE', {
      sql: 'SELECT * FROM subscribers WHERE id = ?',
      params: [id],
    });
    return row ? this.mapSubscriber(row) : null;
  }

  public async addSubscriber(
    sub: Omit<Subscriber, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.send('RUN', {
      sql: `INSERT INTO subscribers (id, full_name, phone, area, neighborhood, alley, house_number, amperes, line_type, line_status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        sub.fullName.trim(),
        sub.phone.trim(),
        sub.area.trim(),
        sub.neighborhood.trim(),
        sub.alley.trim(),
        sub.houseNumber.trim(),
        Number(sub.amperes) || 1,
        sub.lineType,
        sub.lineStatus,
        sub.notes.trim(),
        now,
        now,
      ],
    });

    await this.notifyModification();
    return id;
  }

  public async updateSubscriber(id: string, updates: Partial<Subscriber>): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getSubscriberById(id);
    if (!existing) throw new Error('المشترك غير موجود');

    const merged = { ...existing, ...updates, updatedAt: now };

    await this.send('RUN', {
      sql: `UPDATE subscribers SET
            full_name = ?, phone = ?, area = ?, neighborhood = ?, alley = ?, house_number = ?,
            amperes = ?, line_type = ?, line_status = ?, notes = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        merged.fullName.trim(),
        merged.phone.trim(),
        merged.area.trim(),
        merged.neighborhood.trim(),
        merged.alley.trim(),
        merged.houseNumber.trim(),
        Number(merged.amperes) || 1,
        merged.lineType,
        merged.lineStatus,
        merged.notes.trim(),
        now,
        id,
      ],
    });

    await this.notifyModification();
  }

  public async deleteSubscriber(id: string): Promise<void> {
    await this.send('RUN', {
      sql: 'DELETE FROM subscribers WHERE id = ?',
      params: [id],
    });
    await this.notifyModification();
  }

  /* ----------------------------------------------------
   * BILLING & COLLECTIONS
   * ---------------------------------------------------- */

  public async getBillingRecords(
    year: number,
    month: number,
    search: string = '',
    statusFilter: string = 'الكل'
  ): Promise<BillingRecord[]> {
    let sql = `
      SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone, s.amperes as sub_amperes
      FROM billing b
      JOIN subscribers s ON b.subscriber_id = s.id
      WHERE b.year = ? AND b.month = ?
    `;
    const params: any[] = [year, month];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (s.full_name LIKE ? OR s.phone LIKE ?)';
      params.push(q, q);
    }

    if (statusFilter !== 'الكل' && statusFilter) {
      sql += ' AND b.status = ?';
      params.push(statusFilter);
    }

    sql += ' ORDER BY s.full_name COLLATE NOCASE ASC';

    const rows = await this.send<any[]>('GET_ALL', { sql, params });
    return rows.map((r) => this.mapBilling(r));
  }

  public async getSubscriberBillingHistory(subscriberId: string): Promise<BillingRecord[]> {
    const rows = await this.send<any[]>('GET_ALL', {
      sql: `SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone
            FROM billing b
            JOIN subscribers s ON b.subscriber_id = s.id
            WHERE b.subscriber_id = ?
            ORDER BY b.year DESC, b.month DESC`,
      params: [subscriberId],
    });
    return rows.map((r) => this.mapBilling(r));
  }

  public async generateMonthlyBills(
    year: number,
    month: number,
    pricePerAmpere: number
  ): Promise<number> {
    const subscribers = await this.getSubscribers('', 'نشط');
    let generatedCount = 0;

    for (const sub of subscribers) {
      const existing = await this.send<any>('GET_ONE', {
        sql: 'SELECT id FROM billing WHERE subscriber_id = ? AND month = ? AND year = ?',
        params: [sub.id, month, year],
      });

      if (!existing) {
        const id = crypto.randomUUID();
        const totalDue = sub.amperes * pricePerAmpere;
        const now = new Date().toISOString();

        await this.send('RUN', {
          sql: `INSERT INTO billing (id, subscriber_id, month, year, price_per_ampere, total_due, total_paid, remaining, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'غير مسدد', ?)`,
          params: [id, sub.id, month, year, pricePerAmpere, totalDue, totalDue, now],
        });
        generatedCount++;
      }
    }

    if (generatedCount > 0) {
      await this.notifyModification();
    }
    return generatedCount;
  }

  public async savePayment(
    billId: string,
    paidAmount: number,
    notes: string = ''
  ): Promise<BillingRecord> {
    const bill = await this.send<any>('GET_ONE', {
      sql: 'SELECT * FROM billing WHERE id = ?',
      params: [billId],
    });
    if (!bill) throw new Error('سجل الجباية غير موجود');

    const newTotalPaid = Number(bill.total_paid) + Number(paidAmount);
    const totalDue = Number(bill.total_due);
    const newRemaining = Math.max(0, totalDue - newTotalPaid);

    let newStatus: BillStatus = 'غير مسدد';
    if (newTotalPaid >= totalDue) {
      newStatus = 'واصل';
    } else if (newTotalPaid > 0) {
      newStatus = 'متبقي';
    }

    const now = new Date().toISOString();
    const updatedNotes = notes.trim()
      ? `${bill.notes ? bill.notes + ' | ' : ''}${notes.trim()}`
      : bill.notes;

    await this.send('RUN', {
      sql: `UPDATE billing SET
            total_paid = ?, remaining = ?, status = ?, payment_date = ?, notes = ?
            WHERE id = ?`,
      params: [newTotalPaid, newRemaining, newStatus, now, updatedNotes, billId],
    });

    await this.notifyModification();

    const updated = await this.send<any>('GET_ONE', {
      sql: `SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone
            FROM billing b JOIN subscribers s ON b.subscriber_id = s.id WHERE b.id = ?`,
      params: [billId],
    });
    return this.mapBilling(updated);
  }

  /* ----------------------------------------------------
   * EXPENSES & FUEL
   * ---------------------------------------------------- */

  public async getExpenses(month?: number, year?: number): Promise<Expense[]> {
    let sql = 'SELECT * FROM expenses WHERE 1=1';
    const params: any[] = [];

    if (month && year) {
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const prefix = `${year}-${monthStr}-%`;
      sql += ' AND expense_date LIKE ?';
      params.push(prefix);
    }

    sql += ' ORDER BY expense_date DESC, created_at DESC';

    const rows = await this.send<any[]>('GET_ALL', { sql, params });
    return rows.map((r) => this.mapExpense(r));
  }

  public async addExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.send('RUN', {
      sql: `INSERT INTO expenses (id, expense_type, fuel_liters, total_amount, expense_date, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        expense.expenseType,
        expense.fuelLiters ? Number(expense.fuelLiters) : null,
        Number(expense.totalAmount) || 0,
        expense.expenseDate || now.split('T')[0],
        expense.notes.trim(),
        now,
      ],
    });

    await this.notifyModification();
    return id;
  }

  public async deleteExpense(id: string): Promise<void> {
    await this.send('RUN', {
      sql: 'DELETE FROM expenses WHERE id = ?',
      params: [id],
    });
    await this.notifyModification();
  }

  /* ----------------------------------------------------
   * REPORTS & STATS
   * ---------------------------------------------------- */

  public async getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
    // Subscriber statistics
    const subsStat = await this.send<any>('GET_ONE', {
      sql: `SELECT
              COUNT(*) as total_subs,
              SUM(CASE WHEN line_status = 'نشط' THEN 1 ELSE 0 END) as active_subs,
              SUM(CASE WHEN line_status = 'نشط' THEN amperes ELSE 0 END) as total_amps
            FROM subscribers`,
    });

    // Billing statistics for the given month
    const billingStat = await this.send<any>('GET_ONE', {
      sql: `SELECT
              COALESCE(SUM(total_due), 0) as total_due,
              COALESCE(SUM(total_paid), 0) as total_collected,
              COALESCE(SUM(remaining), 0) as total_debt
            FROM billing
            WHERE year = ? AND month = ?`,
      params: [year, month],
    });

    // Expenses for the month
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const datePrefix = `${year}-${monthStr}-%`;

    const expenseStat = await this.send<any>('GET_ONE', {
      sql: `SELECT
              COALESCE(SUM(total_amount), 0) as total_expenses,
              COALESCE(SUM(CASE WHEN expense_type = 'وقود' THEN total_amount ELSE 0 END), 0) as fuel_expenses,
              COALESCE(SUM(CASE WHEN expense_type = 'وقود' THEN fuel_liters ELSE 0 END), 0) as fuel_liters
            FROM expenses
            WHERE expense_date LIKE ?`,
      params: [datePrefix],
    });

    const totalCollected = Number(billingStat?.total_collected) || 0;
    const totalExpenses = Number(expenseStat?.total_expenses) || 0;
    const netProfit = totalCollected - totalExpenses;

    return {
      month,
      year,
      totalSubscribers: Number(subsStat?.total_subs) || 0,
      activeSubscribers: Number(subsStat?.active_subs) || 0,
      totalAmperes: Number(subsStat?.total_amps) || 0,
      totalDue: Number(billingStat?.total_due) || 0,
      totalCollected,
      totalDebt: Number(billingStat?.total_debt) || 0,
      totalExpenses,
      fuelExpenses: Number(expenseStat?.fuel_expenses) || 0,
      fuelLiters: Number(expenseStat?.fuel_liters) || 0,
      netProfit,
    };
  }

  /* ----------------------------------------------------
   * SETTINGS
   * ---------------------------------------------------- */

  public async getSettings(): Promise<AppSettings> {
    const rows = await this.send<any[]>('GET_ALL', { sql: 'SELECT * FROM settings' });
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }

    return {
      generatorName: map.generator_name || 'مولدة حي السلام الأهلية',
      ownerPhone: map.owner_phone || '',
      defaultAmperePrice: Number(map.default_ampere_price) || 12000,
      currency: map.currency || 'د.ع',
      trialStartDate: map.trial_start_date || new Date().toISOString(),
      licenseKey: map.license_key || '',
      dbVersion: map.db_version || '1',
      modificationCount: Number(map.modification_count) || 0,
      lastBackup: map.last_backup || '',
      lastExternalExport: map.last_external_export || '',
    };
  }

  public async updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const keyMap: Record<keyof AppSettings, string> = {
      generatorName: 'generator_name',
      ownerPhone: 'owner_phone',
      defaultAmperePrice: 'default_ampere_price',
      currency: 'currency',
      trialStartDate: 'trial_start_date',
      licenseKey: 'license_key',
      dbVersion: 'db_version',
      modificationCount: 'modification_count',
      lastBackup: 'last_backup',
      lastExternalExport: 'last_external_export',
    };

    for (const [prop, val] of Object.entries(updates)) {
      const dbKey = keyMap[prop as keyof AppSettings];
      if (dbKey && val !== undefined) {
        await this.send('RUN', {
          sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          params: [dbKey, String(val)],
        });
      }
    }

    await this.notifyModification();
  }

  /* ----------------------------------------------------
   * EXPORT, IMPORT, INTEGRITY & STORAGE
   * ---------------------------------------------------- */

  public async exportDatabaseBinary(): Promise<Uint8Array> {
    const bytes = await this.send<Uint8Array>('EXPORT');
    const now = new Date().toISOString();
    await this.updateSettings({ lastExternalExport: now });
    return bytes;
  }

  public async importDatabaseBinary(bytes: Uint8Array): Promise<boolean> {
    const success = await this.send<boolean>('IMPORT', { bytes });
    if (success) {
      window.dispatchEvent(new CustomEvent('ampereji:db-reloaded'));
    }
    return success;
  }

  public async checkIntegrity(): Promise<{ ok: boolean; details: string[] }> {
    return this.send('INTEGRITY_CHECK');
  }

  public async getStorageEstimate(): Promise<{
    usage: number;
    quota: number;
    isPersisted: boolean;
    isOpfs: boolean;
  }> {
    let usage = 0;
    let quota = 0;
    let isPersisted = false;

    if (typeof navigator.storage?.estimate === 'function') {
      try {
        const est = await navigator.storage.estimate();
        usage = est.usage || 0;
        quota = est.quota || 0;
      } catch (_) {}
    }

    if (typeof navigator.storage?.persisted === 'function') {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch (_) {}
    }

    return {
      usage,
      quota,
      isPersisted,
      isOpfs: this.isOpfs,
    };
  }

  /* ----------------------------------------------------
   * PRIVATE ROW MAPPERS
   * ---------------------------------------------------- */

  private mapSubscriber(row: any): Subscriber {
    return {
      id: row.id,
      fullName: row.full_name || '',
      phone: row.phone || '',
      area: row.area || '',
      neighborhood: row.neighborhood || '',
      alley: row.alley || '',
      houseNumber: row.house_number || '',
      amperes: Number(row.amperes) || 1,
      lineType: row.line_type || 'عادي',
      lineStatus: row.line_status || 'نشط',
      notes: row.notes || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    };
  }

  private mapBilling(row: any): BillingRecord {
    return {
      id: row.id,
      subscriberId: row.subscriber_id,
      subscriberName: row.subscriber_name,
      phone: row.subscriber_phone,
      amperes: row.sub_amperes,
      month: Number(row.month),
      year: Number(row.year),
      pricePerAmpere: Number(row.price_per_ampere),
      totalDue: Number(row.total_due),
      totalPaid: Number(row.total_paid),
      remaining: Number(row.remaining),
      paymentDate: row.payment_date,
      status: row.status,
      notes: row.notes || '',
      createdAt: row.created_at,
    };
  }

  private mapExpense(row: any): Expense {
    return {
      id: row.id,
      expenseType: row.expense_type,
      fuelLiters: row.fuel_liters !== null ? Number(row.fuel_liters) : null,
      totalAmount: Number(row.total_amount),
      expenseDate: row.expense_date,
      notes: row.notes || '',
      createdAt: row.created_at,
    };
  }
}

// Singleton database instance
export const db = new DatabaseClient();
