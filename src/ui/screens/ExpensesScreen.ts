/**
 * src/ui/screens/ExpensesScreen.ts
 * Expenses & Fuel Screen: Diesel liters, oil changes, repairs, wages & daily costs
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { licenseManager } from '../../license/license.ts';
import type { Expense, ExpenseType, AppSettings } from '../../types/index.ts';

export class ExpensesScreen {
  private container: HTMLElement;
  private currentMonth: number;
  private currentYear: number;
  private expenses: Expense[] = [];
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
    title.innerHTML = '⛽ المصاريف والوقود';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'سجل شراء الكاز (الديزل)، الزيوت، الفلاتر، وتكاليف الصيانة والأجور';
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className =
      'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-2';
    addBtn.innerHTML = '➕ تسجيل مصروف جديد';
    addBtn.addEventListener('click', () => this.openExpenseModal());

    header.appendChild(titleGroup);
    header.appendChild(addBtn);
    root.appendChild(header);

    // 2. Month Selector
    const dateBar = document.createElement('div');
    dateBar.className =
      'p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'min-h-[38px] px-3 py-1 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold';
    prevBtn.textContent = '◀ الشهر السابق';
    prevBtn.addEventListener('click', () => {
      if (this.currentMonth === 1) {
        this.currentMonth = 12;
        this.currentYear--;
      } else {
        this.currentMonth--;
      }
      this.updateDateDisplay();
      this.loadExpenses();
    });

    const dateDisplay = document.createElement('div');
    dateDisplay.id = 'expenses-date-display';
    dateDisplay.className = 'text-center font-black text-sm text-cyan-400';
    dateDisplay.textContent = `شهر ${this.currentMonth} / ${this.currentYear}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'min-h-[38px] px-3 py-1 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold';
    nextBtn.textContent = 'الشهر التالي ▶';
    nextBtn.addEventListener('click', () => {
      if (this.currentMonth === 12) {
        this.currentMonth = 1;
        this.currentYear++;
      } else {
        this.currentMonth++;
      }
      this.updateDateDisplay();
      this.loadExpenses();
    });

    dateBar.appendChild(prevBtn);
    dateBar.appendChild(dateDisplay);
    dateBar.appendChild(nextBtn);
    root.appendChild(dateBar);

    // 3. Stats Summary
    const statsContainer = document.createElement('div');
    statsContainer.id = 'expenses-stats';
    statsContainer.className = 'grid grid-cols-2 gap-2.5 text-center text-xs';
    root.appendChild(statsContainer);

    // 4. List Container
    const listContainer = document.createElement('div');
    listContainer.id = 'expenses-list';
    listContainer.className = 'space-y-3';
    root.appendChild(listContainer);

    this.container.appendChild(root);

    await this.loadExpenses();
  }

  private updateDateDisplay(): void {
    const el = document.getElementById('expenses-date-display');
    if (el) el.textContent = `شهر ${this.currentMonth} / ${this.currentYear}`;
  }

  private async loadExpenses(): Promise<void> {
    const listEl = document.getElementById('expenses-list');
    const statsEl = document.getElementById('expenses-stats');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل المصاريف...</div>';

    try {
      this.expenses = await db.getExpenses(this.currentMonth, this.currentYear);

      // Render stats
      if (statsEl) {
        const totalAmount = this.expenses.reduce((sum, e) => sum + e.totalAmount, 0);
        const fuelLiters = this.expenses
          .filter((e) => e.expenseType === 'وقود' && e.fuelLiters)
          .reduce((sum, e) => sum + (e.fuelLiters || 0), 0);
        const curr = this.settings?.currency || 'د.ع';

        statsEl.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">إجمالي المصاريف</span>
            <span class="text-base font-black text-rose-400">${totalAmount.toLocaleString('ar-IQ')} ${curr}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-amber-400 block text-[10px]">استهلاك الكاز (الديزل)</span>
            <span class="text-base font-black text-amber-400">${fuelLiters.toLocaleString('ar-IQ')} لتر</span>
          </div>
        `;
      }

      if (this.expenses.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">🧾</div>
            <div class="text-sm font-bold text-slate-300">لا توجد مصاريف مسجلة لشهر ${this.currentMonth} / ${this.currentYear}</div>
            <p class="text-xs text-slate-500 mt-1">اضغط على زر "تسجيل مصروف جديد" لتوثيق فواتير الوقود والصيانة</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';
      for (const exp of this.expenses) {
        listEl.appendChild(this.createExpenseCard(exp));
      }
    } catch (err: any) {
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${err.message}</div>`;
    }
  }

  private createExpenseCard(exp: Expense): HTMLElement {
    const card = document.createElement('div');
    card.className =
      'p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-md flex items-center justify-between gap-3 text-xs';

    const infoCol = document.createElement('div');
    infoCol.className = 'space-y-1 flex-1';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center gap-2 flex-wrap';

    const typeIcons: Record<ExpenseType, string> = {
      وقود: '⛽ كاز (ديزل)',
      زيت_وفلاتر: '🛢️ زيت وفلاتر',
      صيانة: '🔧 صيانة وتصليح',
      أجور: '👷 أجور عمال ومشغلين',
      إيجار: '🏢 إيجار موقع',
      نثريات: '📦 نثريات أخرى',
    };

    const typeBadge = document.createElement('span');
    typeBadge.className = 'font-black text-sm text-cyan-300';
    typeBadge.textContent = typeIcons[exp.expenseType] || exp.expenseType;
    topRow.appendChild(typeBadge);

    if (exp.fuelLiters) {
      const litersBadge = document.createElement('span');
      litersBadge.className = 'px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 font-bold border border-amber-800/60';
      litersBadge.textContent = `${exp.fuelLiters.toLocaleString('ar-IQ')} لتر`;
      topRow.appendChild(litersBadge);
    }

    infoCol.appendChild(topRow);

    const subRow = document.createElement('div');
    subRow.className = 'flex items-center gap-3 text-slate-400 text-[11px]';
    subRow.innerHTML = `
      <span>📅 ${exp.expenseDate}</span>
      ${exp.notes ? `<span class="text-slate-500 italic">📝 ${exp.notes}</span>` : ''}
    `;
    infoCol.appendChild(subRow);
    card.appendChild(infoCol);

    // Amount & Delete
    const rightCol = document.createElement('div');
    rightCol.className = 'flex items-center gap-3';

    const curr = this.settings?.currency || 'د.ع';
    const amountSpan = document.createElement('span');
    amountSpan.className = 'text-sm font-black text-rose-400';
    amountSpan.textContent = `${exp.totalAmount.toLocaleString('ar-IQ')} ${curr}`;
    rightCol.appendChild(amountSpan);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className =
      'text-slate-500 hover:text-rose-400 p-1.5 rounded-lg transition cursor-pointer text-sm leading-none';
    delBtn.innerHTML = '🗑️';
    delBtn.title = 'حذف المصروف';
    delBtn.addEventListener('click', async () => {
      if (confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
        await db.deleteExpense(exp.id);
        await this.loadExpenses();
      }
    });
    rightCol.appendChild(delBtn);

    card.appendChild(rightCol);
    return card;
  }

  private async openExpenseModal(): Promise<void> {
    const settings = await db.getSettings();
    const licStatus = await licenseManager.getStatus(settings);
    if (!licStatus.canAddRecords) {
      alert(
        'انتهت الفترة التجريبية المجانية (30 يوماً). تم قفل تسجيل مصاريف جديدة. يمكنك استعراض كافة السجلات وتصدير التقارير في أي وقت. لتفعيل النظام يُرجى إدخال كود الترخيص من شاشة الإعدادات.'
      );
      return;
    }

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
    title.textContent = '⛽ تسجيل مصروف جديد';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closeModal());

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const todayStr = new Date().toISOString().split('T')[0];
    const curr = settings.currency || 'د.ع';

    const form = document.createElement('form');
    form.className = 'space-y-3.5 text-xs';
    form.innerHTML = `
      <div>
        <label class="block text-slate-300 font-bold mb-1">نوع المصروف <span class="text-rose-400">*</span></label>
        <select id="exp-type" class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm font-medium">
          <option value="وقود">⛽ شراء كاز (ديزل)</option>
          <option value="زيت_وفلاتر">🛢️ تبديل زيت وفلاتر</option>
          <option value="صيانة">🔧 صيانة وتصليح أعطال</option>
          <option value="أجور">👷 أجور عمال ومشغلين</option>
          <option value="إيجار">🏢 إيجار موقع المولدة</option>
          <option value="نثريات">📦 نثريات ومشتريات أخرى</option>
        </select>
      </div>

      <div id="fuel-liters-row">
        <label class="block text-slate-300 font-bold mb-1">كمية الوقود باللتر</label>
        <input type="number" id="exp-liters" step="1" min="1" placeholder="مثال: 500 أو 1000 لتر"
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-slate-300 font-bold mb-1">المبلغ الإجمالي (${curr}) <span class="text-rose-400">*</span></label>
          <input type="number" id="exp-amount" min="500" step="500" required placeholder="المبلغ بالدينار"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm font-bold text-rose-400 focus:border-cyan-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">تاريخ المصروف</label>
          <input type="date" id="exp-date" value="${todayStr}"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
        </div>
      </div>

      <div>
        <label class="block text-slate-300 font-bold mb-1">ملاحظات</label>
        <input type="text" id="exp-notes" placeholder="رقم الصهريج، اسم المحطة، تفاصيل الصيانة..."
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-cyan-500 focus:outline-none" />
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button type="button" id="exp-cancel-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer">
          إلغاء
        </button>
        <button type="submit"
          class="min-h-[44px] px-6 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950 transition active:scale-95 cursor-pointer">
          حفظ المصروف
        </button>
      </div>
    `;

    const typeSelect = form.querySelector('#exp-type') as HTMLSelectElement;
    const litersRow = form.querySelector('#fuel-liters-row') as HTMLElement;

    typeSelect.addEventListener('change', () => {
      litersRow.style.display = typeSelect.value === 'وقود' ? 'block' : 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const typeVal = typeSelect.value as ExpenseType;
      const litersVal = parseFloat((document.getElementById('exp-liters') as HTMLInputElement).value);
      const amountVal = parseFloat((document.getElementById('exp-amount') as HTMLInputElement).value);
      const dateVal = (document.getElementById('exp-date') as HTMLInputElement).value;
      const notesVal = (document.getElementById('exp-notes') as HTMLInputElement).value;

      try {
        await db.addExpense({
          expenseType: typeVal,
          fuelLiters: typeVal === 'وقود' && !isNaN(litersVal) ? litersVal : null,
          totalAmount: amountVal,
          expenseDate: dateVal || todayStr,
          notes: notesVal,
        });

        this.closeModal();
        await this.loadExpenses();
      } catch (err: any) {
        alert(`فشل حفظ المصروف: ${err.message}`);
      }
    });

    form.querySelector('#exp-cancel-btn')?.addEventListener('click', () => this.closeModal());

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
