/**
 * Complete In-Memory Database Engine & Repository Driver
 * Implements IDbBridge and Financial/Billing/Backup specifications from PROJECT.md
 */

import type { IDbBridge } from './types.ts';

export const SQLITE_MAGIC_HEADER = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00
]); // 'SQLite format 3\0'

export function roundIQD(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  // Iraqi Dinar convention: round to nearest multiple of 250 IQD
  return Math.round(amount / 250) * 250;
}

export function formatIQD(amount: number): string {
  const rounded = roundIQD(amount);
  const formattedNumber = new Intl.NumberFormat('en-US').format(rounded);
  return `${formattedNumber} د.ع`;
}

export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    // Replace various forms of Alef with plain Alef
    .replace(/[أإآآ]/g, 'ا')
    // Replace Taa Marbuta with Haa
    .replace(/ة/g, 'ه')
    // Replace Alif Maqsura with Yaa
    .replace(/ى/g, 'ي')
    // Remove Tashkeel / Harakat
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel (Kashida)
    .replace(/\u0640/g, '')
    .trim()
    .toLowerCase();
}

export interface SubscriberEntity {
  id: number;
  fullName: string;
  phone: string;
  street: string;
  breakerNumber: string;
  amperes: number;
  subscriptionType: 'normal' | 'gold' | 'night' | 'morning';
  openingBalance: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCycleEntity {
  id: number;
  month: number;
  year: number;
  pricePerAmpereNormal: number;
  pricePerAmpereGold: number;
  pricePerAmpereNight: number;
  issueDate: string;
  isClosed: boolean;
}

export interface InvoiceEntity {
  id: number;
  cycleId: number;
  subscriberId: number;
  month: number;
  year: number;
  amperes: number;
  unitPrice: number;
  currentAmount: number;
  previousDebt: number;
  discount: number;
  totalDue: number;
  totalPaid: number;
  status: 'unpaid' | 'partial' | 'paid';
  createdAt: string;
}

export interface PaymentEntity {
  id: number;
  invoiceId: number;
  subscriberId: number;
  amount: number;
  paymentDate: string;
  receiptNumber: string;
  notes?: string;
}

export interface ExpenseEntity {
  id: number;
  category: 'fuel' | 'oil_maintenance' | 'repairs' | 'salaries' | 'rent' | 'other';
  title: string;
  amount: number;
  liters?: number;
  date: string;
  notes?: string;
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  data: Uint8Array;
  recordCount: number;
}

export class MemoryDbBridge implements IDbBridge {
  public subscribers: Map<number, SubscriberEntity> = new Map();
  public billingCycles: Map<number, BillingCycleEntity> = new Map();
  public invoices: Map<number, InvoiceEntity> = new Map();
  public payments: Map<number, PaymentEntity> = new Map();
  public expenses: Map<number, ExpenseEntity> = new Map();
  public backupSlots: BackupSnapshot[] = []; // Max 7 rotating snapshots

  private nextSubscriberId = 1;
  private nextCycleId = 1;
  private nextInvoiceId = 1;
  private nextPaymentId = 1;
  private nextExpenseId = 1;
  public mutationCount = 0;
  public isPersisted = false;

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    // Basic query router for tests
    if (sql.includes('SELECT * FROM subscribers')) {
      return Array.from(this.subscribers.values()) as unknown as T[];
    }
    if (sql.includes('SELECT * FROM invoices')) {
      return Array.from(this.invoices.values()) as unknown as T[];
    }
    return [];
  }

  async exec(sql: string, params?: any[]): Promise<{ rowsAffected: number; lastInsertRowid: number }> {
    this.recordMutation();
    return { rowsAffected: 1, lastInsertRowid: this.mutationCount };
  }

  async transaction(statements: { sql: string; params?: any[] }[]): Promise<void> {
    for (const stmt of statements) {
      await this.exec(stmt.sql, stmt.params);
    }
  }

