import { db } from '../db/db';
import type { Subscriber, BillingCycle, Invoice, Payment } from '../types';

/**
 * تقريب وضبط المبالغ المالية بالدينار العراقي كأعداد صحيحة موجبة
 * يمنع مشاكل الفاصلة العائمة والكسور غير المنطقية
 */
export function roundIQD(amount: number): number {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

export function formatIQD(amount: number): string {
  const safeAmount = roundIQD(amount);
  return new Intl.NumberFormat('ar-IQ', {
    maximumFractionDigits: 0,
  }).format(safeAmount) + ' د.ع';
}

// حساب سعر الأمبير للمشترك بناءً على نوع اشتراكه
export function calculateUnitPrice(sub: Subscriber, cycle: BillingCycle): number {
  if (sub.subscriptionType === 'fixed') {
    return 0; // مقطوعة
  }
  if (sub.subscriptionType === 'gold') {
    return cycle.pricePerAmpereGold;
  }
  if (sub.subscriptionType === 'night') {
    return cycle.pricePerAmpereNight;
  }
  return cycle.pricePerAmpereNormal;
}

// الحصول على أحدث دورة فوترة نشطة للمولدة
export async function getLatestActiveCycle(tenantId: string): Promise<BillingCycle | undefined> {
  const cycles = await db.billingCycles.where('tenantId').equals(tenantId).toArray();
  if (!cycles || cycles.length === 0) return undefined;

  // فرز تنازلي حسب السنة والشهر
  cycles.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
  // يفضل الدورة غير المغلقة إن وجدت، وإلا نأخذ الأحدث
  const unclosed = cycles.find((c) => !c.isClosed);
  return unclosed || cycles[0];
}

/**
 * مزامنة فورية ولحظية لفاتورة المشترك للشهر الحالي:
 * 1. إذا كان مشتركاً جديداً: يتم توليد فاتورته فوراً للشهر الحالي بناءً على عدد الأمبيرات والتسعيرة المحددة.
 * 2. إذا تم تعديل الأمبيرات في وسط الشهر: يتم تحديث الفاتورة فوراً لاحتساب القيمة الجديدة مع الحفاظ على الدفعات المسددة.
 */
export async function syncSubscriberInvoiceForCurrentCycle(
  subscriber: Subscriber,
  customCycle?: BillingCycle
): Promise<Invoice | null> {
  if (!subscriber.isActive) {
    return null;
  }

  const cycle = customCycle || (await getLatestActiveCycle(subscriber.tenantId));
  if (!cycle) {
    return null;
  }

  // البحث هل توجد فاتورة مسبقة لهذا المشترك في الدورة الحالية
  const existingInvoice = await db.invoices
    .where('[subscriberId+cycleId]')
    .equals([subscriber.id, cycle.id])
    .first();

  const unitPrice = calculateUnitPrice(subscriber, cycle);
  const currentAmount =
    subscriber.subscriptionType === 'fixed'
      ? roundIQD(subscriber.fixedPrice || 0)
      : roundIQD(subscriber.amperes * unitPrice);

  const now = new Date().toISOString();

  if (existingInvoice) {
    // تعديل الفاتورة الحالية (مثلاً عند تعديل الأمبيرات أو نوع الاشتراك في وسط الشهر)
    const discount = existingInvoice.discount || 0;
    const previousDebt = existingInvoice.previousDebt || 0;
    const totalDue = Math.max(0, currentAmount + previousDebt - discount);
    const totalPaid = existingInvoice.totalPaid || 0;
    const status = totalPaid >= totalDue ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    const updatedInvoice: Invoice = {
      ...existingInvoice,
      amperes: subscriber.amperes,
      unitPrice,
      currentAmount,
      totalDue,
      status,
      updatedAt: now,
    };

    await db.invoices.put(updatedInvoice);

    // إضافة إلى طابور المزامنة
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'update',
      entity: 'invoices',
      entityId: updatedInvoice.id,
      payload: updatedInvoice,
      createdAt: now,
      attempts: 0,
    });

    return updatedInvoice;
  } else {
    // إنشاء فاتورة جديدة للمشترك الجديد للشهر الحالي
    const pastInvoices = await db.invoices
      .where('subscriberId')
      .equals(subscriber.id)
      .filter((inv) => inv.cycleId !== cycle.id && inv.status !== 'paid')
      .toArray();

    const previousUnpaidSum = pastInvoices.reduce(
      (sum, inv) => sum + (inv.totalDue - inv.totalPaid),
      0
    );

    const totalPreviousDebt = previousUnpaidSum + (subscriber.openingBalance || 0);
    const totalDue = Math.max(0, currentAmount + totalPreviousDebt);

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: cycle.tenantId,
      cycleId: cycle.id,
      subscriberId: subscriber.id,
      month: cycle.month,
      year: cycle.year,
      amperes: subscriber.amperes,
      unitPrice,
      currentAmount,
      previousDebt: totalPreviousDebt,
      discount: 0,
      totalDue,
      totalPaid: 0,
      status: totalDue === 0 ? 'paid' : 'unpaid',
      createdAt: now,
      updatedAt: now,
    };

    await db.invoices.add(newInvoice);

    // إضافة إلى طابور المزامنة
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'insert',
      entity: 'invoices',
      entityId: newInvoice.id,
      payload: newInvoice,
      createdAt: now,
      attempts: 0,
    });

    return newInvoice;
  }
}

