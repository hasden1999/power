/**
 * src/ui/screens/ReportsScreen.ts
 * Reports & Profit Analysis Screen: Monthly P&L, Debt Ledgers, Printouts & CSV Exports
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { backupManager } from '../../backup/backup.ts';
import { escapeHtml } from '../../utils/security.ts';
import type { MonthlyReport, AppSettings } from '../../types/index.ts';

export class ReportsScreen {
  private container: HTMLElement;
  private currentMonth: number;
  private currentYear: number;
  private report: MonthlyReport | null = null;
  private settings: AppSettings | null = null;

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
    title.innerHTML = '📊 التقارير وصافي الأرباح';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'كشف الحساب الشهري، الأرباح الصافية، والديون غير المسددة';
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const exportBtns = document.createElement('div');
    exportBtns.className = 'flex items-center gap-2 flex-wrap';

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className =
      'min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5';
    printBtn.innerHTML = '🖨️ طباعة التقرير';
    printBtn.addEventListener('click', () => window.print());

    const csvSubBtn = document.createElement('button');
    csvSubBtn.type = 'button';
    csvSubBtn.className =
      'min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5';
    csvSubBtn.innerHTML = '📥 تصدير المشتركين CSV';
    csvSubBtn.addEventListener('click', async () => {
      const subs = await db.getSubscribers();
      await backupManager.exportSubscribersToCsv(subs);
    });

    const csvBillBtn = document.createElement('button');
    csvBillBtn.type = 'button';
    csvBillBtn.className =
      'min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5';
    csvBillBtn.innerHTML = '📥 تصدير الجباية CSV';
    csvBillBtn.addEventListener('click', async () => {
      const bills = await db.getBillingRecords(this.currentYear, this.currentMonth);
      await backupManager.exportBillingToCsv(bills);
    });

    exportBtns.appendChild(printBtn);
    exportBtns.appendChild(csvSubBtn);
    exportBtns.appendChild(csvBillBtn);
    header.appendChild(titleGroup);
    header.appendChild(exportBtns);
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
      this.loadReport();
    });

    const dateDisplay = document.createElement('div');
    dateDisplay.id = 'reports-date-display';
    dateDisplay.className = 'text-center font-black text-sm text-cyan-400';
    dateDisplay.textContent = `تقرير شهر ${this.currentMonth} / ${this.currentYear}`;

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
      this.loadReport();
    });

    dateBar.appendChild(prevBtn);
    dateBar.appendChild(dateDisplay);
    dateBar.appendChild(nextBtn);
    root.appendChild(dateBar);

    // 3. Report Content Container
    const reportContainer = document.createElement('div');
    reportContainer.id = 'report-content';
    reportContainer.className = 'space-y-4';
    root.appendChild(reportContainer);

    this.container.appendChild(root);

    await this.loadReport();
  }

  private updateDateDisplay(): void {
    const el = document.getElementById('reports-date-display');
    if (el) el.textContent = `تقرير شهر ${this.currentMonth} / ${this.currentYear}`;
  }

  private async loadReport(): Promise<void> {
    const reportEl = document.getElementById('report-content');
    if (!reportEl) return;

    reportEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تجهيز التقرير المالي...</div>';

    try {
      const [report, outstandingDebt, outstandingBills] = await Promise.all([
        db.getMonthlyReport(this.currentYear, this.currentMonth),
        db.getOutstandingDebt(),
        db.getOutstandingBills(),
      ]);
      this.report = report;

      const currency = escapeHtml(this.settings?.currency || 'د.ع');
      const format = (value: number): string =>
        (Number.isFinite(Number(value)) ? Number(value) : 0).toLocaleString('ar-IQ');

      reportEl.innerHTML = `
        <!-- Net Profit Hero Box -->
        <div class="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border ${
          report.netProfit >= 0 ? 'border-emerald-600/40' : 'border-rose-600/40'
        } shadow-xl text-center relative overflow-hidden">
          <div class="text-xs font-bold text-slate-400 mb-1">صافي الأرباح لشهر ${this.currentMonth} / ${this.currentYear}</div>
          <div class="text-3xl sm:text-4xl font-black ${
            report.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
          } mb-2">
            ${format(report.netProfit)} ${currency}
          </div>
          <p class="text-xs text-slate-400">
            صافي الربح = المقبوضات النقدية المحصلة (${format(report.totalCollected)} ${currency}) - إجمالي المصاريف (${format(
              report.totalExpenses
            )} ${currency})
          </p>
        </div>

        <!-- 4-Grid Financial Breakdown -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[11px] mb-1">إجمالي المستحق (القوائم)</span>
            <span class="text-base font-black text-white">${format(report.totalDue)}</span>
            <span class="text-[10px] text-slate-500 block">${currency} — لهذا الشهر</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[11px] mb-1">المبالغ المحصلة فعلياً</span>
            <span class="text-base font-black text-emerald-400">${format(report.totalCollected)}</span>
            <span class="text-[10px] text-emerald-600 block">${currency} — لهذا الشهر</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-rose-400 block text-[11px] mb-1">الديون التراكمية</span>
            <span class="text-base font-black text-rose-400">${format(outstandingDebt)}</span>
            <span class="text-[10px] text-rose-600 block">${currency} — ديون هذا الشهر: ${format(
              report.totalDebt
            )}</span>
          </div>

          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-amber-400 block text-[11px] mb-1">إجمالي المصاريف</span>
            <span class="text-base font-black text-amber-400">${format(report.totalExpenses)}</span>
            <span class="text-[10px] text-amber-600 block">${currency} — لهذا الشهر</span>
          </div>
        </div>

        <!-- Technical & Operational Stats -->
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
          <h4 class="font-black text-slate-200 text-sm">⛽ إحصائيات التشغيل والوقود</h4>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div class="p-3 rounded-xl bg-slate-800/60">
              <span class="text-slate-400 block text-[10px]">استهلاك الكاز (الديزل)</span>
              <span class="text-sm font-black text-amber-400">${format(report.fuelLiters)} لتر</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/60">
              <span class="text-slate-400 block text-[10px]">تكلفة الوقود</span>
              <span class="text-sm font-black text-amber-400">${format(report.fuelExpenses)} ${currency}</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/60">
              <span class="text-slate-400 block text-[10px]">مجموع الأمبيرات المغذاة</span>
              <span class="text-sm font-black text-cyan-400">${report.totalAmperes.toFixed(1)} أمبير (${
                report.activeSubscribers
              } مشترك)</span>
            </div>
          </div>
        </div>

        <!-- Cumulative Outstanding Debts List -->
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 class="font-black text-rose-400 text-sm">⚠️ قائمة الديون التراكمية (${outstandingBills.length} فاتورة غير مسددة)</h4>
            <span class="text-slate-400 text-[11px]">مجموع الديون: <strong class="text-rose-400">${format(
              outstandingDebt
            )}</strong> ${currency}</span>
          </div>

          ${
            outstandingBills.length === 0
              ? '<div class="text-center py-6 text-emerald-400 font-bold">🎉 تهانينا! لا توجد أي ديون متراكمة على المشتركين.</div>'
              : `
              <div class="overflow-x-auto">
                <table class="w-full text-right border-collapse">
                  <thead>
                    <tr class="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th class="py-2">المشترك</th>
                      <th class="py-2">الهاتف</th>
                      <th class="py-2">الشهر</th>
                      <th class="py-2">الأمبيرية</th>
                      <th class="py-2">المستحق</th>
                      <th class="py-2">المسدد</th>
                      <th class="py-2">المتبقي (دين)</th>
                      <th class="py-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/60 text-slate-200">
                    ${outstandingBills
                      .map(
                        (bill) => `
                      <tr class="hover:bg-slate-800/40">
                        <td class="py-2.5 font-bold">${escapeHtml(bill.subscriberName || 'غير معروف')}</td>
                        <td class="py-2.5">${escapeHtml(bill.phone || '-')}</td>
                        <td class="py-2.5">${bill.month}/${bill.year}</td>
                        <td class="py-2.5">${escapeHtml(bill.amperes || 0)}</td>
                        <td class="py-2.5">${format(bill.totalDue)}</td>
                        <td class="py-2.5 text-emerald-400">${format(bill.totalPaid)}</td>
                        <td class="py-2.5 font-bold text-rose-400">${format(bill.remaining)}</td>
                        <td class="py-2.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                          bill.status === 'متبقي' ? 'bg-amber-950 text-amber-300' : 'bg-rose-950 text-rose-300'
                        }">${escapeHtml(bill.status)}</span></td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>
      `;
    } catch (err: any) {
      reportEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${escapeHtml(
        err?.message || err
      )}</div>`;
    }
  }
}