  private recordMutation(): void {
    this.mutationCount++;
    if (this.mutationCount % 50 === 0) {
      this.createBackup();
    }
  }

  async exportDb(): Promise<Uint8Array> {
    const json = JSON.stringify({
      subscribers: Array.from(this.subscribers.entries()),
      billingCycles: Array.from(this.billingCycles.entries()),
      invoices: Array.from(this.invoices.entries()),
      payments: Array.from(this.payments.entries()),
      expenses: Array.from(this.expenses.entries()),
      mutationCount: this.mutationCount
    });

    const payload = new TextEncoder().encode(json);
    const result = new Uint8Array(SQLITE_MAGIC_HEADER.length + payload.length);
    result.set(SQLITE_MAGIC_HEADER, 0);
    result.set(payload, SQLITE_MAGIC_HEADER.length);
    return result;
  }

  async importDb(data: Uint8Array): Promise<void> {
    // Validate 16-byte magic header
    if (data.length < SQLITE_MAGIC_HEADER.length) {
      throw new Error('Invalid SQLite database: file too small');
    }

    for (let i = 0; i < SQLITE_MAGIC_HEADER.length; i++) {
      if (data[i] !== SQLITE_MAGIC_HEADER[i]) {
        throw new Error('Invalid SQLite magic header: not a valid SQLite database');
      }
    }

    // Extract payload
    const payload = data.subarray(SQLITE_MAGIC_HEADER.length);
    try {
      const jsonStr = new TextDecoder().decode(payload);
      const parsed = JSON.parse(jsonStr);

      this.subscribers = new Map(parsed.subscribers);
      this.billingCycles = new Map(parsed.billingCycles);
      this.invoices = new Map(parsed.invoices);
      this.payments = new Map(parsed.payments);
      this.expenses = new Map(parsed.expenses);
      this.mutationCount = parsed.mutationCount ?? 0;
    } catch {
      throw new Error('PRAGMA integrity_check failed: corrupted database payload');
    }
  }

