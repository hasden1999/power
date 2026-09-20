import { db } from '../db/db';
import type { Subscriber, BillingCycle, Invoice, Payment, AuditLog, UserRole, LedgerEntry } from '../types';

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
 * الحصول على الدورة النشطة أو إنشاؤها تلقائياً للشهر الحالي فوراً
 * لضمان عدم بقاء أي مشترك جديد بدون فاتورة واحتساب اشتراكه وإضافته للمتأخرين مباشرة
 */
export async function getOrCreateLatestActiveCycle(tenantId: string): Promise<BillingCycle> {
  const existing = await getLatestActiveCycle(tenantId);
  if (existing) return existing;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const cycleId = `cycle-${tenantId}-${currentYear}-${currentMonth}`;

  let priceNormal = 12000;
  let priceGold = 20000;
  let priceNight = 8000;

  try {
    const settings = await db.settings.get(tenantId);
    if (settings) {
      if (settings.defaultPriceNormal && settings.defaultPriceNormal > 0) {
        priceNormal = settings.defaultPriceNormal;
      }
      if (settings.defaultPriceGold && settings.defaultPriceGold > 0) {
        priceGold = settings.defaultPriceGold;
      }
    }
  } catch (err) {
    console.warn('تعذر قراءة إعدادات التسعيرة الافتراضية:', err);
  }

  const newCycle: BillingCycle = {
    id: cycleId,
    tenantId,
    month: currentMonth,
    year: currentYear,
    pricePerAmpereNormal: priceNormal,
    pricePerAmpereGold: priceGold,
    pricePerAmpereNight: priceNight,
    issueDate: now.toISOString(),
    isClosed: false,
    createdAt: now.toISOString(),
  };

  await db.billingCycles.put(newCycle);

  try {
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'insert',
      entity: 'cycles',
      entityId: newCycle.id,
      payload: newCycle,
      createdAt: now.toISOString(),
      attempts: 0,
    });
  } catch (syncErr) {
    console.warn('خطأ طابور مزامنة دورة الفوترة:', syncErr);
  }

  return newCycle;
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

  const cycle = customCycle || (await getOrCreateLatestActiveCycle(subscriber.tenantId));
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
    // تعديل الفاتورة الحالية: إعادة احتساب الديون السابقة غير المسددة ديناميكياً لضمان عدم تجميد الدين
    const pastInvoices = await db.invoices
      .where('subscriberId')
      .equals(subscriber.id)
      .filter((inv) => inv.cycleId !== cycle.id && inv.status !== 'paid')
      .toArray();

    const previousUnpaidSum = pastInvoices.reduce(
      (sum, inv) => sum + Math.max(0, (inv.totalDue || 0) - (inv.totalPaid || 0)),
      0
    );

    const freshPreviousDebt = previousUnpaidSum + (subscriber.openingBalance || 0);
    const discount = existingInvoice.discount || 0;
    const totalDue = Math.max(0, currentAmount + freshPreviousDebt - discount);
    const totalPaid = existingInvoice.totalPaid || 0;
    const status = totalPaid >= totalDue ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    const updatedInvoice: Invoice = {
      ...existingInvoice,
      amperes: subscriber.amperes,
      unitPrice,
      currentAmount,
      previousDebt: freshPreviousDebt,
      totalDue,
      status,
      updatedAt: now,
    };

    await db.transaction('rw', [db.invoices, db.syncQueue], async () => {
      await db.invoices.put(updatedInvoice);

      await db.syncQueue.add({
        id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        action: 'update',
        entity: 'invoices',
        entityId: updatedInvoice.id,
        payload: updatedInvoice,
        createdAt: now,
        attempts: 0,
      });
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
  const latestCycle = await getOrCreateLatestActiveCycle(tenantId);
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

// توليد رقم تسلسلي مضمون للوصولات يمنع التكرار نهائياً (Sequential Receipt Numbering)
export async function getNextReceiptNumber(tenantId: string, collectorName?: string): Promise<string> {
  const currentYear = new Date().getFullYear();
  const cPrefix = (collectorName || 'COL')
    .trim()
    .slice(0, 3)
    .replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '') || 'COL';
  const storageKey = `power_receipt_seq_${tenantId}_${currentYear}`;

  let localSeq = parseInt(localStorage.getItem(storageKey) || '0', 10);

  // إذا لم يكن موجوداً في localStorage، نقوم بالبحث عن أعلى تسلسل موجود في قاعدة البيانات لنفس السنة
  if (localSeq === 0) {
    try {
      const allPayments = await db.payments.where('tenantId').equals(tenantId).toArray();
      let maxSeq = 0;
      const regex = new RegExp(`REC-${currentYear}-[A-Za-z0-9\u0621-\u064A]+-(\\d+)`);
      const fallbackRegex = new RegExp(`REC-${currentYear}-(\\d+)`);

      for (const p of allPayments) {
        if (p.receiptNumber) {
          const m1 = p.receiptNumber.match(regex);
          if (m1 && m1[1]) {
            const num = parseInt(m1[1], 10);
            if (num > maxSeq) maxSeq = num;
          } else {
            const m2 = p.receiptNumber.match(fallbackRegex);
            if (m2 && m2[1]) {
              const num = parseInt(m2[1], 10);
              if (num > maxSeq) maxSeq = num;
            }
          }
        }
      }
      localSeq = maxSeq;
    } catch (e) {
      console.warn('تعذر قراءة الحد الأقصى لأرقام السندات من قاعدة البيانات:', e);
    }
  }

  localSeq += 1;
  localStorage.setItem(storageKey, localSeq.toString());

  return `REC-${currentYear}-${cPrefix}-${localSeq.toString().padStart(5, '0')}`;
}

// تسجيل دفعة جديدة وسند قبض فوري بمعاملة ذرية مغلقة (Atomic Transaction)
export async function recordPayment(params: {
  tenantId: string;
  subscriberId: string;
  invoiceId?: string;
  amount: number;
  collectorName: string;
  notes?: string;
  userId?: string;
  userRole?: UserRole;
}): Promise<Payment> {
  const { tenantId, subscriberId, invoiceId, amount, collectorName, notes, userId, userRole } = params;

  const cleanAmount = roundIQD(amount);
  if (cleanAmount <= 0) {
    throw new Error('مبلغ السند غير صالح، يجب إدخال قيمة أكبر من الصفر');
  }

  const cleanCollector = (collectorName || 'الجابي').trim().slice(0, 80);
  const cleanNotes = notes ? notes.trim().slice(0, 300) : undefined;

  // التحقق الحاسم: منع تسديد أكثر مما في ذمة المشترك
  if (invoiceId) {
    const invoice = await db.invoices.get(invoiceId);
    if (invoice) {
      const remainingDue = Math.max(0, invoice.totalDue - (invoice.totalPaid || 0));
      if (remainingDue > 0 && cleanAmount > remainingDue) {
        throw new Error(`🚫 مرفوض: المبلغ المدخل (${formatIQD(cleanAmount)}) يتجاوز الذمة المطلوبة (${formatIQD(remainingDue)}). لا يمكن دفع أكثر من المطلوب.`);
      }
    }
  } else {
    const sub = await db.subscribers.get(subscriberId);
    if (sub && (sub.openingBalance || 0) > 0 && cleanAmount > sub.openingBalance) {
      throw new Error(`🚫 مرفوض: المبلغ المدخل (${formatIQD(cleanAmount)}) يتجاوز الرصيد المطلوب (${formatIQD(sub.openingBalance)}).`);
    }
  }

  const paymentNumber = await getNextReceiptNumber(tenantId, cleanCollector);

  const payment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

  const auditLog: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    tenantId,
    userId: userId || 'collector-local',
    userName: cleanCollector,
    userRole: userRole || 'collector',
    action: 'payment_recorded',
    entityType: 'payment',
    entityId: payment.id,
    details: {
      amount: cleanAmount,
      receiptNumber: paymentNumber,
      subscriberId,
      invoiceId,
    },
    createdAt: new Date().toISOString(),
  };

  // قفل ذري كامل للعملية يمنع أي Race Condition أو تجزؤ في التحديثات
  await db.transaction('rw', [db.payments, db.invoices, db.syncQueue, db.auditLogs, db.ledger], async () => {
    await db.payments.add(payment);
    await db.auditLogs.add(auditLog);

    // تسجيل القيد المزدوج في دفتر الأستاذ العام (Double-Entry Ledger)
    const ledgerDebitCash: LedgerEntry = {
      id: `led-${Date.now()}-c`,
      tenantId,
      transactionType: 'payment_received',
      referenceId: payment.id,
      subscriberId,
      account: 'cash_box',
      debit: cleanAmount,
      credit: 0,
      description: `قبض نقدي بموجب السند ${paymentNumber}`,
      createdAt: payment.paymentDate,
    };

    const ledgerCreditSub: LedgerEntry = {
      id: `led-${Date.now()}-s`,
      tenantId,
      transactionType: 'payment_received',
      referenceId: payment.id,
      subscriberId,
      account: 'subscriber_receivable',
      debit: 0,
      credit: cleanAmount,
      description: `تسديد اشتراك بموجب السند ${paymentNumber}`,
      createdAt: payment.paymentDate,
    };

    await db.ledger.bulkAdd([ledgerDebitCash, ledgerCreditSub]);

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

    // إضافة العملية لطابور المزامنة
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'insert',
      entity: 'payments',
      entityId: payment.id,
      payload: payment,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });

    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}b`,
      action: 'insert',
      entity: 'auditLogs',
      entityId: auditLog.id,
      payload: auditLog,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  });

  return payment;
}

/**
 * توحيد ومعايرة النصوص العربية للبحث الذكي السريع:
 * يعالج مشكلة الهمزات (أ، إ، آ -> ا)، والتاء المربوطة (ة -> ه)، والياء المقصورة (ى -> ي)
 * وحذف التشكيل والتطويل والمسافات الزائدة، لضمان تطابق 100% عند كتابة أي حرف
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[\u064B-\u065F\u0640]/g, '') // إزالة الحركات التشكيلية والتطويل
    .replace(/\s+/g, ' ');
}

/**
 * فحص ما إذا كان السند مسجلاً في نفس اليوم الحالي
 * (التعديل والإلغاء مسموح فقط في نفس يوم استلام الجباية)
 */
export function isPaymentFromToday(paymentDateStr?: string): boolean {
  if (!paymentDateStr) return false;
  try {
    const pDate = new Date(paymentDateStr);
    const today = new Date();
    return (
      pDate.getFullYear() === today.getFullYear() &&
      pDate.getMonth() === today.getMonth() &&
      pDate.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}

/**
 * تعديل وتصحيح سند قبض سابق تم تسجيله بالخطأ:
 * يعيد احتساب رصيد الفاتورة ومجموع المدفوعات المسددة ودفتر الأستاذ وسجل التدقيق
 * ملاحظة: مسموح فقط في نفس اليوم الذي تم فيه استلام الجباية
 */
export async function updatePayment(params: {
  paymentId: string;
  newAmount: number;
  collectorName?: string;
  notes?: string;
  userId?: string;
  userRole?: UserRole;
}): Promise<Payment> {
  const { paymentId, newAmount, collectorName, notes, userId, userRole } = params;
  const payment = await db.payments.get(paymentId);
  if (!payment) throw new Error('سند القبض غير موجود');

  // التحقق الحاسم: التعديل مسموح فقط في نفس يوم الجباية
  if (!isPaymentFromToday(payment.paymentDate)) {
    throw new Error('لا يمكن تعديل السندات السابقة. التعديل مسموح فقط في نفس اليوم الذي تم فيه استلام الجباية.');
  }

  const cleanNewAmount = roundIQD(newAmount);
  if (cleanNewAmount <= 0) throw new Error('يجب أن يكون المبلغ أكبر من الصفر');

  const oldAmount = payment.amount;
  const diff = cleanNewAmount - oldAmount;

  // التحقق الحاسم: منع جعل مجموع المدفوعات يتجاوز إجمالي المطلوب للفاتورة
  if (payment.invoiceId) {
    const invoice = await db.invoices.get(payment.invoiceId);
    if (invoice) {
      const otherPaid = Math.max(0, (invoice.totalPaid || 0) - oldAmount);
      if (otherPaid + cleanNewAmount > invoice.totalDue) {
        throw new Error(`🚫 مرفوض: المبلغ المعدل يتجاوز الذمة المطلوبة للفاتورة (${formatIQD(invoice.totalDue)}).`);
      }
    }
  }

  const now = new Date().toISOString();

  await db.transaction('rw', [db.payments, db.invoices, db.syncQueue, db.auditLogs, db.ledger], async () => {
    // 1. تحديث السند
    await db.payments.update(paymentId, {
      amount: cleanNewAmount,
      collectorName: collectorName || payment.collectorName,
      notes: notes !== undefined ? notes : payment.notes,
      updatedAt: now,
    });

    // 2. تحديث الفاتورة إن وجدت
    if (payment.invoiceId) {
      const invoice = await db.invoices.get(payment.invoiceId);
      if (invoice) {
        const newTotalPaid = Math.max(0, (invoice.totalPaid || 0) + diff);
        const newStatus =
          newTotalPaid >= invoice.totalDue
            ? 'paid'
            : newTotalPaid > 0
            ? 'partial'
            : 'unpaid';

        await db.invoices.update(payment.invoiceId, {
          totalPaid: newTotalPaid,
          status: newStatus,
          updatedAt: now,
        });

        await db.syncQueue.add({
          id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          action: 'update',
          entity: 'invoices',
          entityId: invoice.id,
          payload: { ...invoice, totalPaid: newTotalPaid, status: newStatus, updatedAt: now },
          createdAt: now,
          attempts: 0,
        });
      }
    }

    // 3. تحديث قيود دفتر الأستاذ
    const ledgerEntries = await db.ledger.where('referenceId').equals(paymentId).toArray();
    for (const entry of ledgerEntries) {
      if (entry.account === 'cash_box') {
        await db.ledger.update(entry.id, { debit: cleanNewAmount });
      } else if (entry.account === 'subscriber_receivable') {
        await db.ledger.update(entry.id, { credit: cleanNewAmount });
      }
    }

    // 4. توثيق عملية التعديل في سجل التدقيق والرقابة
    await db.auditLogs.add({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: payment.tenantId,
      userId: userId || 'local-user',
      userName: collectorName || payment.collectorName || 'إدارة المولدة',
      userRole: userRole || 'tenant_owner',
      action: 'payment_updated',
      entityType: 'payment',
      entityId: payment.id,
      details: {
        oldAmount,
        newAmount: cleanNewAmount,
        diff,
        receiptNumber: payment.receiptNumber,
        subscriberId: payment.subscriberId,
      },
      createdAt: now,
    });

    // 5. إضافة طابور المزامنة
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'update',
      entity: 'payments',
      entityId: payment.id,
      payload: { ...payment, amount: cleanNewAmount, collectorName, notes, updatedAt: now },
      createdAt: now,
      attempts: 0,
    });
  });

  return {
    ...payment,
    amount: cleanNewAmount,
    collectorName: collectorName || payment.collectorName,
    notes: notes !== undefined ? notes : payment.notes,
    updatedAt: now,
  };
}

/**
 * إلغاء / حذف سند قبض مسجل بالخطأ:
 * يعيد الفاتورة لحالتها السابقة ويخصم المبلغ من المسددات
 */
export async function deletePayment(params: {
  paymentId: string;
  reason?: string;
  userId?: string;
  userRole?: UserRole;
}): Promise<void> {
  const { paymentId, reason, userId, userRole } = params;
  const payment = await db.payments.get(paymentId);
  if (!payment) throw new Error('سند القبض غير موجود');

  // التحقق الحاسم: الإلغاء مسموح فقط في نفس يوم الجباية
  if (!isPaymentFromToday(payment.paymentDate)) {
    throw new Error('لا يمكن إلغاء السندات السابقة. الإلغاء مسموح فقط في نفس اليوم الذي تم فيه استلام الجباية.');
  }

  const now = new Date().toISOString();

  await db.transaction('rw', [db.payments, db.invoices, db.syncQueue, db.auditLogs, db.ledger], async () => {
    // 1. إعادة رصيد الفاتورة
    if (payment.invoiceId) {
      const invoice = await db.invoices.get(payment.invoiceId);
      if (invoice) {
        const newTotalPaid = Math.max(0, (invoice.totalPaid || 0) - payment.amount);
        const newStatus =
          newTotalPaid >= invoice.totalDue
            ? 'paid'
            : newTotalPaid > 0
            ? 'partial'
            : 'unpaid';

        await db.invoices.update(payment.invoiceId, {
          totalPaid: newTotalPaid,
          status: newStatus,
          updatedAt: now,
        });

        await db.syncQueue.add({
          id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          action: 'update',
          entity: 'invoices',
          entityId: invoice.id,
          payload: { ...invoice, totalPaid: newTotalPaid, status: newStatus, updatedAt: now },
          createdAt: now,
          attempts: 0,
        });
      }
    }

    // 2. حذف قيود الأستاذ المرتبطة
    const ledgerEntries = await db.ledger.where('referenceId').equals(paymentId).toArray();
    for (const entry of ledgerEntries) {
      await db.ledger.delete(entry.id);
    }

    // 3. حذف السند
    await db.payments.delete(paymentId);

    // 4. توثيق الإلغاء في سجل التدقيق
    await db.auditLogs.add({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId: payment.tenantId,
      userId: userId || 'local-user',
      userName: payment.collectorName || 'إدارة المولدة',
      userRole: userRole || 'tenant_owner',
      action: 'payment_deleted',
      entityType: 'payment',
      entityId: payment.id,
      details: {
        amount: payment.amount,
        receiptNumber: payment.receiptNumber,
        subscriberId: payment.subscriberId,
        reason: reason || 'إلغاء سند مسجل بالخطأ',
      },
      createdAt: now,
    });

    // 5. طابور المزامنة
    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'delete',
      entity: 'payments',
      entityId: payment.id,
      payload: { id: payment.id },
      createdAt: now,
      attempts: 0,
    });
  });
}
