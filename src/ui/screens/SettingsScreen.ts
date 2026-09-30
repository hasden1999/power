/**
 * src/ui/screens/SettingsScreen.ts
 * Settings Screen: Generator profile, offline licensing, OPFS storage stats, backup & restore
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { licenseManager } from '../../license/license.ts';
import { backupManager, type BackupSnapshot } from '../../backup/backup.ts';
import type { AppSettings, LicenseStatus } from '../../types/index.ts';

export class SettingsScreen {
  private container: HTMLElement;
  private settings: AppSettings | null = null;
  private licenseStatus: LicenseStatus | null = null;
  private snapshots: BackupSnapshot[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(): Promise<void> {
    this.container.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل الإعدادات...</div>';

    this.settings = await db.getSettings();
    this.licenseStatus = await licenseManager.getStatus(this.settings);
    this.snapshots = await backupManager.listOpfsSnapshots();
    const storageEst = await db.getStorageEstimate();

    this.container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'space-y-5 pb-8';

    // 1. Header
    const header = document.createElement('div');
    header.innerHTML = `
      <h2 class="text-xl font-black text-white flex items-center gap-2">⚙️ إعدادات المنظومة والترخيص</h2>
      <p class="text-xs text-slate-400">تخصيص بيانات المولدة، رخصة الاستخدام، والنسخ الاحتياطي الدائم</p>
    `;
    root.appendChild(header);

    // 2. License & Trial Card
    const licCard = document.createElement('section');
    licCard.className =
      'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-xs';

    const isLic = this.licenseStatus.isLicensed;
    const isTrial = this.licenseStatus.isTrial;
    const daysLeft = this.licenseStatus.trialDaysRemaining;

    licCard.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-black text-white flex items-center gap-2">
          ${isLic ? '🛡️ رخصة المنظومة: مفعّلة ورسمية' : '⏳ رخصة المنظومة: فترة تجريبية مجانية'}
        </h3>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-black ${
          isLic
            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
            : daysLeft > 0
              ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
              : 'bg-rose-950 text-rose-300 border border-rose-700/60'
        }">
          ${isLic ? 'نسخة مرخصة بالكامل' : daysLeft > 0 ? `متبقي ${daysLeft} يوماً` : 'انتهت الفترة التجريبية'}
        </span>
      </div>

      <p class="text-slate-300 leading-relaxed">
        ${
          isLic
            ? `المنظومة مفعلة بنجاح لصالح: <strong>${this.licenseStatus.generatorName}</strong>. تعمل أوفلاين 100% بدون أي خوادم خارجية.`
            : daysLeft > 0
              ? `أنت في فترة التجربة المجانية لمدة 30 يوماً بكامل المزايا. عند انتهاء الفترة، لن تتمكن من إضافة سجلات جديدة ولكن ستبقى بياناتك وقراءاتك وتقاريرك وطباعة وصولاتك متاحة دائماً.`
              : `انتهت الـ 30 يوماً التجريبية. تم قفل إضافة مشتركين أو وصولات جديدة للحفاظ على سلامة النظام، بينما يمكنك استعراض سجلاتك وطباعتها وتصديرها. لتفعيل النظام يُرجى إدخال كود الترخيص أدناه.`
        }
      </p>

      ${
        !isLic
          ? `
        <div class="space-y-2 pt-2 border-t border-slate-800">
          <label class="block text-slate-400 font-bold">تفعيل المنظومة بكود الترخيص الرقمي:</label>
          <div class="flex gap-2">
            <input type="text" id="license-key-input" placeholder="AMPEREJI-..." value="${this.settings.licenseKey || ''}"
              class="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono focus:border-cyan-500 focus:outline-none" />
            <button type="button" id="activate-license-btn"
              class="min-h-[44px] px-5 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer">
              تفعيل الآن
            </button>
          </div>
          <div id="license-feedback" class="text-[11px] mt-1"></div>
        </div>
      `
          : `
        <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between text-[11px]">
          <span class="text-slate-400">تاريخ انتهاء الترخيص:</span>
          <span class="font-bold text-emerald-400">${
            this.licenseStatus.licenseExpiryDate
              ? new Date(this.licenseStatus.licenseExpiryDate).toLocaleDateString('ar-IQ')
              : 'دائم مدى الحياة'
          }</span>
        </div>
      `
      }
    `;

    root.appendChild(licCard);

    // 3. Generator Profile Settings
    const profileCard = document.createElement('section');
    profileCard.className = 'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-xs';
    profileCard.innerHTML = `
      <h3 class="text-sm font-black text-white flex items-center gap-2">🏭 بيانات المولدة والتسعيرة</h3>
      <form id="settings-form" class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-300 font-bold mb-1">اسم المولدة (يظهر على الوصولات)</label>
            <input type="text" id="set-gen-name" required value="${this.settings.generatorName}"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-slate-300 font-bold mb-1">رقم هاتف المولدة</label>
            <input type="tel" id="set-phone" value="${this.settings.ownerPhone}" placeholder="077XXXXXXXX"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-300 font-bold mb-1">سعر الأمبير الافتراضي (د.ع)</label>
            <input type="number" id="set-price" min="1000" step="500" required value="${this.settings.defaultAmperePrice}"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-slate-300 font-bold mb-1">عملة النظام</label>
            <input type="text" id="set-currency" required value="${this.settings.currency}"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button type="submit"
            class="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow-md transition active:scale-95 cursor-pointer">
            حفظ البيانات الأساسية
          </button>
        </div>
      </form>
    `;
    root.appendChild(profileCard);

    // 4. Permanent Storage & OPFS Status
    const storageCard = document.createElement('section');
    storageCard.className = 'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 text-xs';

    const usedMb = (storageEst.usage / (1024 * 1024)).toFixed(2);
    const quotaMb = (storageEst.quota / (1024 * 1024)).toFixed(0);

    storageCard.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-black text-white flex items-center gap-2">💾 حالة التخزين الدائم (OPFS)</h3>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${
          storageEst.isPersisted
            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            : 'bg-amber-950 text-amber-300 border border-amber-800'
        }">
          ${storageEst.isPersisted ? 'تخزين دائم محمي' : 'تخزين قياسي'}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div class="p-3 rounded-xl bg-slate-800/60">
          <span class="text-slate-400 block text-[10px]">نوع المحرك</span>
          <span class="text-sm font-bold text-cyan-400">${storageEst.isOpfs ? 'SQLite OPFS الدائم' : 'ذاكرة مؤقتة (:memory:)'}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/60">
          <span class="text-slate-400 block text-[10px]">المساحة المستهلكة</span>
          <span class="text-sm font-bold text-white">${usedMb} ميغابايت</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/60">
          <span class="text-slate-400 block text-[10px]">حصة التخزين المتاحة</span>
          <span class="text-sm font-bold text-slate-300">${quotaMb} ميغابايت</span>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button type="button" id="req-persist-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer">
          طلب تثبيت الحماية الدائمة (navigator.storage.persist)
        </button>
        <button type="button" id="check-integrity-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold cursor-pointer">
          فحص سلامة الجداول (PRAGMA integrity_check)
        </button>
      </div>
      <div id="integrity-feedback" class="text-[11px] mt-1"></div>
    `;
    root.appendChild(storageCard);

    // 5. Backup & Restore Section
    const backupCard = document.createElement('section');
    backupCard.className = 'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-xs';
    backupCard.innerHTML = `
      <div>
        <h3 class="text-sm font-black text-white flex items-center gap-2">🔄 النسخ الاحتياطي والاستعادة</h3>
        <p class="text-slate-400 text-[11px] mt-0.5">احفظ ملف قاعدة بيانات SQLite على هاتفك أو استعد بياناتك السابقة</p>
      </div>

      <div class="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" id="export-backup-btn"
          class="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-2">
          📥 تصدير نسخة احتياطية (.sqlite)
        </button>

        <label class="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center gap-2">
          <span>📤 استعادة من ملف SQLite</span>
          <input type="file" id="restore-file-input" accept=".sqlite,.db,.sqlite3" class="hidden" />
        </label>
      </div>

      <!-- Recent Internal Snapshots -->
      <div class="space-y-2 pt-3 border-t border-slate-800">
        <h4 class="font-bold text-slate-300">اللقطات الداخلية المحفوظة تلقائياً في OPFS (آخر ${this.snapshots.length} نسخ):</h4>
        ${
          this.snapshots.length === 0
            ? '<div class="text-slate-500 text-[11px]">لا توجد لقطات محفوظة بعد (تنشأ تلقائياً كل 50 تعديلاً).</div>'
            : `
            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              ${this.snapshots
                .map(
                  (s) => `
                <div class="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between text-[11px]">
                  <span class="font-mono text-cyan-300">${s.name}</span>
                  <span class="text-slate-400">${s.dateStr}</span>
                  <span class="text-slate-500">${(s.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
              `
                )
                .join('')}
            </div>
          `
        }
      </div>
    `;
    root.appendChild(backupCard);

    this.container.appendChild(root);

    // Attach Event Listeners
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    // 1. Settings Form submit
    const form = document.getElementById('settings-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const genName = (document.getElementById('set-gen-name') as HTMLInputElement).value;
      const phone = (document.getElementById('set-phone') as HTMLInputElement).value;
      const price = parseFloat((document.getElementById('set-price') as HTMLInputElement).value);
      const currency = (document.getElementById('set-currency') as HTMLInputElement).value;

      try {
        await db.updateSettings({
          generatorName: genName,
          ownerPhone: phone,
          defaultAmperePrice: price,
          currency: currency,
        });
        alert('تم حفظ إعدادات المولدة بنجاح!');
        await this.render();
      } catch (err: any) {
        alert(`فشل الحفظ: ${err.message}`);
      }
    });

    // 2. License Activation button
    const actBtn = document.getElementById('activate-license-btn');
    const licInput = document.getElementById('license-key-input') as HTMLInputElement;
    const licFeedback = document.getElementById('license-feedback');

    actBtn?.addEventListener('click', async () => {
      const code = licInput?.value.trim();
      if (!code) {
        if (licFeedback) licFeedback.innerHTML = '<span class="text-rose-400">يرجى إدخال كود الترخيص</span>';
        return;
      }

      if (licFeedback) licFeedback.innerHTML = '<span class="text-slate-400">جاري فحص التوقيع الرقمي للرخصة...</span>';

      const res = await licenseManager.verifyLicense(code);
      if (res.isValid && res.payload) {
        await db.updateSettings({ licenseKey: code });
        alert(`🎉 تهانينا! تم تفعيل ترخيص المنظومة بنجاح لصالح: ${res.payload.generatorName}`);
        await this.render();
      } else {
        if (licFeedback) {
          licFeedback.innerHTML = `<span class="text-rose-400">❌ ${res.error || 'كود ترخيص غير صالح'}</span>`;
        }
      }
    });

    // 3. Request Storage Persist button
    const persistBtn = document.getElementById('req-persist-btn');
    persistBtn?.addEventListener('click', async () => {
      if (typeof navigator.storage?.persist === 'function') {
        const granted = await navigator.storage.persist();
        alert(
          granted
            ? 'تم منح تصريح التخزين الدائم بنجاح! بياناتك محمية الآن من الحذف الدوري.'
            : 'رفض المتصفح تصريح التخزين الدائم. ثبّت التطبيق كـ PWA أولاً للحصول على التصريح الكامل.'
        );
        await this.render();
      } else {
        alert('ميزة التخزين الدائم غير مدعومة في متصفحك الحالي.');
      }
    });

    // 4. Integrity Check button
    const integrityBtn = document.getElementById('check-integrity-btn');
    const integrityFeedback = document.getElementById('integrity-feedback');
    integrityBtn?.addEventListener('click', async () => {
      if (integrityFeedback) integrityFeedback.innerHTML = '<span class="text-slate-400">جاري فحص الجداول...</span>';
      try {
        const res = await db.checkIntegrity();
        if (res.ok) {
          if (integrityFeedback) {
            integrityFeedback.innerHTML =
              '<span class="text-emerald-400 font-bold">✅ جميع الجداول والفهارس سليمة 100% (PRAGMA integrity_check: ok)</span>';
          }
        } else {
          if (integrityFeedback) {
            integrityFeedback.innerHTML = `<span class="text-rose-400 font-bold">⚠️ تم رصد أخطاء: ${res.details.join(', ')}</span>`;
          }
        }
      } catch (err: any) {
        if (integrityFeedback) integrityFeedback.innerHTML = `<span class="text-rose-400">خطأ: ${err.message}</span>`;
      }
    });

    // 5. Export Backup
    const exportBtn = document.getElementById('export-backup-btn');
    exportBtn?.addEventListener('click', async () => {
      try {
        await backupManager.exportDatabaseFile();
      } catch (err: any) {
        alert(`فشل تصدير النسخة: ${err.message}`);
      }
    });

    // 6. Restore Backup
    const restoreInput = document.getElementById('restore-file-input') as HTMLInputElement;
    restoreInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const confirmMsg =
        'تحذير أمني هام:\nاستعادة نسخة احتياطية ستقوم باستبدال قاعدة البيانات الحالية بالكامل بالبيانات الموجودة في الملف المختار.\n(سيتم أخذ نسخة وقائية تلقائية قبل الاستبدال).\n\nهل ترغب بالمتابعة؟';

      if (!confirm(confirmMsg)) {
        restoreInput.value = '';
        return;
      }

      try {
        const res = await backupManager.restoreDatabaseFromFile(file);
        alert(res.message);
        if (res.success) {
          window.location.reload();
        }
      } catch (err: any) {
        alert(`فشلت الاستعادة: ${err.message}`);
      } finally {
        restoreInput.value = '';
      }
    });
  }
}