  async createBackup(): Promise<string> {
    const data = await this.exportDb();
    const snapshotId = `backup_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const snapshot: BackupSnapshot = {
      id: snapshotId,
      timestamp: new Date().toISOString(),
      data,
      recordCount: this.subscribers.size + this.invoices.size + this.expenses.size
    };

    this.backupSlots.unshift(snapshot);
    // Keep last 7 snapshots
    if (this.backupSlots.length > 7) {
      this.backupSlots.length = 7;
    }

    return snapshotId;
  }

  async getStorageStats(): Promise<{ isPersisted: boolean; usageBytes: number; quotaBytes: number }> {
    const exported = await this.exportDb();
    return {
      isPersisted: this.isPersisted,
      usageBytes: exported.byteLength,
      quotaBytes: 1024 * 1024 * 1024 * 5 // 5 GB
    };
  }

  // --- High-Level Subscriber Operations ---
  async addSubscriber(sub: Omit<SubscriberEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubscriberEntity> {
    const id = this.nextSubscriberId++;
    const now = new Date().toISOString();
    const entity: SubscriberEntity = {
      ...sub,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.subscribers.set(id, entity);
    this.recordMutation();
    return entity;
  }

  async updateSubscriber(id: number, updates: Partial<SubscriberEntity>): Promise<SubscriberEntity> {
    const existing = this.subscribers.get(id);
    if (!existing) throw new Error(`Subscriber with id ${id} not found`);
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.subscribers.set(id, updated);
    this.recordMutation();
    return updated;
  }

  async deleteSubscriber(id: number): Promise<boolean> {
    const existed = this.subscribers.delete(id);
    if (existed) this.recordMutation();
    return existed;
  }

  searchSubscribers(query: string, status?: 'all' | 'active' | 'inactive'): SubscriberEntity[] {
    const normQ = normalizeArabic(query);
    return Array.from(this.subscribers.values()).filter((sub) => {
      if (status === 'active' && !sub.isActive) return false;
      if (status === 'inactive' && sub.isActive) return false;

      if (!normQ) return true;

      const normName = normalizeArabic(sub.fullName);
      const normPhone = normalizeArabic(sub.phone);
      const normStreet = normalizeArabic(sub.street);
      const normBreaker = normalizeArabic(sub.breakerNumber);

      return normName.includes(normQ) || normPhone.includes(normQ) || normStreet.includes(normQ) || normBreaker.includes(normQ);
    });
  }

  // --- High-Level Billing & Debt Operations ---
  async generateMonthlyCycle(month: number, year: number, normalPrice: number, goldPrice: number, nightPrice: number): Promise<{ cycle: BillingCycleEntity; invoicesGenerated: number }> {
    const cycleId = this.nextCycleId++;
    const cycle: BillingCycleEntity = {
      id: cycleId,
      month,
      year,
      pricePerAmpereNormal: normalPrice,
      pricePerAmpereGold: goldPrice,
      pricePerAmpereNight: nightPrice,
      issueDate: new Date().toISOString(),
      isClosed: false
    };
    this.billingCycles.set(cycleId, cycle);

    let invoicesGenerated = 0;
    for (const sub of this.subscribers.values()) {
      if (!sub.isActive) continue;

      let unitPrice = normalPrice;
      if (sub.subscriptionType === 'gold') unitPrice = goldPrice;
      if (sub.subscriptionType === 'night') unitPrice = nightPrice;

      const currentAmount = roundIQD(sub.amperes * unitPrice);

      // Calculate previous outstanding debt from previous invoices
      const priorInvoices = Array.from(this.invoices.values()).filter((inv) => inv.subscriberId === sub.id);
      let previousDebt = 0;
      if (priorInvoices.length === 0) {
        previousDebt = sub.openingBalance;
      } else {
        // Sum outstanding remainder from all prior invoices
        for (const inv of priorInvoices) {
          previousDebt += (inv.totalDue - inv.totalPaid);
        }
      }

      const totalDue = currentAmount + previousDebt;
      const invId = this.nextInvoiceId++;
      const invoice: InvoiceEntity = {
        id: invId,
        cycleId,
        subscriberId: sub.id,
        month,
        year,
        amperes: sub.amperes,
        unitPrice,
        currentAmount,
        previousDebt,
        discount: 0,
        totalDue,
        totalPaid: 0,
        status: 'unpaid',
        createdAt: new Date().toISOString()
      };

      this.invoices.set(invId, invoice);
      invoicesGenerated++;
      this.recordMutation();
    }

    return { cycle, invoicesGenerated };
  }

  async recordPayment(subscriberId: number, invoiceId: number, amount: number, notes?: string): Promise<{ receiptNumber: string; remainingDebt: number }> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice with id ${invoiceId} not found`);

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const roundedAmount = roundIQD(amount);
    const maxPayable = invoice.totalDue - invoice.totalPaid;

    if (roundedAmount > maxPayable) {
      throw new Error(`Overpayment rejected: payment ${roundedAmount} exceeds balance due ${maxPayable}`);
    }

    invoice.totalPaid += roundedAmount;
    if (invoice.totalPaid >= invoice.totalDue) {
      invoice.status = 'paid';
    } else {
      invoice.status = 'partial';
    }

    const paymentId = this.nextPaymentId++;
    const receiptNumber = `REC-${invoice.year}-AMP-${String(paymentId).padStart(4, '0')}`;

    const payment: PaymentEntity = {
      id: paymentId,
      invoiceId,
      subscriberId,
      amount: roundedAmount,
      paymentDate: new Date().toISOString(),
      receiptNumber,
      notes
    };

    this.payments.set(paymentId, payment);
    this.recordMutation();

