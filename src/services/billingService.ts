import { db } from '../db/db';
import type { Subscriber, BillingCycle, Invoice, Payment } from '../types';

export function formatIQD(amount: number): string {
  return new Intl.NumberFormat('ar-IQ', {
    maximumFractionDigits: 0,
  }).format(amount) + ' د.ع';
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

// توليد فواتير الشهر تلقائياً لكل المشتركين النشطين
export async function generateInvoicesForCycle(cycle: BillingCycle): Promise<number> {
  const activeSubscribers = await db.subscribers
    .filter((s) => s.isActive && s.tenantId === cycle.tenantId)
    .toArray();

  let generatedCount = 0;

  for (const sub of activeSubscribers) {
    // التحقق هل توجد فاتورة مسبقة لهذا المشترك في نفس الدورة
    const existingInvoice = await db.invoices
      .where('[subscriberId+cycleId]')
      .equals([sub.id, cycle.id])
      .first();

    // البحث عن الديون السابقة غير المسددة من دورات سابقة
    const pastInvoices = await db.invoices
      .where('subscriberId')
      .equals(sub.id)
      .filter((inv) => inv.cycleId !== cycle.id && inv.status !== 'paid')
      .toArray();

    const previousUnpaidSum = pastInvoices.reduce(
      (sum, inv) => sum + (inv.totalDue - inv.totalPaid),
      0
    );

    const unitPrice = calculateUnitPrice(sub, cycle);
    const currentAmount =
      sub.subscriptionType === 'fixed'
        ? sub.fixedPrice || 0
        : sub.amperes * unitPrice;

    // مجموع الديون السابقة + الرصيد الافتتاحي إن لم يتم استيفاؤه
    const totalPreviousDebt = previousUnpaidSum + (existingInvoice ? 0 : sub.openingBalance);
    const discount = existingInvoice ? existingInvoice.discount : 0;
    const totalDue = Math.max(0, currentAmount + totalPreviousDebt - discount);

    if (existingInvoice) {
      // تحديث الفاتورة الحالية بالأسعار الجديدة في حال تم تغيير سعر الأمبير
      const totalPaid = existingInvoice.totalPaid;
      const status =
        totalPaid >= totalDue ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

      await db.invoices.update(existingInvoice.id, {
        unitPrice,
        currentAmount,
        totalDue,
        status,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // إنشاء فاتورة جديدة
      const newInvoice: Invoice = {
        id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        tenantId: cycle.tenantId,
        cycleId: cycle.id,
        subscriberId: sub.id,
        month: cycle.month,
        year: cycle.year,
        amperes: sub.amperes,
        unitPrice,
        currentAmount,
        previousDebt: totalPreviousDebt,
        discount: 0,
        totalDue,
        totalPaid: 0,
        status: totalDue === 0 ? 'paid' : 'unpaid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.invoices.add(newInvoice);
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

  const paymentNumber = 'REC-' + Math.floor(100000 + Math.random() * 900000);

  const payment: Payment = {
    id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    tenantId,
    subscriberId,
    invoiceId,
    amount,
    paymentDate: new Date().toISOString(),
    collectorName,
    notes,
    syncStatus: navigator.onLine ? 'synced' : 'pending',
    receiptNumber: paymentNumber,
  };

  await db.payments.add(payment);

  // تحديث حالة الفاتورة
  if (invoiceId) {
    const invoice = await db.invoices.get(invoiceId);
    if (invoice) {
      const newTotalPaid = (invoice.totalPaid || 0) + amount;
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
