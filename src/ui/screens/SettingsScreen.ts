/**
 * src/ui/screens/SettingsScreen.ts
 * Settings Screen: Generator profile, subscription/license state, OPFS
 * storage statistics, backup & restore.
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { licenseManager } from '../../license/license.ts';
import { backupManager, type BackupSnapshot } from '../../backup/backup.ts';
import { getEntitlement, type Entitlement } from '../../services/entitlementService.ts';
import { authService } from '../../services/authService.ts';
import { APP_CONFIG } from '../../config/app-config.ts';
import { escapeHtml } from '../../utils/security.ts';
import type { AppSettings, LicenseStatus, Tenant, TenantPlan, TenantStatus } from '../../types/index.ts';

const PLAN_LABELS: Record<TenantPlan, string> = {
  trial: 'فترة تجريبية',
  monthly: 'اشتراك شهري',
  yearly: 'اشتراك سنوي',
  lifetime: 'ترخيص دائمي (مدى الحياة)',
};

const STATUS_LABELS: Record<TenantStatus, string> = {
  active: 'ساري (نشط)',
  trial: 'تجريبي',
  expired: 'منتهي',
  blocked: 'موقوف',
  pending: 'قيد المراجعة',
};

function normalizePhone(value: string): string {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.startsWith('964')) digits = `0${digits.slice(3)}`;
  return digits;
}

export class SettingsScreen {
  private container: HTMLElement;
  private settings: AppSettings | null = null;
  private entitlement: Entitlement | null = null;
  private licenseStatus: LicenseStatus | null = null;
  private tenant: Tenant | null = null;
  private snapshots: BackupSnapshot[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(): Promise<void> {
    this.container.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل الإعدادات...</div>';

    this.settings = await db.getSettings();
    this.entitlement = await getEntitlement();
    this.licenseStatus = this.entitlement.status;
    this.tenant = this.entitlement.tenant;
    this.snapshots = await backupManager.listOpfsSnapshots();
    const storageEst = await db.getStorageEstimate();

    const settings = this.settings;
    const status = this.licenseStatus;
    const tenant = this.tenant;

    this.container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'space-y-5 pb-8';

    // 1. Header
    const header = document.createElement('div');
    header.innerHTML = `
      <h2 class="text-xl font-black text-white flex items-center gap-2">⚙️ إعدادات المنظومة والترخيص</h2>
      <p class="text-xs text-slate-400">تخصيص بيانات المولدة، حالة الاشتراك، والنسخ الاحتياطي الدائم</p>
    `;
    root.appendChild(header);

    // 2. Subscription & License Card
    const licCard = document.createElement('section');
    licCard.className = 'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-xs';

    const source = this.entitlement?.source || 'expired';
    const daysLeft = status.trialDaysRemaining;
    const expiryDate = status.licenseExpiryDate;

    const isLifetime =
      (source === 'license' && !expiryDate) ||
      (tenant && new Date(tenant.expiresAt).getFullYear() > 2090) ||
      (tenant?.plan === 'lifetime');

    const sourceMeta =
      source === 'license'
        ? {
            title: isLifetime ? '👑 رخصة المنظومة: تفعيل دائمي (مدى الحياة)' : '🛡️ رخصة المنظومة: اشتراك سنوي مفعّل',
            badge: isLifetime ? 'نسخة دائمية مرخصة' : 'اشتراك سنوي ساري',
            badgeClass: 'bg-emerald-950 text-emerald-300 border border-emerald-700/60',
            tone: 'text-emerald-400',
          }
        : source === 'subscription'
          ? {
              title: isLifetime ? '👑 اشتراك المنصة: ترخيص دائمي' : '✅ اشتراك المنصة: ساري (سنوي)',
              badge: isLifetime ? 'دائمي' : daysLeft > 0 ? `متبقي ${daysLeft} يوماً` : 'ساري',
              badgeClass: 'bg-emerald-950 text-emerald-300 border border-emerald-700/60',
              tone: 'text-emerald-400',
            }
          : source === 'trial'
            ? {
                title: '⏳ رخصة المنظومة: فترة تجريبية مجانية',
                badge: daysLeft > 0 ? `متبقي ${daysLeft} يوماً` : 'انتهت الفترة التجريبية',
                badgeClass:
                  daysLeft > 0
                    ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-700/60',
                tone: daysLeft > 0 ? 'text-amber-400' : 'text-rose-400',
              }
            : source === 'blocked'
              ? {
                  title: '⛔ حساب المولدة: موقوف من إدارة المنصة',
                  badge: 'موقوف',
                  badgeClass: 'bg-rose-950 text-rose-300 border border-rose-700/60',
                  tone: 'text-rose-400',
                }
              : {
                  title: '⌛ رخصة المنظومة: منتهية الصلاحية',
                  badge: 'انتهى الاشتراك',
                  badgeClass: 'bg-rose-950 text-rose-300 border border-rose-700/60',
                  tone: 'text-rose-400',
                };

    const description =
      source === 'license'
        ? (isLifetime
            ? `المنظومة مرخصة بـ <strong>ترخيص دائمي (مدى الحياة)</strong> لصالح <strong>${escapeHtml(status.generatorName || settings.generatorName)}</strong> بدون أي رسوم تجديد دورية. تعمل أوفلاين 100%.`
            : `المنظومة مفعّلة بـ <strong>اشتراك سنوي</strong> ساري حتى <strong>${escapeHtml(this.formatDate(expiryDate))}</strong> لصالح <strong>${escapeHtml(status.generatorName || settings.generatorName)}</strong>. تعمل أوفلاين 100%.`)
        : source === 'subscription'
          ? (isLifetime
              ? `اشتراك هذه المولدة <strong>دائمي مدى الحياة</strong> في المنظومة.`
              : `اشتراك هذه المولدة ساري حتى <strong>${escapeHtml(this.formatDate(expiryDate))}</strong>. يمكنك إضافة المشتركين وإصدار القوائم وتسجيل المصاريف بشكل طبيعي.`)
          : source === 'trial'
            ? `أنت في فترة التجربة المجانية بكامل المزايا. عند انتهاء الفترة يمكنك الاستعراض والطباعة والتصدير، لكن إضافة سجلات جديدة تتوقف حتى إدخال كود ترخيص أو تجديد الاشتراك (سنوي أو دائمي).`
            : source === 'blocked'
              ? 'تم إيقاف حساب هذه المولدة من قبل إدارة المنصة. جميع بياناتك محفوظة ويمكنك استعراضها وتصديرها، لكن إضافة سجلات جديدة غير متاحة حتى يُعاد التفعيل.'
              : 'انتهى اشتراك هذه المولدة. جميع بياناتك محفوظة ويمكنك استعراضها وطباعتها وتصديرها، لكن إضافة سجلات جديدة متوقفة حتى إدخال كود ترخيص (سنوي أو دائمي).';

    const tenantInfo = tenant
      ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span class="text-slate-400 block text-[10px]">المولدة الحالية</span>
            <span class="font-bold text-white">${escapeHtml(tenant.name)}</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span class="text-slate-400 block text-[10px]">الخطة / الحالة</span>
            <span class="font-bold ${sourceMeta.tone}">${escapeHtml(isLifetime ? 'ترخيص دائمي' : (PLAN_LABELS[tenant.plan] || tenant.plan))} • ${escapeHtml(STATUS_LABELS[tenant.status] || tenant.status)}</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span class="text-slate-400 block text-[10px]">تاريخ انتهاء الاشتراك</span>
            <span class="font-bold text-slate-200">${escapeHtml(isLifetime ? 'مدى الحياة (دائم)' : this.formatDate(tenant.expiresAt))}</span>
          </div>
          <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span class="text-slate-400 block text-[10px]">المتبقي</span>
            <span class="font-bold ${sourceMeta.tone}">${escapeHtml(isLifetime ? 'ساري دائماً ♾️' : this.remainingLabel(tenant.expiresAt))}</span>
          </div>
        </div>
      `
      : '';

    const genName = tenant?.name || settings.generatorName || 'مولدتي الأهلية';
    const ownerName = tenant?.ownerName || 'صاحب المولدة';
    const ownerPhone = tenant?.phone || settings.ownerPhone || '';
    const waText = `السلام عليكم ورحمة الله،
أود تفعيل / تجديد ترخيص منظومة أمبيرجي لإدارة المولدات:
• اسم المولدة: ${genName}
• صاحب المولدة: ${ownerName}
${ownerPhone ? `• رقم الهاتف: ${ownerPhone}\n` : ''}• نوع التفعيل المطلوب: (سنوي / دائمي)`;

    const whatsappUrl = `https://wa.me/${APP_CONFIG.support.whatsapp}?text=${encodeURIComponent(waText)}`;
    const phoneUrl = `tel:${APP_CONFIG.support.phone}`;

    licCard.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="text-sm font-black text-white flex items-center gap-2">${sourceMeta.title}</h3>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-black ${sourceMeta.badgeClass}">
          ${escapeHtml(sourceMeta.badge)}
        </span>
      </div>

      <p class="text-slate-300 leading-relaxed">${description}</p>
      ${tenantInfo}

      <!-- Contact Support & WhatsApp Renewal Card -->
      <div class="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/70 to-slate-800/90 border border-cyan-800/70 space-y-2.5">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-xl">⚡</span>
            <div>
              <span class="font-bold text-white block text-xs">طلب كود تفعيل المنظومة (سنوي أو دائمي)</span>
              <span class="text-[11px] text-slate-300">للحصول على كود ترخيص أو التجديد، تواصل مع صاحب ومطور التطبيق:</span>
            </div>
          </div>
          <span class="text-[11px] font-mono text-cyan-300 font-bold bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-700">
            ${escapeHtml(APP_CONFIG.support.phone)}
          </span>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 pt-1">
          <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"
            class="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 no-underline cursor-pointer">
            <span class="text-base">💬</span>
            <span>مراسلة واتساب (رسالة تفعيل جاهزة)</span>
          </a>
          <a href="${phoneUrl}"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5 no-underline cursor-pointer">
            <span class="text-base">📞</span>
            <span>اتصال مباشر (${escapeHtml(APP_CONFIG.support.phone)})</span>
          </a>
        </div>
      </div>

      <div class="space-y-2 pt-3 border-t border-slate-800">
        <label class="block text-slate-400 font-bold">تفعيل أو استبدال كود الترخيص الرقمي:</label>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="text" id="license-key-input" placeholder="AMPEREJI-..." value="${escapeHtml(settings.licenseKey || '')}"
            class="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono focus:border-cyan-500 focus:outline-none" />
          <button type="button" id="activate-license-btn"
            class="min-h-[44px] px-5 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer">
            تفعيل الآن
          </button>
        </div>
        <div id="license-feedback" class="text-[11px] mt-1"></div>
      </div>
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
            <input type="text" id="set-gen-name" required value="${escapeHtml(settings.generatorName)}"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-slate-300 font-bold mb-1">رقم هاتف المولدة</label>
            <input type="tel" id="set-phone" value="${escapeHtml(settings.ownerPhone)}" placeholder="077XXXXXXXX"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-300 font-bold mb-1">سعر الأمبير الافتراضي (د.ع)</label>
            <input type="number" id="set-price" min="1000" step="250" required value="${escapeHtml(settings.defaultAmperePrice)}"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-slate-300 font-bold mb-1">عملة النظام</label>
            <input type="text" id="set-currency" required value="${escapeHtml(settings.currency)}"
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

      <div class="flex flex-wrap items-center gap-3 pt-2">
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
        <p class="text-slate-500 text-[11px] mt-1">آخر تصدير خارجي: ${escapeHtml(this.formatDate(settings.lastExternalExport, 'لم يتم بعد'))}</p>
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
                  <span class="font-mono text-cyan-300">${escapeHtml(s.name)}</span>
                  <span class="text-slate-400">${escapeHtml(s.dateStr)}</span>
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

    // 6. Security & Session Management (تسجيل الخروج وإدارة الجلسة)
    const session = authService.getSession();
    const isSuperAdmin = authService.isSuperAdmin();

    const sessionRoleLabel = isSuperAdmin
      ? `مدير المنصة (${escapeHtml(session?.username || 'admin')})`
      : session?.role === 'tenant_owner'
        ? `صاحب المولدة (${escapeHtml(session.username)})`
        : `صاحب المولدة (${escapeHtml(tenant?.ownerName || 'المشغل المعتمد')})`;

    const sessionTypeBadge = isSuperAdmin
      ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-black bg-purple-950 text-purple-300 border border-purple-800/60">مدير عام 🛡️</span>'
      : '<span class="px-2.5 py-1 rounded-full text-[11px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800/60">جلسة تشغيل نشطة ⚡</span>';

    const securityCard = document.createElement('section');
    securityCard.className = 'p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-xs';
    securityCard.innerHTML = `
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 class="text-sm font-black text-white flex items-center gap-2">🔐 الأمان وإدارة الجلسة</h3>
          <p class="text-slate-400 text-[11px] mt-0.5">التحكم في جلسة الاستخدام الحالية وقفل المنظومة</p>
        </div>
        ${sessionTypeBadge}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
          <span class="text-slate-400 block text-[10px]">المستخدم الحالي</span>
          <span class="font-bold text-white">${sessionRoleLabel}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
          <span class="text-slate-400 block text-[10px]">المولدة النشطة</span>
          <span class="font-bold text-cyan-300">${escapeHtml(tenant?.name || settings.generatorName)}</span>
        </div>
      </div>

      <div class="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h4 class="font-bold text-slate-200">تسجيل الخروج من المنظومة</h4>
          <p class="text-slate-400 text-[11px] mt-0.5">
            إنهاء الجلسة الحالية وقفل لوحة التحكم للتبديل بين الحسابات أو منع الوصول غير المصرح به
          </p>
        </div>
        <button type="button" id="logout-btn"
          class="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800/70 font-bold text-xs shadow-md transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0">
          <span>تسجيل الخروج</span>
          <span>🚪</span>
        </button>
      </div>
    `;
    root.appendChild(securityCard);

    this.container.appendChild(root);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    // 1. Settings Form submit
    const form = document.getElementById('settings-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const genName = (document.getElementById('set-gen-name') as HTMLInputElement).value.trim();
      const phone = (document.getElementById('set-phone') as HTMLInputElement).value.trim();
      const price = parseFloat((document.getElementById('set-price') as HTMLInputElement).value);
      const currency = (document.getElementById('set-currency') as HTMLInputElement).value.trim();

      if (!genName) {
        alert('اسم المولدة مطلوب');
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        alert('سعر الأمبير غير صالح');
        return;
      }

      try {
        await db.updateCurrentTenantProfile({
          generatorName: genName,
          ownerPhone: phone,
          defaultAmperePrice: price,
          currency: currency || 'د.ع',
        });
        alert('تم حفظ إعدادات المولدة ومزامنتها مع اشتراك المنصة بنجاح!');
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
      if (!res.isValid || !res.payload) {
        if (licFeedback) {
          licFeedback.innerHTML = `<span class="text-rose-400">❌ ${escapeHtml(res.error || 'كود ترخيص غير صالح')}</span>`;
        }
        return;
      }
      if (res.payload.system !== 'ampereji') {
        if (licFeedback) licFeedback.innerHTML = '<span class="text-rose-400">❌ هذا الكود لا يخص منظومة أمبيرجي</span>';
        return;
      }

      const tenant = this.tenant;
      if (!tenant) {
        if (licFeedback) licFeedback.innerHTML = '<span class="text-rose-400">❌ لا توجد مولدة حالية لربط الترخيص بها</span>';
        return;
      }

      const licensePhone = normalizePhone(res.payload.ownerPhone);
      const tenantPhone = normalizePhone(tenant.phone);
      if (licensePhone && tenantPhone && licensePhone !== tenantPhone) {
        const proceed = confirm(
          `تنبيه: كود الترخيص صادر لرقم هاتف مختلف (${res.payload.ownerPhone}).\nهل أنت متأكد من ربطه بهذه المولدة؟`
        );
        if (!proceed) return;
      }

      try {
        const applied = await db.applyLicenseToTenant(tenant.id, code);
        alert(`🎉 تهانينا! تم تفعيل ترخيص المنظومة بنجاح لصالح: ${applied.generatorName}`);
        await this.render();
      } catch (err: any) {
        if (licFeedback) {
          licFeedback.innerHTML = `<span class="text-rose-400">❌ ${escapeHtml(err.message || 'فشل تفعيل الترخيص')}</span>`;
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
            integrityFeedback.innerHTML = `<span class="text-rose-400 font-bold">⚠️ تم رصد أخطاء: ${escapeHtml(res.details.join(', '))}</span>`;
          }
        }
      } catch (err: any) {
        if (integrityFeedback) integrityFeedback.innerHTML = `<span class="text-rose-400">خطأ: ${escapeHtml(err.message)}</span>`;
      }
    });

    // 5. Export Backup
    const exportBtn = document.getElementById('export-backup-btn');
    exportBtn?.addEventListener('click', async () => {
      try {
        await backupManager.exportDatabaseFile();
        this.settings = await db.getSettings();
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
        if (res.success && db.isUsingOpfs()) {
          // OPFS files persist across reloads; start clean with the restored DB.
          // In RAM mode importDatabaseBinary already emits db-reloaded, so the
          // current tab re-renders with the restored data instead of losing it
          // to a reload the in-memory engine cannot survive.
          window.location.reload();
        }
      } catch (err: any) {
        alert(`فشلت الاستعادة: ${err.message}`);
      } finally {
        restoreInput.value = '';
      }
    });

    // 7. Logout button
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => {
      const confirmed = confirm(
        'هل أنت متأكد من تسجيل الخروج؟\n\nسيتم إنهاء الجلسة الحالية وقفل لوحة التحكم للتبديل أو الحماية.'
      );
      if (!confirmed) return;

      authService.logout();
      sessionStorage.clear();

      // Navigate to login / lock screen
      window.location.hash = '#login';
    });
  }

  private formatDate(value: string | null | undefined, fallback: string = 'غير محدد'): string {
    if (!value) return fallback;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return fallback;
    return new Date(time).toLocaleDateString('ar-IQ');
  }

  private remainingLabel(value: string | null | undefined): string {
    if (!value) return 'غير محدد';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'غير محدد';
    const days = Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000));
    if (days > 0) return `${days} يوماً`;
    if (days === 0) return 'ينتهي اليوم';
    return `منتهي منذ ${Math.abs(days)} يوم`;
  }
}
