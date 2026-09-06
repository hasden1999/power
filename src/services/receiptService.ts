import { formatIQD } from './billingService';
import type { Subscriber, Payment, TenantSettings } from '../types';

export function buildWhatsAppLink(
  subscriber: Subscriber,
  payment: Payment,
  remainingDebt: number,
  settings?: TenantSettings
): string {
  // تنظيف رقم الهاتف العراقي
  let phone = subscriber.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
  if (phone.startsWith('07')) {
    phone = '964' + phone.substring(1);
  } else if (phone.startsWith('+964')) {
    phone = phone.replace('+', '');
  }

  const generatorName = settings?.generatorName || 'إدارة المولدة الأهلية';
  const ownerPhone = settings?.phone || '';
  const dateStr = new Date(payment.paymentDate).toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const message = `⚡ *سند قبض إلكتروني - ${generatorName}* ⚡
-----------------------------------------
👤 *المشترك:* ${subscriber.fullName}
🔌 *القاطع/الفيز:* ${subscriber.breakerNumber}
⚡ *عدد الأمبيرات:* ${subscriber.amperes} أمبير
📍 *العنوان:* ${subscriber.street}
-----------------------------------------
💰 *المبلغ المستلم:* ${formatIQD(payment.amount)}
📉 *المتبقي بذمة المشترك:* ${remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)'}
🧾 *رقم الوصل:* ${payment.receiptNumber}
📅 *التاريخ:* ${dateStr}
👤 *المستلم:* ${payment.collectorName}
-----------------------------------------
نشكر لكم التزامكم بالتسديد في الموعد المحدد.
للاستفسار: ${ownerPhone}`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function printThermalReceipt() {
  window.print();
}
