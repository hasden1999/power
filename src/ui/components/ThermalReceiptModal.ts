/**
 * src/ui/components/ThermalReceiptModal.ts
 * Field Thermal Receipt Modal for Bluetooth & Portable Printers (58mm / 80mm)
 */

import type { BillingRecord, AppSettings } from '../../types/index.ts';

export class ThermalReceiptModal {
  private element: HTMLElement | null = null;

  constructor() {}

  public show(bill: BillingRecord, settings: AppSettings): void {
    this.close();

    this.element = document.createElement('div');
    this.element.id = 'thermal-modal-backdrop';
    this.element.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100 flex flex-col gap-4';

    // Modal Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-slate-800 pb-3';

    const title = document.createElement('h3');
    title.className = 'text-base font-black text-cyan-400 flex items-center gap-2';
    title.textContent = '🧾 وصل قبض حراري';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Thermal Receipt Preview Box
    const receiptContainer = document.createElement('div');
    receiptContainer.id = 'thermal-receipt';
    receiptContainer.className =
      'bg-white text-slate-900 p-4 rounded-xl shadow-inner font-mono text-xs leading-relaxed border-2 border-dashed border-slate-300 select-text';

    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-IQ');
    const timeStr = now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

    receiptContainer.innerHTML = `
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-weight: 900; font-size: 14px; margin-bottom: 2px;">${settings.generatorName}</div>
        <div style="font-size: 11px;">هاتف: ${settings.ownerPhone || 'غير مسجل'}</div>
        <div style="font-size: 10px; margin-top: 2px;">وصل قبض اشتراك شهري</div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>التاريخ: ${dateStr}</span>
        <span>${timeStr}</span>
      </div>
      <div style="margin-bottom: 6px; font-size: 10px; color: #555;">
        رقم السند: #${bill.id.slice(0, 8).toUpperCase()}
      </div>

      <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <strong>المشترك:</strong>
          <span>${bill.subscriberName || 'غير معروف'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>الأمبيرية:</span>
          <span>${bill.amperes || 0} أمبير</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>عن شهر:</span>
          <span>${bill.month} / ${bill.year}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>سعر الأمبير:</span>
          <span>${bill.pricePerAmpere.toLocaleString('ar-IQ')} ${settings.currency}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px dotted #ccc;">
          <strong>المبلغ المستحق:</strong>
          <strong>${bill.totalDue.toLocaleString('ar-IQ')} ${settings.currency}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; color: #047857; margin-top: 2px;">
          <strong>المدفوع نقداً:</strong>
          <strong>${bill.totalPaid.toLocaleString('ar-IQ')} ${settings.currency}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; color: ${bill.remaining > 0 ? '#b91c1c' : '#000'}; margin-top: 2px;">
          <strong>المتبقي (دين):</strong>
          <strong>${bill.remaining.toLocaleString('ar-IQ')} ${settings.currency}</strong>
        </div>
      </div>

      ${bill.notes ? `<div style="font-size: 10px; margin-bottom: 6px;">ملاحظات: ${bill.notes}</div>` : ''}

      <div style="text-align: center; font-size: 10px; margin-top: 6px; border-top: 1px dashed #000; padding-top: 6px;">
        شكراً لالتزامكم بالتسديد في الموعد المحدد ⚡<br>
        منظومة «أمبيرجي» لإدارة المولدات
      </div>
    `;

    card.appendChild(receiptContainer);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 pt-2';

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className =
      'flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-2';
    printBtn.innerHTML = '🖨️ طباعة فورية (Print)';
    printBtn.addEventListener('click', () => {
      window.print();
    });

    const closeBtn2 = document.createElement('button');
    closeBtn2.type = 'button';
    closeBtn2.className =
      'min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer';
    closeBtn2.textContent = 'إغلاق';
    closeBtn2.addEventListener('click', () => this.close());

    actions.appendChild(printBtn);
    actions.appendChild(closeBtn2);
    card.appendChild(actions);

    this.element.appendChild(card);
    document.body.appendChild(this.element);
  }

  public close(): void {
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
      this.element = null;
    }
  }
}

export const thermalReceiptModal = new ThermalReceiptModal();
