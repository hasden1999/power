/**
 * src/db/database.ts
 * Main Thread Client Interface to SQLite WASM Web Worker
 * Thread-Safe, Asynchronous, Typed Database Client for Ampereji
 */

import type {
  Subscriber,
  AdminSubscriberView,
  BillingRecord,
  Expense,
  AppSettings,
  MonthlyReport,
  BillStatus,
  LineStatus,
  Tenant,
  TenantOnboardingInput,
  SaaSStats,
  TenantPlan,
  TenantStatus,
  AuthUser,
  AuthRole,
} from '../types/index.ts';
import { platform } from '../platform.ts';
import { roundIQD, normalizeAmperes } from '../utils/money.ts';
import { APP_CONFIG } from '../config/app-config.ts';
import { licenseManager } from '../license/license.ts';
import type { DecodedLicensePayload } from '../license/license.ts';

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
  private activeTenantIdCache: string | null = null;

  constructor() {}

  /**
   * Initialize worker and SQLite connection
   */
  public async init(): Promise<{ isOpfs: boolean; version: string }> {
    if (this.isInitialized && this.worker) {
      return { isOpfs: this.isOpfs, version: this.libVersion };
    }

    // A previous attempt may have timed out while its worker was still
    // booting; clean it up before starting a fresh one.
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
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

    const res = await this.send<{ isOpfs: boolean; version: string }>('INIT', { useOpfs }, 60000);
    this.isInitialized = true;
    this.isOpfs = res.isOpfs;
    this.libVersion = res.version;

    // Load initial modification count and active tenant pointer
    try {
      const settings = await this.getSettings();
      this.modificationCount = settings.modificationCount || 0;
      this.activeTenantIdCache = settings.activeTenantId || 'tenant-default';
    } catch (_) {}

    return res;
  }

  /**
   * Resolve the active tenant pointer, repair it when it points at a deleted
   * tenant, and mirror the tenant profile into the legacy settings table.
   */
  public async ensureActiveTenant(): Promise<Tenant | null> {
    const tenants = await this.getTenants();
    if (tenants.length === 0) return null;

    const settings = await this.getSettings();
    let active = tenants.find((t) => t.id === settings.activeTenantId) || null;

    if (!active) {
      active = tenants.find((t) => t.id === 'tenant-default') || tenants[0];
      this.activeTenantIdCache = active.id;
      await this.updateSettings({ activeTenantId: active.id });
    } else {
      this.activeTenantIdCache = active.id;
    }

    // Keep the generator profile (printed on receipts) aligned with the tenant.
    if (
      settings.generatorName !== active.name ||
      settings.ownerPhone !== active.phone ||
      settings.defaultAmperePrice !== active.defaultPrice ||
      settings.licenseKey !== (active.licenseKey || '')
    ) {
      await this.writeSettingsSilently({
        generator_name: active.name,
        owner_phone: active.phone,
        default_ampere_price: String(active.defaultPrice),
        license_key: active.licenseKey || '',
      });
    }

    return active;
  }

  private send<T = any>(type: string, payload?: any, timeoutMs: number = 30000): Promise<T> {
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
      }, timeoutMs);

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

  private tenantCondition(column: string = 'tenant_id'): string {
    return `(${column} = ? OR (? = 'tenant-default' AND (${column} IS NULL OR ${column} = '')))`;
  }

  private async resolveTenantId(tenantId?: string): Promise<string> {
    if (tenantId) return tenantId;
    if (this.activeTenantIdCache) return this.activeTenantIdCache;
    const settings = await this.getSettings();
    this.activeTenantIdCache = settings.activeTenantId || 'tenant-default';
    return this.activeTenantIdCache;
  }

  public async getSubscribers(
    search: string = '',
    statusFilter: string = 'الكل',
    tenantId?: string
  ): Promise<Subscriber[]> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    let sql = `SELECT * FROM subscribers WHERE ${this.tenantCondition('tenant_id')}`;
    const params: any[] = [activeTenantId, activeTenantId];

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

  public async getSubscriberById(id: string, tenantId?: string): Promise<Subscriber | null> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const row = await this.send<any>('GET_ONE', {
      sql: `SELECT * FROM subscribers WHERE id = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [id, activeTenantId, activeTenantId],
    });
    return row ? this.mapSubscriber(row) : null;
  }

  public async addSubscriber(
    sub: Omit<Subscriber, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const tenantId = await this.resolveTenantId(sub.tenantId);

    if (!sub.fullName || !sub.fullName.trim()) {
      throw new Error('اسم المشترك مطلوب');
    }

    await this.send('RUN', {
      sql: `INSERT INTO subscribers (id, full_name, phone, area, neighborhood, alley, house_number, amperes, line_type, line_status, notes, tenant_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        sub.fullName.trim(),
        (sub.phone || '').trim(),
        (sub.area || '').trim(),
        (sub.neighborhood || '').trim(),
        (sub.alley || '').trim(),
        (sub.houseNumber || '').trim(),
        normalizeAmperes(Number(sub.amperes)),
        sub.lineType || 'عادي',
        sub.lineStatus || 'نشط',
        (sub.notes || '').trim(),
        tenantId,
        now,
        now,
      ],
    });

    await this.notifyModification();
    return id;
  }

  public async updateSubscriber(
    id: string,
    updates: Partial<Subscriber>,
    tenantId?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getSubscriberById(id, tenantId);
    if (!existing) throw new Error('المشترك غير موجود أو لا ينتمي لهذه المولدة');

    const merged = { ...existing, ...updates, updatedAt: now };

    await this.send('RUN', {
      sql: `UPDATE subscribers SET
            full_name = ?, phone = ?, area = ?, neighborhood = ?, alley = ?, house_number = ?,
            amperes = ?, line_type = ?, line_status = ?, notes = ?, tenant_id = ?, updated_at = ?
            WHERE id = ?`,
      params: [
        (merged.fullName || '').trim(),
        (merged.phone || '').trim(),
        (merged.area || '').trim(),
        (merged.neighborhood || '').trim(),
        (merged.alley || '').trim(),
        (merged.houseNumber || '').trim(),
        normalizeAmperes(Number(merged.amperes)),
        merged.lineType || 'عادي',
        merged.lineStatus || 'نشط',
        (merged.notes || '').trim(),
        merged.tenantId || existing.tenantId || 'tenant-default',
        now,
        id,
      ],
    });

    await this.notifyModification();
  }

  public async updateSubscriberStatus(
    id: string,
    status: LineStatus,
    tenantId?: string
  ): Promise<void> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const now = new Date().toISOString();
    await this.send('RUN', {
      sql: `UPDATE subscribers SET line_status = ?, updated_at = ?
            WHERE id = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [status, now, id, activeTenantId, activeTenantId],
    });
    await this.notifyModification();
  }

  public async getAllPlatformSubscribers(
    search: string = '',
    statusFilter: string = 'الكل',
    tenantIdFilter: string = 'الكل'
  ): Promise<AdminSubscriberView[]> {
    let sql = `
      SELECT s.*, COALESCE(t.name, 'مولدة عامة') as tenant_name, COALESCE(t.owner_name, '') as tenant_owner
      FROM subscribers s
      LEFT JOIN tenants t ON (s.tenant_id = t.id OR (t.id = 'tenant-default' AND (s.tenant_id IS NULL OR s.tenant_id = '')))
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (s.full_name LIKE ? OR s.phone LIKE ? OR s.area LIKE ? OR s.neighborhood LIKE ? OR t.name LIKE ?)';
      params.push(q, q, q, q, q);
    }

    if (statusFilter !== 'الكل' && statusFilter) {
      sql += ' AND s.line_status = ?';
      params.push(statusFilter);
    }

    if (tenantIdFilter !== 'الكل' && tenantIdFilter) {
      sql += ` AND (${this.tenantCondition('s.tenant_id')})`;
      params.push(tenantIdFilter, tenantIdFilter);
    }

    sql += ' ORDER BY s.created_at DESC';

    const rows = await this.send<any[]>('GET_ALL', { sql, params });
    return rows.map((r) => ({
      ...this.mapSubscriber(r),
      tenantName: r.tenant_name,
      tenantOwner: r.tenant_owner,
    }));
  }

  public async deleteSubscriber(id: string, tenantId?: string): Promise<void> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    await this.send('RUN', {
      sql: `DELETE FROM subscribers WHERE id = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [id, activeTenantId, activeTenantId],
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
    statusFilter: string = 'الكل',
    tenantId?: string
  ): Promise<BillingRecord[]> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    let sql = `
      SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone, s.amperes as sub_amperes
      FROM billing b
      JOIN subscribers s ON b.subscriber_id = s.id
      WHERE b.year = ? AND b.month = ? AND ${this.tenantCondition('b.tenant_id')}
    `;
    const params: any[] = [year, month, activeTenantId, activeTenantId];

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

  public async getSubscriberBillingHistory(
    subscriberId: string,
    tenantId?: string
  ): Promise<BillingRecord[]> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const rows = await this.send<any[]>('GET_ALL', {
      sql: `SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone, s.amperes as sub_amperes
            FROM billing b
            JOIN subscribers s ON b.subscriber_id = s.id
            WHERE b.subscriber_id = ? AND ${this.tenantCondition('b.tenant_id')}
            ORDER BY b.year DESC, b.month DESC`,
      params: [subscriberId, activeTenantId, activeTenantId],
    });
    return rows.map((r) => this.mapBilling(r));
  }

  public async generateMonthlyBills(
    year: number,
    month: number,
    pricePerAmpere: number
  ): Promise<number> {
    const activeTenantId = await this.resolveTenantId();
    const subscribers = await this.getSubscribers('', 'نشط', activeTenantId);
    const unitPrice = roundIQD(Number(pricePerAmpere));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error('سعر الأمبير غير صالح');
    }

    let generatedCount = 0;

    for (const sub of subscribers) {
      const existing = await this.send<any>('GET_ONE', {
        sql: 'SELECT id FROM billing WHERE subscriber_id = ? AND month = ? AND year = ?',
        params: [sub.id, month, year],
      });

      if (!existing) {
        const id = crypto.randomUUID();
        const totalDue = roundIQD(sub.amperes * unitPrice);
        const now = new Date().toISOString();

        await this.send('RUN', {
          sql: `INSERT INTO billing (id, subscriber_id, month, year, price_per_ampere, total_due, total_paid, remaining, status, tenant_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'غير مسدد', ?, ?)`,
          params: [id, sub.id, month, year, unitPrice, totalDue, totalDue, activeTenantId, now],
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
    notes: string = '',
    tenantId?: string
  ): Promise<BillingRecord> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const bill = await this.send<any>('GET_ONE', {
      sql: `SELECT * FROM billing WHERE id = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [billId, activeTenantId, activeTenantId],
    });
    if (!bill) throw new Error('سجل الجباية غير موجود أو لا ينتمي لهذه المولدة');

    const amount = roundIQD(Number(paidAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('مبلغ الدفع غير صالح');
    }

    const totalDue = Number(bill.total_due);
    const currentPaid = Number(bill.total_paid);
    if (currentPaid >= totalDue) {
      throw new Error('هذا الواصل مسدد بالكامل مسبقاً');
    }
    if (currentPaid + amount > totalDue) {
      throw new Error(
        `المبلغ المدفوع يتجاوز المتبقي (${Math.max(0, totalDue - currentPaid).toLocaleString('ar-IQ')} د.ع)`
      );
    }

    const newTotalPaid = currentPaid + amount;
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
      sql: `SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone, s.amperes as sub_amperes
            FROM billing b JOIN subscribers s ON b.subscriber_id = s.id WHERE b.id = ?`,
      params: [billId],
    });
    return this.mapBilling(updated);
  }

  /** Total unpaid balance across every billing month for the active tenant. */
  public async getOutstandingDebt(tenantId?: string): Promise<number> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const row = await this.send<any>('GET_ONE', {
      sql: `SELECT COALESCE(SUM(remaining), 0) as total
            FROM billing
            WHERE remaining > 0 AND ${this.tenantCondition('tenant_id')}`,
      params: [activeTenantId, activeTenantId],
    });
    return Number(row?.total) || 0;
  }

  /** Every unpaid bill (all months) for the active tenant, oldest first. */
  public async getOutstandingBills(tenantId?: string): Promise<BillingRecord[]> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    const rows = await this.send<any[]>('GET_ALL', {
      sql: `SELECT b.*, s.full_name as subscriber_name, s.phone as subscriber_phone, s.amperes as sub_amperes
            FROM billing b
            JOIN subscribers s ON b.subscriber_id = s.id
            WHERE b.remaining > 0 AND ${this.tenantCondition('b.tenant_id')}
            ORDER BY b.year ASC, b.month ASC, s.full_name COLLATE NOCASE ASC`,
      params: [activeTenantId, activeTenantId],
    });
    return rows.map((r) => this.mapBilling(r));
  }

  /* ----------------------------------------------------
   * EXPENSES & FUEL
   * ---------------------------------------------------- */

  public async getExpenses(month?: number, year?: number, tenantId?: string): Promise<Expense[]> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    let sql = `SELECT * FROM expenses WHERE ${this.tenantCondition('tenant_id')}`;
    const params: any[] = [activeTenantId, activeTenantId];

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
    const activeTenantId = await this.resolveTenantId(expense.tenantId);
    const amount = roundIQD(Number(expense.totalAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('مبلغ المصروف غير صالح');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.send('RUN', {
      sql: `INSERT INTO expenses (id, expense_type, fuel_liters, total_amount, expense_date, notes, tenant_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        expense.expenseType,
        expense.fuelLiters ? Number(expense.fuelLiters) : null,
        amount,
        expense.expenseDate || now.split('T')[0],
        (expense.notes || '').trim(),
        activeTenantId,
        now,
      ],
    });

    await this.notifyModification();
    return id;
  }

  public async deleteExpense(id: string, tenantId?: string): Promise<void> {
    const activeTenantId = await this.resolveTenantId(tenantId);
    await this.send('RUN', {
      sql: `DELETE FROM expenses WHERE id = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [id, activeTenantId, activeTenantId],
    });
    await this.notifyModification();
  }

  /* ----------------------------------------------------
   * REPORTS & STATS
   * ---------------------------------------------------- */

  public async getMonthlyReport(year: number, month: number, tenantId?: string): Promise<MonthlyReport> {
    const activeTenantId = await this.resolveTenantId(tenantId);

    // Subscriber statistics
    const subsStat = await this.send<any>('GET_ONE', {
      sql: `SELECT
              COUNT(*) as total_subs,
              SUM(CASE WHEN line_status = 'نشط' THEN 1 ELSE 0 END) as active_subs,
              SUM(CASE WHEN line_status = 'نشط' THEN amperes ELSE 0 END) as total_amps
            FROM subscribers
            WHERE ${this.tenantCondition('tenant_id')}`,
      params: [activeTenantId, activeTenantId],
    });

    // Billing statistics for the given month
    const billingStat = await this.send<any>('GET_ONE', {
      sql: `SELECT
              COALESCE(SUM(total_due), 0) as total_due,
              COALESCE(SUM(total_paid), 0) as total_collected,
              COALESCE(SUM(remaining), 0) as total_debt
            FROM billing
            WHERE year = ? AND month = ? AND ${this.tenantCondition('tenant_id')}`,
      params: [year, month, activeTenantId, activeTenantId],
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
            WHERE expense_date LIKE ? AND ${this.tenantCondition('tenant_id')}`,
      params: [datePrefix, activeTenantId, activeTenantId],
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
      activeTenantId: map.active_tenant_id || 'tenant-default',
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
      activeTenantId: 'active_tenant_id',
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

    if (updates.activeTenantId) {
      this.activeTenantIdCache = updates.activeTenantId;
    }

    await this.notifyModification();
  }

  /** Write system settings without counting them as user data mutations. */
  private async writeSettingsSilently(values: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await this.send('RUN', {
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        params: [key, value],
      });
    }
  }

  /* ----------------------------------------------------
   * EXPORT, IMPORT, INTEGRITY & STORAGE
   * ---------------------------------------------------- */

  public async exportDatabaseBinary(): Promise<Uint8Array> {
    return this.send<Uint8Array>('EXPORT');
  }

  /** Mark that the user saved a file outside the device (not internal snapshots). */
  public async markExternalExport(): Promise<void> {
    await this.writeSettingsSilently({ last_external_export: new Date().toISOString() });
  }

  /** Record an internal OPFS snapshot without inflating the mutation counter. */
  public async markInternalBackup(): Promise<void> {
    await this.writeSettingsSilently({ last_backup: new Date().toISOString() });
  }

  public async importDatabaseBinary(bytes: Uint8Array): Promise<boolean> {
    const success = await this.send<boolean>('IMPORT', { bytes });
    if (success) {
      this.activeTenantIdCache = null;
      try {
        const settings = await this.getSettings();
        this.modificationCount = settings.modificationCount || 0;
      } catch (_) {}
      window.dispatchEvent(new CustomEvent('ampereji:db-reloaded'));
    }
    return success;
  }

  public async checkIntegrity(): Promise<{ ok: boolean; details: string[] }> {
    return this.send('INTEGRITY_CHECK');
  }

  /** True when SQLite is backed by OPFS and survives a page reload. */
  public isUsingOpfs(): boolean {
    return this.isOpfs;
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
   * SAAS MULTI-TENANCY & GENERATOR ONBOARDING
   * ---------------------------------------------------- */

  public async getTenants(search: string = '', statusFilter: string = 'الكل'): Promise<Tenant[]> {
    let sql = `
      SELECT t.*, COUNT(s.id) as sub_count
      FROM tenants t
      LEFT JOIN subscribers s ON (s.tenant_id = t.id OR (t.id = 'tenant-default' AND (s.tenant_id IS NULL OR s.tenant_id = '' OR s.tenant_id = 'tenant-default')))
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (t.name LIKE ? OR t.owner_name LIKE ? OR t.phone LIKE ? OR t.address LIKE ?)';
      params.push(q, q, q, q);
    }

    if (statusFilter !== 'الكل' && statusFilter) {
      sql += ' AND t.status = ?';
      params.push(statusFilter);
    }

    sql += ' GROUP BY t.id ORDER BY t.created_at DESC';

    const rows = await this.send<any[]>('GET_ALL', { sql, params });
    return rows.map((r) => this.mapTenant(r));
  }

  public async getTenantById(id: string): Promise<Tenant | null> {
    const row = await this.send<any>('GET_ONE', {
      sql: `SELECT t.*, COUNT(s.id) as sub_count
            FROM tenants t
            LEFT JOIN subscribers s ON (s.tenant_id = t.id OR (t.id = 'tenant-default' AND (s.tenant_id IS NULL OR s.tenant_id = '')))
            WHERE t.id = ? GROUP BY t.id`,
      params: [id],
    });
    return row ? this.mapTenant(row) : null;
  }

  public async addTenant(input: TenantOnboardingInput): Promise<Tenant> {
    if (!input.name?.trim() || !input.ownerName?.trim()) {
      throw new Error('اسم المولدة واسم المالك مطلوبان');
    }
    if (!input.phone?.trim()) {
      throw new Error('رقم هاتف المالك مطلوب');
    }

    const duplicate = await this.send<any>('GET_ONE', {
      sql: 'SELECT id FROM tenants WHERE phone = ? LIMIT 1',
      params: [input.phone.trim()],
    });
    if (duplicate) {
      throw new Error('يوجد مولدة مسجلة بنفس رقم الهاتف مسبقاً');
    }

    const id = `tenant-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();
    const plan = input.plan || 'trial';
    if (!['trial', 'monthly', 'yearly'].includes(plan)) {
      throw new Error('خطة الاشتراك غير صالحة');
    }
    // Every newly onboarded generator owner starts with a 30-day trial.
    const expiresAt = new Date(now.getTime() + APP_CONFIG.plans.trial.days * 24 * 60 * 60 * 1000).toISOString();
    const planPrice = APP_CONFIG.plans[plan].price;
    const defaultPrice = roundIQD(input.defaultPrice || 12000);

    await this.send('RUN', {
      sql: `INSERT INTO tenants (id, name, owner_name, phone, address, plan, plan_price, status, expires_at, is_blocked, default_price, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'trial', ?, 0, ?, ?)`,
      params: [
        id,
        input.name.trim(),
        input.ownerName.trim(),
        input.phone.trim(),
        (input.address || '').trim(),
        plan,
        planPrice,
        expiresAt,
        defaultPrice,
        now.toISOString(),
      ],
    });

    await this.notifyModification();
    const created = await this.getTenantById(id);
    if (!created) throw new Error('فشل استرجاع بيانات المولدة المنشأة');
    return created;
  }

  public async updateTenant(id: string, updates: Partial<Tenant>): Promise<void> {
    const existing = await this.getTenantById(id);
    if (!existing) throw new Error('المولدة غير موجودة');

    const merged = { ...existing, ...updates };
    if (!merged.name?.trim() || !merged.ownerName?.trim()) {
      throw new Error('اسم المولدة واسم المالك مطلوبان');
    }

    const phone = (merged.phone || '').trim();
    if (phone) {
      const duplicate = await this.send<any>('GET_ONE', {
        sql: 'SELECT id FROM tenants WHERE phone = ? AND id <> ? LIMIT 1',
        params: [phone, id],
      });
      if (duplicate) {
        throw new Error('يوجد مولدة أخرى مسجلة بنفس رقم الهاتف');
      }
    }

    await this.send('RUN', {
      sql: `UPDATE tenants SET
            name = ?, owner_name = ?, phone = ?, address = ?, plan = ?, plan_price = ?,
            status = ?, expires_at = ?, is_blocked = ?, license_key = ?, default_price = ?
            WHERE id = ?`,
      params: [
        merged.name.trim(),
        merged.ownerName.trim(),
        phone,
        (merged.address || '').trim(),
        merged.plan,
        roundIQD(Number(merged.planPrice) || 0),
        merged.status,
        merged.expiresAt,
        merged.isBlocked ? 1 : 0,
        merged.licenseKey || '',
        roundIQD(Number(merged.defaultPrice) || 12000),
        id,
      ],
    });

    await this.notifyModification();

    // Keep the live workspace in sync when the active tenant is edited.
    if (this.activeTenantIdCache === id) {
      await this.writeSettingsSilently({
        generator_name: merged.name.trim(),
        owner_phone: phone,
        default_ampere_price: String(roundIQD(Number(merged.defaultPrice) || 12000)),
        license_key: merged.licenseKey || '',
      });
    }
  }

  public async activateOrExtendTenant(id: string, days: number, plan: TenantPlan): Promise<void> {
    const tenant = await this.getTenantById(id);
    if (!tenant) throw new Error('المولدة غير موجودة');
    if (!Number.isFinite(days) || days <= 0 || days > 3660) {
      throw new Error('مدة التفعيل غير صالحة');
    }
    if (plan !== 'monthly' && plan !== 'yearly') {
      throw new Error('خطة الاشتراك غير صالحة');
    }

    let currentExp = new Date(tenant.expiresAt).getTime();
    if (isNaN(currentExp) || currentExp < Date.now()) {
      currentExp = Date.now();
    }
    const newExpiresAt = new Date(currentExp + days * 24 * 60 * 60 * 1000).toISOString();
    const planPrice = APP_CONFIG.plans[plan].price;

    await this.send('RUN', {
      sql: `UPDATE tenants SET
            status = 'active', plan = ?, plan_price = ?, expires_at = ?, is_blocked = 0
            WHERE id = ?`,
      params: [plan, planPrice, newExpiresAt, id],
    });

    await this.notifyModification();
  }

  public async toggleTenantBlock(id: string): Promise<boolean> {
    const tenant = await this.getTenantById(id);
    if (!tenant) throw new Error('المولدة غير موجودة');

    const newBlocked = !tenant.isBlocked;
    let newStatus: TenantStatus = newBlocked ? 'blocked' : 'active';

    if (!newBlocked) {
      const expires = new Date(tenant.expiresAt).getTime();
      if (isNaN(expires) || expires <= Date.now()) {
        newStatus = 'expired';
      } else if (tenant.plan === 'trial') {
        newStatus = 'trial';
      }
    }

    await this.send('RUN', {
      sql: 'UPDATE tenants SET is_blocked = ?, status = ? WHERE id = ?',
      params: [newBlocked ? 1 : 0, newStatus, id],
    });

    await this.notifyModification();
    return newBlocked;
  }

  /**
   * Delete a tenant and every row that belongs to it. The local default
   * workspace cannot be deleted because the app always needs an active tenant.
   */
  public async deleteTenant(id: string): Promise<void> {
    if (id === 'tenant-default') {
      throw new Error('لا يمكن حذف المولدة الافتراضية للجهاز');
    }
    const tenant = await this.getTenantById(id);
    if (!tenant) throw new Error('المولدة غير موجودة');

    await this.send('RUN', { sql: 'DELETE FROM billing WHERE tenant_id = ?', params: [id] });
    await this.send('RUN', { sql: 'DELETE FROM expenses WHERE tenant_id = ?', params: [id] });
    await this.send('RUN', { sql: 'DELETE FROM subscribers WHERE tenant_id = ?', params: [id] });
    await this.send('RUN', { sql: 'DELETE FROM auth_users WHERE tenant_id = ?', params: [id] });
    await this.send('RUN', { sql: 'DELETE FROM tenants WHERE id = ?', params: [id] });

    // Compare against the resolved pointer too: the cache can be cold when the
    // cockpit deletes a tenant immediately after startup.
    const activeId = await this.resolveTenantId();
    if (activeId === id) {
      await this.setCurrentTenant('tenant-default');
    }

    await this.notifyModification();
  }

  /**
   * Synchronise stored subscription status with the real expiry date.
   * This keeps dashboards and filters accurate even if the app was closed
   * for weeks while a trial/subscription expired.
   */
  public async reconcileTenantStatuses(): Promise<void> {
    const tenants = await this.getTenants();
    const now = Date.now();

    for (const tenant of tenants) {
      if (tenant.isBlocked || tenant.status === 'pending') continue;
      const expires = new Date(tenant.expiresAt).getTime();
      if (!Number.isNaN(expires) && expires <= now && tenant.status !== 'expired') {
        await this.send('RUN', {
          sql: "UPDATE tenants SET status = 'expired' WHERE id = ?",
          params: [tenant.id],
        });
      }
    }
  }

  public async getSaaSStats(): Promise<SaaSStats> {
    await this.reconcileTenantStatuses();
    const tenants = await this.getTenants();
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => t.status === 'active' && !t.isBlocked).length;
    const trialTenants = tenants.filter((t) => t.status === 'trial' && !t.isBlocked).length;
    const expiredTenants = tenants.filter((t) => t.status === 'expired' && !t.isBlocked).length;
    const blockedTenants = tenants.filter((t) => t.isBlocked).length;
    const totalSubscribers = tenants.reduce((sum, t) => sum + (t.subscribersCount || 0), 0);
    // Normalise every active plan to an expected monthly revenue.
    const estimatedRevenue = tenants
      .filter((t) => t.status === 'active' && !t.isBlocked)
      .reduce((sum, t) => {
        const price = Number(t.planPrice) || APP_CONFIG.plans.monthly.price;
        return sum + (t.plan === 'yearly' ? Math.round(price / 12) : price);
      }, 0);

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      expiredTenants,
      blockedTenants,
      totalSubscribers,
      estimatedRevenue,
    };
  }

  public async getCurrentTenantId(): Promise<string> {
    return this.resolveTenantId();
  }

  public async getCurrentTenant(): Promise<Tenant | null> {
    const id = await this.resolveTenantId();
    return this.getTenantById(id);
  }

  public async setCurrentTenant(tenantId: string): Promise<void> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) throw new Error('المولدة غير موجودة');

    this.activeTenantIdCache = tenant.id;
    await this.updateSettings({
      activeTenantId: tenant.id,
      generatorName: tenant.name,
      ownerPhone: tenant.phone,
      defaultAmperePrice: tenant.defaultPrice,
      licenseKey: tenant.licenseKey || '',
    });
    window.dispatchEvent(new CustomEvent('ampereji:tenant-changed', { detail: tenant }));
  }

  /**
   * Verify a signed license code and persist its payload to a tenant.
   *
   * Verification happens here (not only in the UI) so that a future caller
   * cannot bypass the signature check by passing a fabricated expiry date.
   * The private key never ships with the application.
   */
  public async applyLicenseToTenant(
    tenantId: string,
    licenseKey: string
  ): Promise<DecodedLicensePayload> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) throw new Error('المولدة غير موجودة');

    const code = (licenseKey || '').trim();
    if (!code) throw new Error('كود الترخيص مطلوب');

    const verification = await licenseManager.verifyLicense(code);
    if (!verification.isValid || !verification.payload) {
      throw new Error(verification.error || 'كود الترخيص غير صالح');
    }
    if (verification.payload.system !== 'ampereji') {
      throw new Error('هذا الكود لا يخص منظومة أمبيرجي');
    }

    const payload = verification.payload;
    const plan: TenantPlan = payload.licenseType === 'monthly' ? 'monthly' : 'yearly';
    const parsedExpiry = payload.expiresAt ? new Date(payload.expiresAt).getTime() : NaN;
    const resolvedExpiry = Number.isFinite(parsedExpiry)
      ? new Date(parsedExpiry).toISOString()
      : new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString();

    await this.updateTenant(tenantId, {
      licenseKey: code,
      status: 'active',
      isBlocked: false,
      plan,
      planPrice: APP_CONFIG.plans[plan].price,
      expiresAt: resolvedExpiry,
    });

    return payload;
  }

  /** Update the generator profile of the current tenant from Settings. */
  public async updateCurrentTenantProfile(updates: {
    generatorName?: string;
    ownerPhone?: string;
    defaultAmperePrice?: number;
    currency?: string;
  }): Promise<void> {
    const activeId = await this.resolveTenantId();
    const patch: Partial<Tenant> = {};
    if (updates.generatorName !== undefined) patch.name = updates.generatorName;
    if (updates.ownerPhone !== undefined) patch.phone = updates.ownerPhone;
    if (updates.defaultAmperePrice !== undefined) patch.defaultPrice = updates.defaultAmperePrice;

    if (Object.keys(patch).length > 0) {
      await this.updateTenant(activeId, patch);
    }

    await this.updateSettings({
      generatorName: updates.generatorName,
      ownerPhone: updates.ownerPhone,
      defaultAmperePrice: updates.defaultAmperePrice,
      currency: updates.currency,
    });
  }

  /* ----------------------------------------------------
   * AUTHENTICATION USERS (Super Admin & future owner accounts)
   * ---------------------------------------------------- */

  public async getAuthUserByUsername(username: string): Promise<(AuthUser & { passwordHash: string; salt: string }) | null> {
    const row = await this.send<any>('GET_ONE', {
      sql: 'SELECT * FROM auth_users WHERE username = ? COLLATE NOCASE LIMIT 1',
      params: [username.trim()],
    });
    if (!row) return null;
    return {
      ...this.mapAuthUser(row),
      passwordHash: row.password_hash,
      salt: row.salt,
    };
  }

  public async countAuthUsers(role?: AuthRole): Promise<number> {
    const row = await this.send<any>('GET_ONE', {
      sql: role ? 'SELECT COUNT(*) as count FROM auth_users WHERE role = ?' : 'SELECT COUNT(*) as count FROM auth_users',
      params: role ? [role] : [],
    });
    return Number(row?.count) || 0;
  }

  public async createAuthUser(input: {
    username: string;
    passwordHash: string;
    salt: string;
    role: AuthRole;
    tenantId?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.send('RUN', {
      sql: `INSERT INTO auth_users (id, username, password_hash, salt, role, tenant_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      params: [
        id,
        input.username.trim(),
        input.passwordHash,
        input.salt,
        input.role,
        input.tenantId || null,
        now,
        now,
      ],
    });
    await this.notifyModification();
    return id;
  }

  public async updateAuthUserPassword(id: string, passwordHash: string, salt: string): Promise<void> {
    await this.send('RUN', {
      sql: 'UPDATE auth_users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?',
      params: [passwordHash, salt, new Date().toISOString(), id],
    });
    await this.notifyModification();
  }

  public async touchAuthUserLogin(id: string): Promise<void> {
    await this.send('RUN', {
      sql: 'UPDATE auth_users SET last_login = ? WHERE id = ?',
      params: [new Date().toISOString(), id],
    });
  }

  private mapAuthUser(row: any): AuthUser {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      tenantId: row.tenant_id || null,
      isActive: Boolean(row.is_active),
      lastLogin: row.last_login || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    };
  }

  /* ----------------------------------------------------
   * PRIVATE ROW MAPPERS
   * ---------------------------------------------------- */

  private mapTenant(row: any): Tenant {
    return {
      id: row.id,
      name: row.name || 'مولدة بدون اسم',
      ownerName: row.owner_name || '',
      phone: row.phone || '',
      address: row.address || '',
      plan: row.plan || 'trial',
      planPrice: Number(row.plan_price) || 0,
      status: row.status || 'trial',
      expiresAt: row.expires_at || '',
      isBlocked: Boolean(row.is_blocked),
      licenseKey: row.license_key || '',
      defaultPrice: Number(row.default_price) || 12000,
      subscribersCount: Number(row.sub_count) || 0,
      createdAt: row.created_at || '',
    };
  }

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
      tenantId: row.tenant_id || 'tenant-default',
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
      tenantId: row.tenant_id || 'tenant-default',
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
      tenantId: row.tenant_id || 'tenant-default',
      createdAt: row.created_at,
    };
  }
}

// Singleton database instance
export const db = new DatabaseClient();