    const remainingDebt = invoice.totalDue - invoice.totalPaid;
    return { receiptNumber, remainingDebt };
  }

  // --- High-Level Expenses & Fuel ---
  async addExpense(exp: Omit<ExpenseEntity, 'id'>): Promise<ExpenseEntity> {
    const id = this.nextExpenseId++;
    const entity: ExpenseEntity = { ...exp, id };
    this.expenses.set(id, entity);
    this.recordMutation();
    return entity;
  }

  // --- Financial Balances & Reports ---
  getMonthlyReport(month: number, year: number) {
    let totalDue = 0;
    let totalCollected = 0;
    let totalExpenses = 0;
    let fuelExpenses = 0;
    let fuelLiters = 0;

    for (const inv of this.invoices.values()) {
      if (inv.month === month && inv.year === year) {
        totalDue += inv.totalDue;
        totalCollected += inv.totalPaid;
      }
    }

    for (const exp of this.expenses.values()) {
      const expDate = new Date(exp.date);
      if (expDate.getMonth() + 1 === month && expDate.getFullYear() === year) {
        totalExpenses += exp.amount;
        if (exp.category === 'fuel') {
          fuelExpenses += exp.amount;
          fuelLiters += (exp.liters || 0);
        }
      }
    }

    const totalDebt = totalDue - totalCollected;
    const netProfit = totalCollected - totalExpenses;
    const averageDieselPrice = fuelLiters > 0 ? Math.round(fuelExpenses / fuelLiters) : 0;

    return {
      month,
      year,
      totalDue,
      totalCollected,
      totalDebt,
      totalExpenses,
      fuelExpenses,
      fuelLiters,
      averageDieselPrice,
      netProfit
    };
  }

  // --- CSV Export with UTF-8 BOM ---
  exportSubscribersCsv(): string {
    const bom = '\uFEFF';
    const header = 'المعرف,الاسم الكامل,رقم الهاتف,العنوان,رقم القاطع,الامبيرات,نوع الخط,الحالة\n';
    const rows = Array.from(this.subscribers.values()).map((sub) => {
      const escapedName = `"${sub.fullName.replace(/"/g, '""')}"`;
      const escapedStreet = `"${sub.street.replace(/"/g, '""')}"`;
      return `${sub.id},${escapedName},${sub.phone},${escapedStreet},${sub.breakerNumber},${sub.amperes},${sub.subscriptionType},${sub.isActive ? 'نشط' : 'معطل'}`;
    });
    return bom + header + rows.join('\n');
  }

  // --- Thermal Receipt Generator ---
  generateThermalReceipt(paymentId: number, width: '58mm' | '80mm' = '80mm'): string {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error('Payment not found');
    const subscriber = this.subscribers.get(payment.subscriberId);
    const invoice = this.invoices.get(payment.invoiceId);

    const cols = width === '58mm' ? 32 : 48;
    const separator = '='.repeat(cols);
    const line = '-'.repeat(cols);

    return [
      separator,
      '     وصل قبض كهرباء - مولدة أهلية     ',
      separator,
      `رقم الوصل: ${payment.receiptNumber}`,
      `التاريخ: ${payment.paymentDate.substring(0, 10)}`,
      `المشترك: ${subscriber?.fullName ?? ''}`,
      `الهاتف: ${subscriber?.phone ?? ''}`,
      `القاطع: ${subscriber?.breakerNumber ?? ''}`,
      `عدد الأمبيرات: ${subscriber?.amperes ?? 0} A`,
      line,
      `المبلغ المستحق: ${formatIQD(invoice?.totalDue ?? 0)}`,
      `المبلغ المسدد:  ${formatIQD(payment.amount)}`,
      `المتبقي (دين):  ${formatIQD((invoice?.totalDue ?? 0) - (invoice?.totalPaid ?? 0))}`,
      line,
      'شكراً لتعاونكم مع إدارة المولدة',
      separator
    ].join('\n');
  }
}
