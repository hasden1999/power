import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { supabase } from './supabaseClient';
import type { Subscriber, BillingCycle, Invoice, Payment, TenantSettings, UserAccount, Expense } from '../types';

export interface SyncStatusInfo {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: string | null;
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

// دالات التحويل بين أسماء الأعمدة في قاعدة البيانات (snake_case) ونماذج التطبيق (camelCase)

function tenantToDb(t: TenantSettings) {
  return {
    id: t.id,
    generator_name: t.generatorName,
    owner_name: t.ownerName,
    phone: t.phone || '',
    address: t.address || '',
    plan: t.plan || 'trial',
    plan_price: t.planPrice || 0,
    subscription_status: t.subscriptionStatus || 'active',
    is_blocked: Boolean(t.isBlocked),
    expires_at: t.expiresAt,
    auto_send_whatsapp: Boolean(t.autoSendWhatsapp),
    default_price_normal: t.defaultPriceNormal || 0,
    default_price_gold: t.defaultPriceGold || 0,
    created_at: t.createdAt,
  };
}

function dbToTenant(r: any): TenantSettings {
  return {
    id: r.id,
    generatorName: r.generator_name,
    ownerName: r.owner_name,
    phone: r.phone || '',
    address: r.address || '',
    plan: r.plan || 'monthly',
    planPrice: Number(r.plan_price) || 0,
    subscriptionStatus: r.subscription_status || 'active',
    isBlocked: Boolean(r.is_blocked),
    expiresAt: r.expires_at,
    autoSendWhatsapp: Boolean(r.auto_send_whatsapp),
    defaultPriceNormal: Number(r.default_price_normal) || 0,
    defaultPriceGold: Number(r.default_price_gold) || 0,
    createdAt: r.created_at,
  };
}

function userToDb(u: UserAccount) {
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    full_name: u.fullName,
    role: u.role,
    tenant_id: u.tenantId || null,
    created_at: u.createdAt,
  };
}

function dbToUser(r: any): UserAccount {
  return {
    id: r.id,
    username: r.username,
    password: r.password,
    fullName: r.full_name,
    role: r.role,
    tenantId: r.tenant_id || undefined,
    createdAt: r.created_at,
  };
}

function subscriberToDb(s: Subscriber) {
  return {
    id: s.id,
    tenant_id: s.tenantId,
    full_name: s.fullName,
    phone: s.phone || '',
    street: s.street || '',
    breaker_number: s.breakerNumber || '',
    amperes: s.amperes || 0,
    subscription_type: s.subscriptionType || 'normal',
    fixed_price: s.fixedPrice ?? null,
    opening_balance: s.openingBalance || 0,
    is_active: s.isActive ?? true,
    notes: s.notes || null,
    created_at: s.createdAt,
    updated_at: s.updatedAt || s.createdAt,
  };
}

function dbToSubscriber(r: any): Subscriber {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    fullName: r.full_name,
    phone: r.phone || '',
    street: r.street || '',
    breakerNumber: r.breaker_number || '',
    amperes: Number(r.amperes) || 0,
    subscriptionType: r.subscription_type || 'normal',
    fixedPrice: r.fixed_price != null ? Number(r.fixed_price) : undefined,
    openingBalance: Number(r.opening_balance) || 0,
    isActive: Boolean(r.is_active),
    notes: r.notes || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

function cycleToDb(c: BillingCycle) {
  return {
    id: c.id,
    tenant_id: c.tenantId,
    month: c.month,
    year: c.year,
    price_per_ampere_normal: c.pricePerAmpereNormal || 0,
    price_per_ampere_gold: c.pricePerAmpereGold || 0,
    price_per_ampere_night: c.pricePerAmpereNight || 0,
    issue_date: c.issueDate,
    notes: c.notes || null,
    is_closed: Boolean(c.isClosed),
    created_at: c.createdAt,
  };
}

function dbToCycle(r: any): BillingCycle {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    month: r.month,
    year: r.year,
    pricePerAmpereNormal: Number(r.price_per_ampere_normal) || 0,
    pricePerAmpereGold: Number(r.price_per_ampere_gold) || 0,
    pricePerAmpereNight: Number(r.price_per_ampere_night) || 0,
    issueDate: r.issue_date,
    notes: r.notes || undefined,
    isClosed: Boolean(r.is_closed),
    createdAt: r.created_at,
  };
}

