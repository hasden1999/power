/**
 * src/ui/screens/BillingScreen.ts
 * Billing & Collections Screen: Monthly Cycles, Payments, Debts & Thermal Invoicing
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { thermalReceiptModal } from '../components/ThermalReceiptModal.ts';
import { licenseManager } from '../../license/license.ts';
import type { BillingRecord, AppSettings, BillStatus } from '../../types/index.ts';

export class BillingScreen {
  private container: HTMLElement;
  private currentMonth: number;
  private currentYear: number;
  private bills: BillingRecord[] = [];
  private searchQuery: string = '';
  private currentFilter: string = 'الكل';
  private settings: AppSettings | null = null;
  private modalElement: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const now = new Date();
    this.currentMonth = now.getMonth() + 1;
    this.currentYear = now.getFullYear();
  }

  public async render(): Promise<void> {
    this.container.innerHTML = '';
    this.settings = await db.getSettings();

    const root = document.createElement('div');
    root.className = 'space-y-4';

    // 1. Header & Actions
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-xl font-black text-white flex items-center gap-2';
    title.innerHTML = '💰 الجباية والإيصالات';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'رصد المقبوضات الشهرية، تسجيل الدفعات، وطباعة سندات القبض';
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className =
      'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-2';
    generateBtn.innerHTML = '⚡ توليد قوائم الشهر';
    generateBtn.addEventListener('click', () => this.generateBillsForMonth());

    header.appendChild(titleGroup);
    header.appendChild(generateBtn);
    root.appendChild(header);

    // 2. Month & Year Selector Bar
    const dateBar = document.createElement('div');
    dateBar.className =
      'p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs';

    const prevMonthBtn = document.createElement('button');
    prevMonthBtn.type = 'button';
    prevMonthBtn.className = 'min-h-[38px] px-3 py-1 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold';
    prevMonthBtn.textContent = '◀ الشهر السابق';
    prevMonthBtn.addEventListener('click', () => {
      if (this.currentMonth === 1) {
        this.currentMonth = 12;
        this.currentYear--;
      } else {
        this.currentMonth--;
      }
      this.updateDateDisplay();
      this.loadBills();
    });

    const dateDisplay = document.createElement('div');
    dateDisplay.id = 'billing-date-display';
    dateDisplay.className = 'text-center font-black text-sm text-cyan-400';
    dateDisplay.textContent = `شهر ${this.currentMonth} / ${this.currentYear}`;

    const nextMonthBtn = document.createElement('button');
    nextMonthBtn.type = 'button';
    nextMonthBtn.className = 'min-h-[38px] px-3 py-1 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold';
    nextMonthBtn.textContent = 'الشهر التالي ▶';
    nextMonthBtn.addEventListener('click', () => {
      if (this.currentMonth === 12) {
        this.currentMonth = 1;
        this.currentYear++;
      } else {
        this.currentMonth++;
      }
      this.updateDateDisplay();
      this.loadBills();
    });

    dateBar.appendChild(prevMonthBtn);
    dateBar.appendChild(dateDisplay);
    dateBar.appendChild(nextMonthBtn);
    root.appendChild(dateBar);

    // 3. Search and Filters
    const filterSection = document.createElement('div');
    filterSection.className = 'flex flex-col sm:flex-row gap-2.5';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'بحث باسم المشترك أو الهاتف...';
    searchInput.value = this.searchQuery;
    searchInput.className =
      'flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500';
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.loadBills();
    });

    const filterGroup = document.createElement('div');
    filterGroup.className = 'flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0';

    const filters = ['الكل', 'واصل', 'متبقي', 'غير مسدد'];
    for (const f of filters) {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className = `min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
        this.currentFilter === f
          ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
      }`;
      fBtn.textContent = f;
      fBtn.addEventListener('click', () => {
        this.currentFilter = f;
        this.loadBills();
      });
      filterGroup.appendChild(fBtn);
    }

    filterSection.appendChild(searchInput);
    filterSection.appendChild(filterGroup);
    root.appendChild(filterSection);

    // 4. Financial Statistics
    const statsContainer = document.createElement('div');
    statsContainer.id = 'billing-stats';
    statsContainer.className = 'grid grid-cols-3 gap-2.5 text-center text-xs';
    root.appendChild(statsContainer);

    // 5. List Container
    const listContainer = document.createElement('div');
    listContainer.id = 'billing-list';
    listContainer.className = 'space-y-3';
    root.appendChild(listContainer);

    this.container.appendChild(root);

    await this.loadBills();
  }

  private updateDateDisplay(): void {
    const el = document.getElementById('billing-date-display');
    if (el) {
      el.textContent = `شهر ${this.currentMonth} / ${this.currentYear}`;
    }
  }

  private async loadBills(): Promise<void> {
    const listEl = document.getElementById('billing-list');
    const statsEl = document.getElementById('billing-stats');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل القوائم...</div>';

    try {
      this.bills = await db.getBillingRecords(this.currentYear, this.currentMonth, this.searchQuery, this.currentFilter);

      // Render Financial Stats
      if (statsEl) {
        const totalDue = this.bills.reduce((sum, b) => sum + b.totalDue, 0);
        const totalPaid = this.bills.reduce((sum, b) => sum + b.totalPaid, 0);
        const totalDebt = this.bills.reduce((sum, b) => sum + b.remaining, 0);
        const curr = this.settings?.currency || 'د.ع';

        statsEl.innerHTML = `
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">إجمالي المستحق</span>
            <span class="text-sm font-black text-white">${totalDue.toLocaleString('ar-IQ')} ${curr}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[10px]">المحصّل</span>
            <span class="text-sm font-black text-emerald-400">${totalPaid.toLocaleString('ar-IQ')} ${curr}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-rose-400 block text-[10px]">الديون المتبقية</span>
            <span class="text-sm font-black text-rose-400">${totalDebt.toLocaleString('ar-IQ')} ${curr}</span>
          </div>
        `;
      }

      if (this.bills.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">📑</div>
            <div class="text-sm font-bold text-slate-300">لا توجد وصولات لشهر ${this.currentMonth} / ${this.currentYear}</div>
            <p class="text-xs text-slate-500 mt-1 mb-4">اضغط على زر "توليد قوائم الشهر" لإصدار القوائم تلقائياً لجميع المشتركين النشطين</p>
            <button type="button" id="empty-generate-btn" class="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-md transition cursor-pointer">
              ⚡ توليد قوائم شهر ${this.currentMonth} الآن
            </button>
          </div>
        `;

        listEl.querySelector('#empty-generate-btn')?.addEventListener('click', () => {
          this.generateBillsForMonth();
        });
        return;
      }

      listEl.innerHTML = '';
      for (const bill of this.bills) {
        listEl.appendChild(this.createBillCard(bill));
      }
    } catch (err: any) {
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${err.message}</div>`;
    }
  }

  private createBillCard(bill: BillingRecord): HTMLElement {
    const card = document.createElement('div');
    card.className =
      'p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs';

    const infoCol = document.createElement('div');
    infoCol.className = 'space-y-1.5 flex-1';

    // Top row: Name & Status Badge
    const topRow = document.createElement('div');
    topRow.className = 'flex items-center gap-2 flex-wrap';

    const name = document.createElement('h4');
    name.className = 'text-sm font-black text-white';
    name.textContent = bill.subscriberName || 'مشترك غير معروف';
    topRow.appendChild(name);

    if (bill.amperes) {
      const amp = document.createElement('span');
      amp.className = 'px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/60';
      amp.textContent = `${bill.amperes} أمبير`;
      topRow.appendChild(amp);
    }

    const statusBadge = document.createElement('span');
    const statusColors: Record<BillStatus, string> = {
      واصل: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
      متبقي: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
      'غير مسدد': 'bg-rose-950/60 text-rose-400 border-rose-800/60',
    };
    statusBadge.className = `px-2 py-0.5 rounded-md font-bold border ${statusColors[bill.status] || ''}`;
    statusBadge.textContent = bill.status;
    topRow.appendChild(statusBadge);

    infoCol.appendChild(topRow);

    // Financial breakdown
    const curr = this.settings?.currency || 'د.ع';
    const numRow = document.createElement('div');
    numRow.className = 'flex items-center gap-4 text-[11px] flex-wrap';

    numRow.innerHTML = `
      <span>المستحق: <strong class="text-white">${bill.totalDue.toLocaleString('ar-IQ')}</strong> ${curr}</span>
      <span class="text-emerald-400">المدفوع: <strong>${bill.totalPaid.toLocaleString('ar-IQ')}</strong> ${curr}</span>
      <span class="${bill.remaining > 0 ? 'text-rose-400' : 'text-slate-500'}">المتبقي: <strong>${bill.remaining.toLocaleString('ar-IQ')}</strong> ${curr}</span>
    `;

    infoCol.appendChild(numRow);
    card.appendChild(infoCol);

    // Actions
    const actionsRow = document.createElement('div');
    actionsRow.className = 'flex items-center gap-2 self-end sm:self-center shrink-0';

    if (bill.remaining > 0) {
      const payBtn = document.createElement('button');
      payBtn.type = 'button';
      payBtn.className =
        'min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer';
      payBtn.textContent = '💵 تسديد';
      payBtn.addEventListener('click', () => this.openPaymentModal(bill));
      actionsRow.appendChild(payBtn);
    }

    const receiptBtn = document.createElement('button');
    receiptBtn.type = 'button';
    receiptBtn.className =
      'min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium transition cursor-pointer flex items-center gap-1';
    receiptBtn.innerHTML = '🧾 الوصل';
    receiptBtn.addEventListener('click', () => {
      if (this.settings) {
        thermalReceiptModal.show(bill, this.settings);
      }
    });
    actionsRow.appendChild(receiptBtn);

    card.appendChild(actionsRow);
    return card;
  }

  private async generateBillsForMonth(): Promise<void> {
    const defaultPrice = this.settings?.defaultAmperePrice || 12000;
    const pricePrompt = prompt(
      `أدخل سعر الأمبير لشهر ${this.currentMonth} / ${this.currentYear} بالدينار العراقي:`,
      defaultPrice.toString()
    );

    if (!pricePrompt) return;
    const price = parseFloat(pricePrompt);
    if (isNaN(price) || price <= 0) {
      alert('يرجى إدخال سعر صحيح للأمبير');
      return;
    }

    try {
      const count = await db.generateMonthlyBills(this.currentYear, this.currentMonth, price);
      alert(`تم بنجاح إصدار وتوليد ${count} قائمة لشهر ${this.currentMonth} / ${this.currentYear}!`);
      await this.loadBills();
    } catch (err: any) {
      alert(`فشل التوليد: ${err.message}`);
    }
  }

  private openPaymentModal(bill: BillingRecord): void {
    this.closeModal();

    this.modalElement = document.createElement('div');
    this.modalElement.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-slate-800 pb-3';

    const title = document.createElement('h3');
    title.className = 'text-base font-black text-cyan-400';
    title.textContent = `💵 تسجيل دفعة: ${bill.subscriberName}`;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closeModal());

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const curr = this.settings?.currency || 'د.ع';

    const form = document.createElement('form');
    form.className = 'space-y-3.5 text-xs';
    form.innerHTML = `
      <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1">
        <div class="flex justify-between">
          <span class="text-slate-400">إجمالي المستحق:</span>
          <span class="font-bold text-white">${bill.totalDue.toLocaleString('ar-IQ')} ${curr}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">المسدد سابقاً:</span>
          <span class="font-bold text-emerald-400">${bill.totalPaid.toLocaleString('ar-IQ')} ${curr}</span>
        </div>
        <div class="flex justify-between border-t border-slate-700 pt-1">
          <span class="text-rose-400 font-bold">المتبقي الحالي:</span>
          <span class="font-black text-rose-400 text-sm">${bill.remaining.toLocaleString('ar-IQ')} ${curr}</span>
        </div>
      </div>

      <div>
        <label class="block text-slate-300 font-bold mb-1">المبلغ المدفوع الآن (${curr}) <span class="text-rose-400">*</span></label>
        <input type="number" id="pay-amount" min="1000" step="500" max="${bill.remaining}" required value="${bill.remaining}"
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-base font-bold text-emerald-400 focus:border-cyan-500 focus:outline-none" />
      </div>

      <div>
        <label class="block text-slate-300 font-bold mb-1">ملاحظات القبض</label>
        <input type="text" id="pay-notes" placeholder="تسديد كامل نقداً، دفعة أولى، تحويل زين كاش..."
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-cyan-500 focus:outline-none" />
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button type="button" id="pay-cancel-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer">
          إلغاء
        </button>
        <button type="submit"
          class="min-h-[44px] px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950 transition active:scale-95 cursor-pointer">
          تأكيد التسديد وإصدار الوصل 🧾
        </button>
      </div>
    `;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amountVal = parseFloat((document.getElementById('pay-amount') as HTMLInputElement).value);
      const notesVal = (document.getElementById('pay-notes') as HTMLInputElement).value;

      if (isNaN(amountVal) || amountVal <= 0) {
        alert('يرجى إدخال مبلغ صحيح');
        return;
      }

      try {
        const updatedBill = await db.savePayment(bill.id, amountVal, notesVal);
        this.closeModal();
        await this.loadBills();

        // Automatically show thermal receipt
        if (this.settings) {
          thermalReceiptModal.show(updatedBill, this.settings);
        }
      } catch (err: any) {
        alert(`فشل حفظ التسديد: ${err.message}`);
      }
    });

    form.querySelector('#pay-cancel-btn')?.addEventListener('click', () => this.closeModal());

    card.appendChild(form);
    this.modalElement.appendChild(card);
    document.body.appendChild(this.modalElement);
  }

  private closeModal(): void {
    if (this.modalElement && this.modalElement.parentElement) {
      this.modalElement.parentElement.removeChild(this.modalElement);
      this.modalElement = null;
    }
  }
}