/**
 * فحص ذاتي وتحديث شامل لكل المشتركين النشطين لضمان امتلاكهم فواتير مطابقة
 * للدورة الحالية وتحديث أي تغييرات سابقة في الأمبيرات
 */
export async function syncAllMissingInvoices(tenantId: string): Promise<number> {
  const latestCycle = await getLatestActiveCycle(tenantId);
  if (!latestCycle) return 0;

  const activeSubscribers = await db.subscribers
    .filter((s) => s.isActive && s.tenantId === tenantId)
    .toArray();

  if (activeSubscribers.length === 0) return 0;

  let syncedCount = 0;
  for (const sub of activeSubscribers) {
    const existing = await db.invoices
      .where('[subscriberId+cycleId]')
      .equals([sub.id, latestCycle.id])
      .first();

    if (!existing) {
      await syncSubscriberInvoiceForCurrentCycle(sub, latestCycle);
      syncedCount++;
    } else {
      // التحقق هل تغيرت الأمبيرات أو السعر
      const unitPrice = calculateUnitPrice(sub, latestCycle);
      const currentAmount =
        sub.subscriptionType === 'fixed'
          ? roundIQD(sub.fixedPrice || 0)
          : roundIQD(sub.amperes * unitPrice);

      if (
        existing.amperes !== sub.amperes ||
        existing.currentAmount !== currentAmount ||
        existing.unitPrice !== unitPrice
      ) {
        await syncSubscriberInvoiceForCurrentCycle(sub, latestCycle);
        syncedCount++;
      }
    }
  }

  return syncedCount;
}

// توليد فواتير الشهر تلقائياً لكل المشتركين النشطين
export async function generateInvoicesForCycle(cycle: BillingCycle): Promise<number> {
  const activeSubscribers = await db.subscribers
    .filter((s) => s.isActive && s.tenantId === cycle.tenantId)
    .toArray();

  let generatedCount = 0;

  for (const sub of activeSubscribers) {
    const inv = await syncSubscriberInvoiceForCurrentCycle(sub, cycle);
    if (inv) {
      generatedCount++;
    }
  }

  return generatedCount;
}

// تسجيل دفعة جديدة وسند قبض فوري
export async function recordPayment(params: {
  tenantId: string;
  subscriberId: string;
  invoiceId?: string;
  amount: number;
  collectorName: string;
  notes?: string;
}): Promise<Payment> {
  const { tenantId, subscriberId, invoiceId, amount, collectorName, notes } = params;

  const cleanAmount = roundIQD(amount);
  if (cleanAmount <= 0) {
    throw new Error('مبلغ السند غير صالح، يجب إدخال قيمة أكبر من الصفر');
  }

  const cleanCollector = (collectorName || 'الجابي').trim().slice(0, 80);
  const cleanNotes = notes ? notes.trim().slice(0, 300) : undefined;
  const paymentNumber = 'REC-' + Math.floor(100000 + Math.random() * 900000);

  const payment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    tenantId,
    subscriberId,
    invoiceId,
    amount: cleanAmount,
    paymentDate: new Date().toISOString(),
    collectorName: cleanCollector,
    notes: cleanNotes,
    syncStatus: navigator.onLine ? 'synced' : 'pending',
    receiptNumber: paymentNumber,
  };

  await db.payments.add(payment);

  // تحديث حالة الفاتورة
  if (invoiceId) {
    const invoice = await db.invoices.get(invoiceId);
    if (invoice) {
      const newTotalPaid = (invoice.totalPaid || 0) + cleanAmount;
      const newStatus =
        newTotalPaid >= invoice.totalDue
          ? 'paid'
          : newTotalPaid > 0
          ? 'partial'
          : 'unpaid';

      await db.invoices.update(invoiceId, {
        totalPaid: newTotalPaid,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // إضافة العملية لطابور المزامنة في حال كان أوفلاين
  await db.syncQueue.add({
    id: `sync-${Date.now()}`,
    action: 'insert',
    entity: 'payments',
    entityId: payment.id,
    payload: payment,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });

  return payment;
}