function invoiceToDb(inv: Invoice) {
  return {
    id: inv.id,
    tenant_id: inv.tenantId,
    cycle_id: inv.cycleId || null,
    subscriber_id: inv.subscriberId,
    month: inv.month,
    year: inv.year,
    amperes: inv.amperes,
    unit_price: inv.unitPrice,
    current_amount: inv.currentAmount,
    previous_debt: inv.previousDebt || 0,
    discount: inv.discount || 0,
    total_due: inv.totalDue,
    total_paid: inv.totalPaid || 0,
    status: inv.status,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt || inv.createdAt,
  };
}

function dbToInvoice(r: any): Invoice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    cycleId: r.cycle_id || '',
    subscriberId: r.subscriber_id,
    month: r.month,
    year: r.year,
    amperes: Number(r.amperes) || 0,
    unitPrice: Number(r.unit_price) || 0,
    currentAmount: Number(r.current_amount) || 0,
    previousDebt: Number(r.previous_debt) || 0,
    discount: Number(r.discount) || 0,
    totalDue: Number(r.total_due) || 0,
    totalPaid: Number(r.total_paid) || 0,
    status: r.status || 'unpaid',
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
}

function paymentToDb(p: Payment) {
  return {
    id: p.id,
    tenant_id: p.tenantId,
    invoice_id: p.invoiceId || null,
    subscriber_id: p.subscriberId,
    amount: p.amount,
    payment_date: p.paymentDate,
    collector_name: p.collectorName,
    notes: p.notes || null,
    receipt_number: p.receiptNumber,
    sync_status: 'synced',
  };
}

function dbToPayment(r: any): Payment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    invoiceId: r.invoice_id || undefined,
    subscriberId: r.subscriber_id,
    amount: Number(r.amount) || 0,
    paymentDate: r.payment_date,
    collectorName: r.collector_name || '',
    notes: r.notes || undefined,
    receiptNumber: r.receipt_number || '',
    syncStatus: 'synced',
  };
}

function expenseToDb(e: Expense) {
  return {
    id: e.id,
    tenant_id: e.tenantId,
    category: e.category,
    title: e.title,
    amount: e.amount,
    liters: e.liters != null ? e.liters : null,
    date: e.date,
    notes: e.notes || null,
    created_by_name: e.createdByName || '',
    created_at: e.createdAt,
  };
}

function dbToExpense(r: any): Expense {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    category: r.category,
    title: r.title,
    amount: Number(r.amount) || 0,
    liters: r.liters != null ? Number(r.liters) : undefined,
    date: r.date,
    notes: r.notes || undefined,
    createdByName: r.created_by_name || '',
    createdAt: r.created_at,
  };
}

function getTableName(entity: string): string {
  switch (entity) {
    case 'subscribers':
      return 'subscribers';
    case 'invoices':
      return 'invoices';
    case 'payments':
      return 'payments';
    case 'cycles':
      return 'billing_cycles';
    case 'expenses':
      return 'expenses';
    case 'tenants':
      return 'tenants';
    case 'users':
      return 'users';
    case 'auditLogs':
      return 'audit_logs';
    case 'ledger':
      return 'ledger_entries';
    default:
      return entity;
  }
}

function mapEntityToDb(entity: string, payload: any): any {
  switch (entity) {
    case 'subscribers':
      return subscriberToDb(payload);
    case 'invoices':
      return invoiceToDb(payload);
    case 'payments':
      return paymentToDb(payload);
    case 'cycles':
      return cycleToDb(payload);
    case 'expenses':
      return expenseToDb(payload);
    case 'tenants':
      return tenantToDb(payload);
    case 'users':
      return userToDb(payload);
    case 'auditLogs':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        user_id: payload.userId,
        user_name: payload.userName,
        user_role: payload.userRole,
        action: payload.action,
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        details: payload.details,
        created_at: payload.createdAt,
      };
    case 'ledger':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        transaction_type: payload.transactionType,
        reference_id: payload.referenceId,
        subscriber_id: payload.subscriberId,
        account: payload.account,
        debit: payload.debit,
        credit: payload.credit,
        description: payload.description,
        created_at: payload.createdAt,
      };
    default:
      return payload;
  }
}

/**
 * فض النزاع للمشتركين (Subscriber Conflict Resolution):
 * - البيانات الشخصية والملاحظات: تأخذ الأحدث زمنياً (Last-Writer-Wins).
 * - الديون السابقة (openingBalance): الحفاظ على القيمة الأكبر لحماية حقوق المولدة.
 */
export function resolveSubscriberConflict(local: Subscriber, remote: Subscriber): Subscriber {
  const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
  const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();

  const isRemoteNewer = remoteTime > localTime;
  const base = isRemoteNewer ? remote : local;

  return {
    ...base,
    openingBalance: Math.max(local.openingBalance || 0, remote.openingBalance || 0),
    notes: isRemoteNewer ? remote.notes || local.notes : local.notes || remote.notes,
    version: Math.max(local.version || 1, remote.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * فض النزاع للفواتير (Invoice Conflict Resolution):
 * - الفاتورة لا تفقد أي تسديدات: يتم دمج المدفوعات وتجميعها مع المدفوعات المحلية.
 * - يتم مطابقة totalPaid مع مجموع السجلات في جدول payments لضمان سلامة الأرقام.
 */
export async function resolveInvoiceConflict(local: Invoice, remote: Invoice): Promise<Invoice> {
  const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
  const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
  const isRemoteNewer = remoteTime > localTime;

  const amperes = isRemoteNewer ? remote.amperes : local.amperes;
  const unitPrice = isRemoteNewer ? remote.unitPrice : local.unitPrice;
  const currentAmount = isRemoteNewer ? remote.currentAmount : local.currentAmount;
  const discount = isRemoteNewer ? remote.discount || 0 : local.discount || 0;
  const previousDebt = Math.max(local.previousDebt || 0, remote.previousDebt || 0);

  const totalDue = Math.max(0, currentAmount + previousDebt - discount);

  // احتساب المدفوع الفعلي استناداً لجدول الدفعات لضمان عدم ضياع أي دفعة جابي
  const invoicePayments = await db.payments.where('invoiceId').equals(local.id).toArray();
  const paymentsSum = invoicePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = Math.max(local.totalPaid || 0, remote.totalPaid || 0, paymentsSum);

  const status = totalPaid >= totalDue ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  return {
    id: local.id,
    tenantId: local.tenantId,
    cycleId: local.cycleId,
    subscriberId: local.subscriberId,
    month: local.month,
    year: local.year,
    amperes,
    unitPrice,
    currentAmount,
    previousDebt,
    discount,
    totalDue,
    totalPaid,
    status,
    version: Math.max(local.version || 1, remote.version || 1) + 1,
    createdAt: local.createdAt || remote.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * معالجة حقيقية لطابور المزامنة (Process Sync Queue Events)
 * ترفع التغييرات الحقيقية المعلقة فقط بدلاً من طمس الجداول بالرفع الشامل
 */
export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  if (!navigator.onLine) return { processed: 0, failed: 0 };

  const queueItems = await db.syncQueue.toArray();
  if (queueItems.length === 0) return { processed: 0, failed: 0 };

  // تجميع وإلغاء التكرار (Deduplication) لكل كيان لأخذ أحدث حالة
  const latestByEntity = new Map<string, (typeof queueItems)[0]>();
  for (const item of queueItems) {
    const key = `${item.entity}_${item.entityId}`;
    const existing = latestByEntity.get(key);
    if (!existing || new Date(item.createdAt) >= new Date(existing.createdAt)) {
      latestByEntity.set(key, item);
    }
  }

  const successIds: string[] = [];
  let processedCount = 0;
  let failedCount = 0;

  for (const [key, item] of latestByEntity.entries()) {
    try {
      const table = getTableName(item.entity);
      if (item.action === 'delete') {
        await supabase.from(table).delete().eq('id', item.entityId);
      } else {
        const payload = mapEntityToDb(item.entity, item.payload);
        if (payload) {
          const { error } = await supabase.from(table).upsert(payload);
          if (error) throw error;
        }
      }

      queueItems
        .filter((q) => `${q.entity}_${q.entityId}` === key)
        .forEach((q) => successIds.push(q.id));

      processedCount++;
    } catch (err) {
      console.warn(`تعذر مزامنة عنصر من الطابور (${item.entity}:${item.entityId}):`, err);
      failedCount++;
      await db.syncQueue.update(item.id, { attempts: (item.attempts || 0) + 1 });
    }
  }

  if (successIds.length > 0) {
    await db.syncQueue.bulkDelete(successIds);
  }

  return { processed: processedCount, failed: failedCount };
}

// المزامنة الحقيقية الشاملة والمحمية بمحرك فض النزاعات
export async function syncAllWithCloud(activeTenantId?: string): Promise<boolean> {
  if (!navigator.onLine) return false;

  try {
    // 1. معالجة طابور المزامنة الحقيقي (رفع الأحداث المعلقة)
    await processSyncQueue();

    // 2. إذا لم يكن هناك طابور: رفع الدفعات غير المتزامنة إن وجدت
    const pendingCount = await db.syncQueue.count();
    if (pendingCount === 0) {
      const pendingPayments = await db.payments.where('syncStatus').equals('pending').toArray();
      if (pendingPayments.length > 0) {
        await supabase.from('payments').upsert(pendingPayments.map(paymentToDb));
        for (const p of pendingPayments) {
          await db.payments.update(p.id, { syncStatus: 'synced' });
        }
      }
    }

    const lastSyncIso = localStorage.getItem('last_sync_iso');
    const currentSyncIso = new Date().toISOString();

    // 3. سحب التعديلات من السحابة وتطبيق فض النزاع (Pull with Conflict Resolution)

    // أ. سحب وتحديث المولدات
    const { data: cloudTenants } = await supabase.from('tenants').select('*');
    if (cloudTenants && cloudTenants.length > 0) {
      await db.settings.bulkPut(cloudTenants.map(dbToTenant));
    }

    // ب. سحب وتحديث المستخدمين
    const { data: cloudUsers } = await supabase.from('users').select('*');
    if (cloudUsers && cloudUsers.length > 0) {
      await db.users.bulkPut(cloudUsers.map(dbToUser));
    }

    // ج. سحب وتحديث المشتركين بفض النزاع
    let subQuery = supabase.from('subscribers').select('*');
    if (activeTenantId) subQuery = subQuery.eq('tenant_id', activeTenantId);
    if (lastSyncIso) subQuery = subQuery.gt('updated_at', lastSyncIso);

    const { data: cloudSubs } = await subQuery;
    if (cloudSubs && cloudSubs.length > 0) {
      for (const rawSub of cloudSubs) {
        const remoteSub = dbToSubscriber(rawSub);
        const localSub = await db.subscribers.get(remoteSub.id);
        if (localSub) {
          const resolved = resolveSubscriberConflict(localSub, remoteSub);
          await db.subscribers.put(resolved);
        } else {
          await db.subscribers.put(remoteSub);
        }
      }
    }

    // د. سحب وتحديث الفواتير بفض النزاع
    let invQuery = supabase.from('invoices').select('*');
    if (activeTenantId) invQuery = invQuery.eq('tenant_id', activeTenantId);
    if (lastSyncIso) invQuery = invQuery.gt('updated_at', lastSyncIso);

    const { data: cloudInvoices } = await invQuery;
    if (cloudInvoices && cloudInvoices.length > 0) {
      for (const rawInv of cloudInvoices) {
        const remoteInv = dbToInvoice(rawInv);
        const localInv = await db.invoices.get(remoteInv.id);
        if (localInv) {
          const resolved = await resolveInvoiceConflict(localInv, remoteInv);
          await db.invoices.put(resolved);
        } else {
          await db.invoices.put(remoteInv);
        }
      }
    }

    // هـ. سحب الدفعات الجديدة (Append-only)
    let payQuery = supabase.from('payments').select('*');
    if (activeTenantId) payQuery = payQuery.eq('tenant_id', activeTenantId);
    if (lastSyncIso) payQuery = payQuery.gt('payment_date', lastSyncIso);

    const { data: cloudPayments } = await payQuery;
    if (cloudPayments && cloudPayments.length > 0) {
      const newPayments = cloudPayments.map(dbToPayment);
      await db.payments.bulkPut(newPayments);
    }

    // و. سحب دورات التحصيل
    let cyclesQuery = supabase.from('billing_cycles').select('*');
    if (activeTenantId) cyclesQuery = cyclesQuery.eq('tenant_id', activeTenantId);
    const { data: cloudCycles } = await cyclesQuery;
    if (cloudCycles && cloudCycles.length > 0) {
      await db.billingCycles.bulkPut(cloudCycles.map(dbToCycle));
    }

    // ز. سحب المصاريف
    try {
      let expQuery = supabase.from('expenses').select('*');
      if (activeTenantId) expQuery = expQuery.eq('tenant_id', activeTenantId);
      const { data: cloudExpenses } = await expQuery;
      if (cloudExpenses && cloudExpenses.length > 0) {
        await db.expenses.bulkPut(cloudExpenses.map(dbToExpense));
      }
    } catch (expErr) {
      console.warn('تخطي سحب المصاريف مؤقتاً:', expErr);
    }

    // حفظ توقيت المزامنة بصيغة ISO للمزامنة التفاضلية القادمة
    localStorage.setItem('last_sync_iso', currentSyncIso);

    return true;
  } catch (error) {
    console.error('خطأ في المزامنة السحابية الذكية:', error);
    return false;
  }
}

export function useSyncManager(activeTenantId?: string) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    localStorage.getItem('last_sync_time')
  );

  // تحديث عدد العناصر غير المتزامنة
  const refreshPendingCount = async () => {
    try {
      const count = await db.syncQueue.count();
      setPendingCount(count);
    } catch {
      // تجاهل الأخطاء العابرة
    }
  };

  // المزامنة الفعلية مع سحابة Supabase
  const triggerSync = async () => {
    if (!navigator.onLine || isSyncing) return;

    try {
      setIsSyncing(true);
      await syncAllWithCloud(activeTenantId);

      const now = new Date().toLocaleTimeString('ar-IQ');
      setLastSyncTime(now);
      localStorage.setItem('last_sync_time', now);
      await refreshPendingCount();
    } catch (err) {
      console.error('فشل في المزامنة السحابية:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshPendingCount();

    // تشغيل المزامنة فور بدء التطبيق إذا كان هناك إنترنت
    if (navigator.onLine) {
      triggerSync();
    }

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // فحص ومزامنة دورية كل 30 ثانية في الخلفية
    const interval = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) {
        triggerSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [activeTenantId]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
    triggerSync,
    refreshPendingCount,
  };
}
