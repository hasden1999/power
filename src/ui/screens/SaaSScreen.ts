/**
 * src/ui/screens/SaaSScreen.ts
 * SaaS Platform Owner / Super Admin Control Panel
 * Multi-Tenant Management, Centralized Subscribers Management & Licensing Cockpit
 * Mobile-First Vanilla TypeScript
 *
 * Access is protected by the local Super Admin account (authService):
 *   - a real username/password login (PBKDF2), not a hard-coded password
 *   - the session is validated against the database on every render
 *   - the private licensing key never ships with the app; licenses are issued
 *     with tools/generate-license.js and pasted into this cockpit.
 */

import { db } from '../../db/database.ts';
import { authService } from '../../services/authService.ts';
import type { AuthSession } from '../../services/authService.ts';
import { licenseManager } from '../../license/license.ts';
import type { DecodedLicensePayload } from '../../license/license.ts';
import { escapeHtml, csvCell } from '../../utils/security.ts';
import { registerTenantModal } from '../components/RegisterTenantModal.ts';
import type {
  Tenant,
  TenantPlan,
  SaaSStats,
  AdminSubscriberView,
  LineStatus,
  LineType,
} from '../../types/index.ts';

type AdminTab = 'tenants' | 'subscribers';

const PLAN_LABELS: Record<TenantPlan, string> = {
  trial: 'فترة تجريبية',
  monthly: 'اشتراك شهري',
  yearly: 'اشتراك سنوي',
  lifetime: 'ترخيص دائمي (مدى الحياة)',
};

const TENANT_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'الكل', label: 'الكل' },
  { id: 'active', label: 'ساري (نشط)' },
  { id: 'trial', label: 'تجريبي (30 يوم)' },
  { id: 'expired', label: 'منتهي الصلاحية' },
  { id: 'blocked', label: 'محظور' },
];

const SUB_STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'الكل', label: 'الكل' },
  { id: 'نشط', label: 'نشط ⚡' },
  { id: 'مقطوع', label: 'مقطوع 🚫' },
  { id: 'معلق', label: 'معلق ⏸️' },
];

const LINE_STATUSES: LineStatus[] = ['نشط', 'مقطوع', 'معلق'];
const LINE_TYPES: LineType[] = ['عادي', 'ذهبي', 'ليلي', 'صباحي'];

function normalizePhone(value: string): string {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.startsWith('964')) digits = `0${digits.slice(3)}`;
  return digits;
}

function normalizeName(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function daysRemaining(expiresAt: string): number | null {
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err || 'خطأ غير متوقع');
}

export class SaaSScreen {
  private container: HTMLElement;
  private tenants: Tenant[] = [];
  private allSubscribers: AdminSubscriberView[] = [];
  private stats: SaaSStats | null = null;
  private activeTab: AdminTab = 'subscribers';

  // Tenants filter & search
  private searchQuery: string = '';
  private currentFilter: string = 'الكل';

  // Subscribers filter & search
  private subSearchQuery: string = '';
  private subStatusFilter: string = 'الكل';
  private subTenantFilter: string = 'الكل';

  // Modal reference
  private subscriberModal: HTMLElement | null = null;

  // Debounce & request ordering
  private tenantSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriberSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribersRequestId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(): Promise<void> {
    const session = await authService.validateSession();
    this.container.innerHTML = '';

    if (!session || session.role !== 'super_admin') {
      this.renderLogin();
      return;
    }

    this.renderDashboard(session);
  }

  /* ====================================================
   * LOGIN
   * ==================================================== */

  private renderLogin(): void {
    const card = document.createElement('div');
    card.className =
      'max-w-md mx-auto my-8 sm:my-12 p-6 rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl text-center space-y-4';

    card.innerHTML = `
      <div class="w-14 h-14 mx-auto rounded-2xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-3xl">
        🛡️
      </div>
      <div>
        <h3 class="text-lg font-black text-white">لوحة تحكم مدير المنصة</h3>
        <p class="text-xs text-slate-400 mt-1">منطقة مخصصة لصاحب المنصة لإدارة المولدات والمشتركين والتراخيص</p>
      </div>

      <form id="admin-login-form" class="space-y-3 pt-2 text-xs" autocomplete="off">
        <div class="text-right">
          <label for="admin-username-input" class="block text-slate-300 font-bold mb-1">اسم المستخدم</label>
          <input type="text" id="admin-username-input" name="username" value="admin" required
            autocomplete="username" spellcheck="false"
            class="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none" />
        </div>
        <div class="text-right">
          <label for="admin-pass-input" class="block text-slate-300 font-bold mb-1">كلمة المرور</label>
          <input type="password" id="admin-pass-input" name="password" required
            autocomplete="current-password" placeholder="••••••••"
            class="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none" />
        </div>
        <button type="submit" id="admin-login-btn"
          class="w-full min-h-[46px] py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-sm shadow-lg transition active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-wait">
          دخول لوحة الإدارة 🚀
        </button>
      </form>

      <div id="admin-login-error" class="text-rose-400 text-xs min-h-[18px] leading-relaxed" role="alert"></div>

      <div class="pt-2 border-t border-slate-800">
        <button type="button" id="admin-login-back"
          class="min-h-[40px] px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 cursor-pointer">
          ← العودة إلى تطبيق المولدة
        </button>
      </div>

      <p class="text-[10px] text-slate-500 leading-relaxed">
        بيانات الدخول الافتراضية موضحة في دليل التثبيت (README). غيّر كلمة المرور فور أول دخول.
      </p>
    `;

    const form = card.querySelector<HTMLFormElement>('#admin-login-form');
    const usernameInput = card.querySelector<HTMLInputElement>('#admin-username-input');
    const passwordInput = card.querySelector<HTMLInputElement>('#admin-pass-input');
    const submitBtn = card.querySelector<HTMLButtonElement>('#admin-login-btn');
    const errorEl = card.querySelector<HTMLElement>('#admin-login-error');

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!usernameInput || !passwordInput || !submitBtn || !errorEl) return;

      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري التحقق…';

      try {
        const result = await authService.loginAdmin(usernameInput.value, passwordInput.value);
        if (!result.success) {
          errorEl.textContent = result.error || 'تعذر تسجيل الدخول';
          return;
        }
        await this.render();
      } catch (err) {
        errorEl.textContent = errorMessage(err);
      } finally {
        if (submitBtn.isConnected) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'دخول لوحة الإدارة 🚀';
        }
      }
    });

    card.querySelector('#admin-login-back')?.addEventListener('click', () => this.goToApp());
    this.container.appendChild(card);
    usernameInput?.focus();
  }

  /* ====================================================
   * DASHBOARD SHELL
   * ==================================================== */

  private renderDashboard(session: AuthSession): void {
    const root = document.createElement('div');
    root.className = 'space-y-5 pb-10';

    // 1. Header & actions
    const header = document.createElement('div');
    header.className = 'flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-xl font-black text-white flex items-center gap-2';
    title.textContent = '🛡️ لوحة تحكم مدير المنصة';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'إدارة المولدات والمشتركين والاشتراكات والتراخيص الرقمية';
    const sessionLine = document.createElement('p');
    sessionLine.className = 'text-[11px] text-slate-500 mt-1';
    sessionLine.textContent = `مسجل الدخول: ${session.username} • تنتهي الجلسة الساعة ${new Date(
      session.expiresAt
    ).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);
    titleGroup.appendChild(sessionLine);

    const actionBtns = document.createElement('div');
    actionBtns.className = 'flex items-center gap-2 flex-wrap';

    const addTenantBtn = this.makeButton(
      '➕ تسجيل مولدة',
      'bg-[#0E7490] hover:bg-cyan-600 text-white shadow-lg'
    );
    addTenantBtn.title = 'تسجيل مولدة جديدة ومنحها فترة تجريبية';
    addTenantBtn.addEventListener('click', () => {
      registerTenantModal.show(
        () => {
          this.activeTab = 'tenants';
          void this.render();
        },
        { switchToTenant: false }
      );
    });

    const addSubBtn = this.makeButton(
      '👥 إضافة مشترك',
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
    );
    addSubBtn.addEventListener('click', () => void this.openSubscriberModal());

    const passwordBtn = this.makeButton(
      '🔐 كلمة المرور',
      'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
    );
    passwordBtn.title = 'تغيير كلمة مرور مدير المنصة';
    passwordBtn.addEventListener('click', () => this.openChangePasswordModal());

    const appBtn = this.makeButton(
      '← التطبيق',
      'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700'
    );
    appBtn.title = 'العودة إلى شاشات إدارة المولدة';
    appBtn.addEventListener('click', () => this.goToApp());

    const logoutBtn = this.makeButton(
      'خروج 🔒',
      'bg-slate-800 hover:bg-rose-950 text-rose-300 border border-slate-700'
    );
    logoutBtn.title = 'إنهاء جلسة الإدارة والعودة للتطبيق';
    logoutBtn.addEventListener('click', () => {
      authService.logout();
      this.goToApp();
    });

    actionBtns.appendChild(addTenantBtn);
    actionBtns.appendChild(addSubBtn);
    actionBtns.appendChild(passwordBtn);
    actionBtns.appendChild(appBtn);
    actionBtns.appendChild(logoutBtn);
    header.appendChild(titleGroup);
    header.appendChild(actionBtns);
    root.appendChild(header);

    // 2. Default-password security warning
    if (authService.isUsingDefaultPassword()) {
      const warn = document.createElement('div');
      warn.className =
        'p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center gap-3';
      warn.innerHTML = `
        <div class="text-2xl shrink-0">🔐</div>
        <div class="flex-1 text-right">
          <div class="font-black text-amber-200 text-xs">أنت تستخدم كلمة المرور الافتراضية</div>
          <p class="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
            غيّر كلمة مرور مدير المنصة الآن لحماية لوحة التحكم من الوصول غير المصرح به.
          </p>
        </div>
        <button type="button" id="default-pass-change"
          class="min-h-[40px] px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs shadow cursor-pointer shrink-0">
          تغيير الآن
        </button>
      `;
      warn.querySelector('#default-pass-change')?.addEventListener('click', () => {
        this.openChangePasswordModal();
      });
      root.appendChild(warn);
    }

    // 3. Tabs
    const tabsBar = document.createElement('div');
    tabsBar.className = 'flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800';

    const subTabBtn = document.createElement('button');
    subTabBtn.type = 'button';
    subTabBtn.className = `flex-1 min-h-[42px] py-2 px-3 rounded-xl font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
      this.activeTab === 'subscribers'
        ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-md'
        : 'text-slate-400 hover:text-slate-200'
    }`;
    subTabBtn.textContent = '👥 إدارة المشتركين المركزية';
    subTabBtn.addEventListener('click', () => {
      if (this.activeTab === 'subscribers') return;
      this.activeTab = 'subscribers';
      void this.render();
    });

    const tenantTabBtn = document.createElement('button');
    tenantTabBtn.type = 'button';
    tenantTabBtn.className = `flex-1 min-h-[42px] py-2 px-3 rounded-xl font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
      this.activeTab === 'tenants'
        ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-md'
        : 'text-slate-400 hover:text-slate-200'
    }`;
    tenantTabBtn.textContent = '🏢 إدارة المولدات والمشاريع';
    tenantTabBtn.addEventListener('click', () => {
      if (this.activeTab === 'tenants') return;
      this.activeTab = 'tenants';
      void this.render();
    });

    tabsBar.appendChild(subTabBtn);
    tabsBar.appendChild(tenantTabBtn);
    root.appendChild(tabsBar);

    // 4. Tab content
    const contentArea = document.createElement('div');
    contentArea.id = 'admin-tab-content';
    root.appendChild(contentArea);

    this.container.appendChild(root);

    if (this.activeTab === 'subscribers') {
      void this.renderSubscribersTab(contentArea);
    } else {
      void this.renderTenantsTab(contentArea);
    }
  }

  private makeButton(label: string, colorClasses: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `min-h-[40px] px-3 py-1.5 rounded-xl font-bold text-xs transition active:scale-95 cursor-pointer ${colorClasses}`;
    button.textContent = label;
    return button;
  }

  /* ====================================================
   * TAB 1: CENTRALIZED SUBSCRIBERS MANAGEMENT
   * ==================================================== */

  private async renderSubscribersTab(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    const section = document.createElement('div');
    section.className = 'space-y-4';

    const statsContainer = document.createElement('div');
    statsContainer.id = 'admin-sub-stats';
    statsContainer.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs';
    section.appendChild(statsContainer);

    const filterCard = document.createElement('div');
    filterCard.className = 'p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3';

    const searchRow = document.createElement('div');
    searchRow.className = 'flex flex-col sm:flex-row gap-2.5';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'بحث باسم المشترك، الهاتف، المحلة، أو اسم المولدة…';
    searchInput.value = this.subSearchQuery;
    searchInput.className =
      'flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500';
    searchInput.addEventListener('input', () => {
      this.subSearchQuery = searchInput.value;
      this.scheduleSubscribersReload();
    });
    searchRow.appendChild(searchInput);

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className =
      'min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 shrink-0';
    exportBtn.textContent = '📥 تصدير CSV';
    exportBtn.addEventListener('click', () => this.exportSubscribersCSV());
    searchRow.appendChild(exportBtn);

    filterCard.appendChild(searchRow);

    const selectsRow = document.createElement('div');
    selectsRow.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs';

    const tenantFilterGroup = document.createElement('div');
    tenantFilterGroup.className = 'flex items-center gap-2';
    const tenantLabel = document.createElement('span');
    tenantLabel.className = 'text-slate-400 font-bold shrink-0';
    tenantLabel.textContent = 'المولدة:';
    const tenantSelect = document.createElement('select');
    tenantSelect.id = 'admin-tenant-select-filter';
    tenantSelect.className =
      'w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500 text-xs';
    tenantSelect.addEventListener('change', () => {
      this.subTenantFilter = tenantSelect.value;
      void this.loadSubscribersData();
    });
    tenantFilterGroup.appendChild(tenantLabel);
    tenantFilterGroup.appendChild(tenantSelect);
    selectsRow.appendChild(tenantFilterGroup);

    const statusFilterGroup = document.createElement('div');
    statusFilterGroup.className = 'flex items-center gap-1.5 overflow-x-auto';
    statusFilterGroup.id = 'admin-sub-status-filters';

    for (const sf of SUB_STATUS_FILTERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.filter = sf.id;
      btn.className = `min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
        this.subStatusFilter === sf.id
          ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
          : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-transparent'
      }`;
      btn.textContent = sf.label;
      btn.addEventListener('click', () => {
        this.subStatusFilter = sf.id;
        statusFilterGroup.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
          button.className =
            'min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-transparent';
        });
        btn.className =
          'min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap bg-cyan-950 text-cyan-300 border border-cyan-700/60';
        void this.loadSubscribersData();
      });
      statusFilterGroup.appendChild(btn);
    }
    selectsRow.appendChild(statusFilterGroup);

    filterCard.appendChild(selectsRow);
    section.appendChild(filterCard);

    const listContainer = document.createElement('div');
    listContainer.id = 'admin-subscribers-list';
    listContainer.className = 'space-y-3';
    section.appendChild(listContainer);

    container.appendChild(section);

    await this.populateTenantFilterDropdown();
    await this.loadSubscribersData();
  }

  private scheduleSubscribersReload(): void {
    if (this.subscriberSearchTimer) clearTimeout(this.subscriberSearchTimer);
    this.subscriberSearchTimer = setTimeout(() => {
      this.subscriberSearchTimer = null;
      void this.loadSubscribersData();
    }, 250);
  }

  private async populateTenantFilterDropdown(): Promise<void> {
    try {
      this.tenants = await db.getTenants();
    } catch (err) {
      console.warn('[Admin] Could not load tenants for the filter:', err);
      return;
    }

    if (this.subTenantFilter !== 'الكل' && !this.tenants.some((t) => t.id === this.subTenantFilter)) {
      this.subTenantFilter = 'الكل';
    }

    const sel = document.getElementById('admin-tenant-select-filter') as HTMLSelectElement | null;
    if (!sel) return;

    sel.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'الكل';
    allOption.textContent = `جميع المولدات والمشاريع (${this.tenants.length})`;
    sel.appendChild(allOption);

    for (const tenant of this.tenants) {
      const option = document.createElement('option');
      option.value = tenant.id;
      option.textContent = `${tenant.name} (${tenant.subscribersCount || 0} مشترك)`;
      sel.appendChild(option);
    }
    sel.value = this.subTenantFilter;
  }

  private async loadSubscribersData(): Promise<void> {
    const listEl = document.getElementById('admin-subscribers-list');
    const statsEl = document.getElementById('admin-sub-stats');
    if (!listEl) return;

    const requestId = ++this.subscribersRequestId;
    listEl.innerHTML =
      '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل بيانات المشتركين عبر المنصة…</div>';

    try {
      const rows = await db.getAllPlatformSubscribers(
        this.subSearchQuery,
        this.subStatusFilter,
        this.subTenantFilter
      );
      if (requestId !== this.subscribersRequestId) return;

      this.allSubscribers = rows;

      if (statsEl) {
        const total = rows.length;
        const active = rows.filter((s) => s.lineStatus === 'نشط').length;
        const disconnected = rows.filter((s) => s.lineStatus !== 'نشط').length;
        const totalAmps = rows.reduce((sum, s) => sum + (Number(s.amperes) || 0), 0);

        statsEl.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">إجمالي المشتركين</span>
            <span class="text-lg font-black text-white">${total.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[10px]">خطوط نشطة</span>
            <span class="text-lg font-black text-emerald-400">${active.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-rose-400 block text-[10px]">مقطوعة / معلقة</span>
            <span class="text-lg font-black text-rose-400">${disconnected.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-amber-400 block text-[10px]">مجموع الأمبيرات</span>
            <span class="text-lg font-black text-amber-400">${totalAmps.toLocaleString('ar-IQ', {
              maximumFractionDigits: 1,
            })} A</span>
          </div>
        `;
      }

      if (rows.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">🔍</div>
            <div class="text-sm font-bold text-slate-300">لا يوجد مشتركون مطابقون للبحث أو الفلتر</div>
            <p class="text-xs text-slate-500 mt-1">يمكنك إضافة مشترك جديد أو تغيير خيارات التصفية أعلاه</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';
      for (const subscriber of rows) {
        listEl.appendChild(this.createSubscriberCard(subscriber));
      }
    } catch (err) {
      if (requestId !== this.subscribersRequestId) return;
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${escapeHtml(
        errorMessage(err)
      )}</div>`;
    }
  }

  private createSubscriberCard(sub: AdminSubscriberView): HTMLElement {
    const currentTenantId = sub.tenantId || 'tenant-default';
    const card = document.createElement('div');
    card.className =
      'p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-md flex flex-col gap-3 text-xs';

    const topRow = document.createElement('div');
    topRow.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2';

    const infoGroup = document.createElement('div');
    const nameEl = document.createElement('h4');
    nameEl.className = 'text-base font-black text-white flex items-center gap-2 flex-wrap';

    const statusBadge = document.createElement('span');
    statusBadge.className = `px-2 py-0.5 rounded text-[10px] font-bold ${
      sub.lineStatus === 'نشط'
        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
        : sub.lineStatus === 'مقطوع'
          ? 'bg-rose-950 text-rose-400 border border-rose-800'
          : 'bg-amber-950 text-amber-400 border border-amber-800'
    }`;
    statusBadge.textContent = sub.lineStatus;

    const tenantBadge = document.createElement('span');
    tenantBadge.className =
      'px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold';
    tenantBadge.textContent = `🏢 ${sub.tenantName || 'مولدة عامة'}`;

    nameEl.innerHTML = `<span>${escapeHtml(sub.fullName)}</span>`;
    nameEl.appendChild(statusBadge);
    nameEl.appendChild(tenantBadge);
    infoGroup.appendChild(nameEl);

    const metaRow = document.createElement('div');
    metaRow.className = 'flex items-center gap-3 text-slate-400 text-[11px] mt-1 flex-wrap';

    const addressText = [
      sub.area,
      sub.neighborhood ? `م ${sub.neighborhood}` : '',
      sub.alley ? `ز ${sub.alley}` : '',
      sub.houseNumber ? `دار ${sub.houseNumber}` : '',
    ]
      .filter(Boolean)
      .join(' / ');

    metaRow.innerHTML = `
      <span class="text-amber-300 font-bold">⚡ ${escapeHtml(sub.amperes)} أمبير (${escapeHtml(sub.lineType)})</span>
      ${sub.phone ? `<span>📞 ${escapeHtml(sub.phone)}</span>` : ''}
      ${addressText ? `<span>📍 ${escapeHtml(addressText)}</span>` : ''}
    `;

    infoGroup.appendChild(metaRow);
    topRow.appendChild(infoGroup);
    card.appendChild(topRow);

    const bottomRow = document.createElement('div');
    bottomRow.className =
      'pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2';

    const statusBtns = document.createElement('div');
    statusBtns.className = 'flex items-center gap-1.5 flex-wrap';

    for (const status of LINE_STATUSES) {
      const button = document.createElement('button');
      button.type = 'button';
      const isCurrent = sub.lineStatus === status;
      button.className = `min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
        isCurrent
          ? status === 'نشط'
            ? 'bg-emerald-600 text-white'
            : status === 'مقطوع'
              ? 'bg-rose-600 text-white'
              : 'bg-amber-600 text-white'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
      }`;
      button.textContent = status;
      if (!isCurrent) {
        button.addEventListener('click', () => void this.changeSubscriberStatus(sub, status, currentTenantId));
      }
      statusBtns.appendChild(button);
    }
    bottomRow.appendChild(statusBtns);

    const actionBtns = document.createElement('div');
    actionBtns.className = 'flex items-center gap-1.5 self-end sm:self-center flex-wrap';

    if (sub.phone) {
      const waBtn = document.createElement('a');
      const cleanPhone = sub.phone.replace(/^0/, '964').replace(/\D/g, '');
      const message = encodeURIComponent(
        `مرحباً أخي ${sub.fullName}، معك إدارة منصة الطاقة والمولدات بخصوص اشتراكك (${sub.amperes} أمبير).`
      );
      waBtn.href = `https://wa.me/${cleanPhone}?text=${message}`;
      waBtn.target = '_blank';
      waBtn.rel = 'noopener noreferrer';
      waBtn.className =
        'min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold transition flex items-center gap-1';
      waBtn.textContent = '💬 واتساب';
      actionBtns.appendChild(waBtn);

      const callBtn = document.createElement('a');
      callBtn.href = `tel:${sub.phone}`;
      callBtn.className =
        'min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-bold transition flex items-center gap-1';
      callBtn.textContent = '📞 اتصال';
      actionBtns.appendChild(callBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer';
    editBtn.textContent = '✏️ تعديل';
    editBtn.addEventListener('click', () => void this.openSubscriberModal(sub));
    actionBtns.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 font-bold cursor-pointer';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'حذف المشترك';
    deleteBtn.addEventListener('click', () => void this.deleteSubscriberRecord(sub, currentTenantId));
    actionBtns.appendChild(deleteBtn);

    bottomRow.appendChild(actionBtns);
    card.appendChild(bottomRow);

    return card;
  }

  private async changeSubscriberStatus(
    sub: AdminSubscriberView,
    status: LineStatus,
    tenantId: string
  ): Promise<void> {
    try {
      await db.updateSubscriberStatus(sub.id, status, tenantId);
      await this.loadSubscribersData();
    } catch (err) {
      alert(`تعذر تحديث حالة الخط: ${errorMessage(err)}`);
    }
  }

  private async deleteSubscriberRecord(sub: AdminSubscriberView, tenantId: string): Promise<void> {
    if (
      !confirm(
        `هل أنت متأكد من حذف المشترك «${sub.fullName}» نهائياً؟\nسيتم حذف سجلات الجباية المرتبطة به أيضاً.`
      )
    ) {
      return;
    }

    try {
      await db.deleteSubscriber(sub.id, tenantId);
      await this.loadSubscribersData();
    } catch (err) {
      alert(`تعذر حذف المشترك: ${errorMessage(err)}`);
    }
  }

  private async openSubscriberModal(sub?: AdminSubscriberView): Promise<void> {
    this.closeSubscriberModal();

    try {
      this.tenants = await db.getTenants();
    } catch (err) {
      alert(`تعذر تحميل قائمة المولدات: ${errorMessage(err)}`);
      return;
    }

    if (this.tenants.length === 0) {
      alert('لا توجد مولدة مسجلة. سجّل مولدة أولاً قبل إضافة المشتركين.');
      return;
    }

    const modal = document.createElement('div');
    modal.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8 text-xs';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-slate-800 pb-3';

    const title = document.createElement('h3');
    title.className = 'text-base font-black text-cyan-400';
    title.textContent = sub ? '✏️ تعديل بيانات المشترك' : '➕ إضافة مشترك جديد للمنصة';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closeSubscriberModal());

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const requestedTenantId = sub?.tenantId || 'tenant-default';
    const selectedTenantId = this.tenants.some((tenant) => tenant.id === requestedTenantId)
      ? requestedTenantId
      : this.tenants[0].id;

    const tenantOptions = this.tenants
      .map((tenant) => {
        const selected = tenant.id === selectedTenantId ? ' selected' : '';
        return `<option value="${escapeHtml(tenant.id)}"${selected}>${escapeHtml(tenant.name)} — ${escapeHtml(
          tenant.ownerName
        )}</option>`;
      })
      .join('');

    const form = document.createElement('form');
    form.className = 'space-y-3.5';

    form.innerHTML = `
      <div>
        <label for="admin-sub-tenant-id" class="block text-slate-300 font-bold mb-1">المولدة / المشروع التابع له <span class="text-rose-400">*</span></label>
        <select id="admin-sub-tenant-id" required
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm font-semibold">
          ${tenantOptions}
        </select>
      </div>

      <div>
        <label for="admin-sub-name" class="block text-slate-300 font-bold mb-1">الاسم الكامل <span class="text-rose-400">*</span></label>
        <input type="text" id="admin-sub-name" required maxlength="120" value="${escapeHtml(
          sub?.fullName || ''
        )}" placeholder="اسم المشترك الثلاثي"
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="admin-sub-phone" class="block text-slate-300 font-bold mb-1">رقم الهاتف</label>
          <input type="tel" id="admin-sub-phone" maxlength="20" value="${escapeHtml(
            sub?.phone || ''
          )}" placeholder="077XXXXXXXX"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>
        <div>
          <label for="admin-sub-amperes" class="block text-slate-300 font-bold mb-1">عدد الأمبيرات <span class="text-rose-400">*</span></label>
          <input type="number" id="admin-sub-amperes" step="0.5" min="0.5" max="1000" required value="${escapeHtml(
            sub?.amperes ?? 1
          )}"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="admin-sub-line-type" class="block text-slate-300 font-bold mb-1">نوع الخط</label>
          <select id="admin-sub-line-type" class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm">
            ${LINE_TYPES.map(
              (type) =>
                `<option value="${type}"${sub?.lineType === type ? ' selected' : ''}>${type}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label for="admin-sub-line-status" class="block text-slate-300 font-bold mb-1">حالة الخط</label>
          <select id="admin-sub-line-status" class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm">
            ${LINE_STATUSES.map(
              (status) =>
                `<option value="${status}"${sub?.lineStatus === status ? ' selected' : ''}>${status}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label for="admin-sub-area" class="block text-slate-400 mb-1">المنطقة</label>
          <input type="text" id="admin-sub-area" maxlength="80" value="${escapeHtml(
            sub?.area || ''
          )}" placeholder="حي السلام"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label for="admin-sub-neighborhood" class="block text-slate-400 mb-1">المحلة</label>
          <input type="text" id="admin-sub-neighborhood" maxlength="40" value="${escapeHtml(
            sub?.neighborhood || ''
          )}" placeholder="605"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label for="admin-sub-alley" class="block text-slate-400 mb-1">الزقاق</label>
          <input type="text" id="admin-sub-alley" maxlength="40" value="${escapeHtml(
            sub?.alley || ''
          )}" placeholder="12"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label for="admin-sub-house" class="block text-slate-400 mb-1">الدار</label>
          <input type="text" id="admin-sub-house" maxlength="40" value="${escapeHtml(
            sub?.houseNumber || ''
          )}" placeholder="4"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
      </div>

      <div>
        <label for="admin-sub-notes" class="block text-slate-300 font-bold mb-1">ملاحظات إضافية</label>
        <textarea id="admin-sub-notes" rows="2" maxlength="500" placeholder="موقع العمود، تفاصيل إضافية…"
          class="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-xs">${escapeHtml(
            sub?.notes || ''
          )}</textarea>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <button type="submit"
          class="flex-1 min-h-[46px] rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-sm shadow transition cursor-pointer">
          ${sub ? '💾 حفظ التعديلات' : '➕ إضافة المشترك'}
        </button>
        <button type="button" id="admin-sub-cancel-btn"
          class="min-h-[46px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 cursor-pointer">
          إلغاء
        </button>
      </div>
    `;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const readValue = (selector: string): string => {
        const element = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
        return element ? element.value.trim() : '';
      };

      const tenantId = readValue('#admin-sub-tenant-id');
      const fullName = readValue('#admin-sub-name');
      const phone = readValue('#admin-sub-phone');
      const amperes = parseFloat(readValue('#admin-sub-amperes'));
      const lineType = readValue('#admin-sub-line-type') as LineType;
      const lineStatus = readValue('#admin-sub-line-status') as LineStatus;
      const area = readValue('#admin-sub-area');
      const neighborhood = readValue('#admin-sub-neighborhood');
      const alley = readValue('#admin-sub-alley');
      const houseNumber = readValue('#admin-sub-house');
      const notes = readValue('#admin-sub-notes');

      if (!tenantId || !this.tenants.some((tenant) => tenant.id === tenantId)) {
        alert('يرجى اختيار مولدة صحيحة');
        return;
      }
      if (!fullName) {
        alert('اسم المشترك مطلوب');
        return;
      }
      if (!Number.isFinite(amperes) || amperes <= 0) {
        alert('عدد الأمبيرات غير صالح');
        return;
      }
      if (!LINE_TYPES.includes(lineType) || !LINE_STATUSES.includes(lineStatus)) {
        alert('نوع الخط أو حالته غير صالح');
        return;
      }

      const payload = {
        fullName,
        phone,
        amperes,
        lineType,
        lineStatus,
        area,
        neighborhood,
        alley,
        houseNumber,
        notes,
        tenantId,
      };

      try {
        if (sub) {
          // Look the subscriber up under its current tenant, then allow the
          // update to move it to another tenant when the admin changed it.
          await db.updateSubscriber(sub.id, payload, sub.tenantId || 'tenant-default');
        } else {
          await db.addSubscriber(payload);
        }
        this.closeSubscriberModal();
        this.activeTab = 'subscribers';
        await this.render();
      } catch (err) {
        alert(`تعذر حفظ المشترك: ${errorMessage(err)}`);
      }
    });

    form.querySelector('#admin-sub-cancel-btn')?.addEventListener('click', () => {
      this.closeSubscriberModal();
    });

    card.appendChild(form);
    modal.appendChild(card);
    document.body.appendChild(modal);
    this.subscriberModal = modal;

    form.querySelector<HTMLInputElement>('#admin-sub-name')?.focus();
  }

  private closeSubscriberModal(): void {
    if (this.subscriberModal?.parentElement) {
      this.subscriberModal.parentElement.removeChild(this.subscriberModal);
    }
    this.subscriberModal = null;
  }

  private exportSubscribersCSV(): void {
    if (this.allSubscribers.length === 0) {
      alert('لا توجد بيانات مشتركين لتصديرها');
      return;
    }

    const headers = [
      'المعرف',
      'المولدة',
      'اسم المشترك',
      'الهاتف',
      'الأمبيرات',
      'نوع الخط',
      'الحالة',
      'المنطقة',
      'المحلة',
      'الزقاق',
      'الدار',
      'ملاحظات',
    ];

    const rows = this.allSubscribers.map((sub) =>
      [
        sub.id,
        sub.tenantName || 'مولدة عامة',
        sub.fullName,
        sub.phone,
        sub.amperes,
        sub.lineType,
        sub.lineStatus,
        sub.area,
        sub.neighborhood,
        sub.alley,
        sub.houseNumber,
        sub.notes || '',
      ]
        .map(csvCell)
        .join(',')
    );

    const csvContent =
      '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `مشتركو_المنصة_المركزية_${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /* ====================================================
   * TAB 2: TENANTS & GENERATORS MANAGEMENT
   * ==================================================== */

  private async renderTenantsTab(container: HTMLElement): Promise<void> {
    container.innerHTML = '';
    const section = document.createElement('div');
    section.className = 'space-y-4';

    const statsContainer = document.createElement('div');
    statsContainer.id = 'saas-stats-container';
    statsContainer.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs';
    section.appendChild(statsContainer);

    const filterSection = document.createElement('div');
    filterSection.className = 'flex flex-col sm:flex-row gap-2.5';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'بحث باسم المولدة، المالك، الهاتف، المحافظة…';
    searchInput.value = this.searchQuery;
    searchInput.className =
      'flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500';
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      if (this.tenantSearchTimer) clearTimeout(this.tenantSearchTimer);
      this.tenantSearchTimer = setTimeout(() => {
        this.tenantSearchTimer = null;
        void this.loadData();
      }, 250);
    });

    const filterGroup = document.createElement('div');
    filterGroup.className = 'flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0';

    for (const filter of TENANT_FILTERS) {
      const filterBtn = document.createElement('button');
      filterBtn.type = 'button';
      filterBtn.className = `min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
        this.currentFilter === filter.id
          ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
      }`;
      filterBtn.textContent = filter.label;
      filterBtn.addEventListener('click', () => {
        this.currentFilter = filter.id;
        filterGroup.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
          button.className =
            'min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent';
        });
        filterBtn.className =
          'min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap bg-cyan-950 text-cyan-300 border border-cyan-700/60';
        void this.loadData();
      });
      filterGroup.appendChild(filterBtn);
    }

    filterSection.appendChild(searchInput);
    filterSection.appendChild(filterGroup);
    section.appendChild(filterSection);

    const listContainer = document.createElement('div');
    listContainer.id = 'saas-tenants-list';
    listContainer.className = 'space-y-3.5';
    section.appendChild(listContainer);

    container.appendChild(section);

    await this.loadData();
  }

  private async loadData(): Promise<void> {
    const listEl = document.getElementById('saas-tenants-list');
    const statsEl = document.getElementById('saas-stats-container');
    if (!listEl) return;

    listEl.innerHTML =
      '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل بيانات المنصة والمولدات…</div>';

    try {
      this.stats = await db.getSaaSStats();
      this.tenants = await db.getTenants(this.searchQuery, this.currentFilter);

      if (statsEl && this.stats) {
        statsEl.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">إجمالي المولدات</span>
            <span class="text-lg font-black text-white">${this.stats.totalTenants.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[10px]">اشتراكات سارية</span>
            <span class="text-lg font-black text-emerald-400">${this.stats.activeTenants.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-cyan-400 block text-[10px]">فترة تجريبية</span>
            <span class="text-lg font-black text-cyan-400">${this.stats.trialTenants.toLocaleString('ar-IQ')}</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-amber-400 block text-[10px]">إجمالي المشتركين</span>
            <span class="text-lg font-black text-amber-400">${this.stats.totalSubscribers.toLocaleString('ar-IQ')}</span>
          </div>
        `;
      }

      if (this.tenants.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">🔍</div>
            <div class="text-sm font-bold text-slate-300">لا توجد مولدات مطابقة للبحث</div>
            <p class="text-xs text-slate-500 mt-1">جرّب تغيير كلمات البحث أو سجّل مولدة جديدة</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';
      for (const tenant of this.tenants) {
        listEl.appendChild(this.createTenantCard(tenant));
      }
    } catch (err) {
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${escapeHtml(
        errorMessage(err)
      )}</div>`;
    }
  }

  private createTenantCard(tenant: Tenant): HTMLElement {
    const isBlocked = Boolean(tenant.isBlocked) || tenant.status === 'blocked';
    const days = daysRemaining(tenant.expiresAt);
    const isExpired = !isBlocked && (tenant.status === 'expired' || (days !== null && days <= 0));
    const isTrial = !isBlocked && !isExpired && tenant.status === 'trial';
    const hasLicense = Boolean(tenant.licenseKey && tenant.licenseKey.trim());

    const card = document.createElement('div');
    card.className = `p-4 sm:p-5 rounded-3xl bg-slate-900 border transition shadow-lg space-y-3.5 text-xs ${
      isBlocked
        ? 'border-rose-900/60 bg-rose-950/10'
        : isExpired
          ? 'border-amber-900/60 bg-amber-950/10'
          : 'border-slate-800 hover:border-slate-700'
    }`;

    const topRow = document.createElement('div');
    topRow.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2';

    const infoGroup = document.createElement('div');

    const statusBadge = isBlocked
      ? '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-bold">محظور</span>'
      : isExpired
        ? '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-bold">منتهي الصلاحية</span>'
        : isTrial
          ? '<span class="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800 font-bold">تجريبي</span>'
          : tenant.status === 'pending'
            ? '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-bold">قيد الانتظار</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">ساري (نشط)</span>';

    const nameEl = document.createElement('h3');
    nameEl.className = 'text-base font-black text-white flex items-center gap-2 flex-wrap';
    nameEl.innerHTML = `<span>${escapeHtml(tenant.name)}</span>${statusBadge}`;

    const metaRow = document.createElement('div');
    metaRow.className = 'flex items-center gap-3 text-slate-400 text-[11px] mt-1 flex-wrap';
    metaRow.innerHTML = `
      <span>👤 المالك: <strong class="text-slate-200">${escapeHtml(tenant.ownerName)}</strong></span>
      <span>📞 ${escapeHtml(tenant.phone || '—')}</span>
      <span>📍 ${escapeHtml(tenant.address || '—')}</span>
      <span class="text-cyan-400 font-bold">👥 ${(tenant.subscribersCount || 0).toLocaleString('ar-IQ')} مشترك</span>
      <span class="${hasLicense ? 'text-emerald-400' : 'text-slate-500'} font-semibold">
        ${hasLicense ? '🔑 ترخيص رقمي موقّع' : '💳 اشتراك منصة'}
      </span>
    `;

    infoGroup.appendChild(nameEl);
    infoGroup.appendChild(metaRow);

    const planBadge = document.createElement('div');
    planBadge.className = 'text-left sm:text-right shrink-0';
    const planLabel = PLAN_LABELS[tenant.plan] || 'غير محدد';
    const daysText =
      days === null
        ? 'تاريخ انتهاء غير صالح'
        : days > 0
          ? `متبقي ${days.toLocaleString('ar-IQ')} يوماً`
          : `منتهي منذ ${Math.abs(days).toLocaleString('ar-IQ')} يوم`;
    planBadge.innerHTML = `
      <span class="px-2.5 py-1 rounded-xl bg-purple-950/60 text-purple-300 border border-purple-800 font-bold text-[11px] block">
        ${escapeHtml(planLabel)}
      </span>
      <span class="text-[10px] ${days !== null && days > 0 ? 'text-emerald-400' : 'text-rose-400'} block mt-1 font-semibold">
        ${daysText}
      </span>
      <span class="text-[10px] text-slate-500 block mt-0.5">ينتهي: ${escapeHtml(formatDate(tenant.expiresAt))}</span>
    `;

    topRow.appendChild(infoGroup);
    topRow.appendChild(planBadge);
    card.appendChild(topRow);

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'pt-2 border-t border-slate-800/80 space-y-2';

    const primaryActions = document.createElement('div');
    primaryActions.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2';

    const monthlyBtn = this.makeButton(
      '📅 تفعيل شهري (+30 يوم)',
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
    );
    monthlyBtn.classList.add('justify-center');
    monthlyBtn.title = 'تجديد الاشتراك لمدة 30 يوماً (15,000 د.ع)';
    monthlyBtn.addEventListener('click', async () => {
      if (!confirm(`تفعيل أو تمديد اشتراك «${tenant.name}» لمدة شهر إضافي (30 يوماً)؟`)) return;
      try {
        await db.activateOrExtendTenant(tenant.id, 30, 'monthly');
        await this.loadData();
      } catch (err) {
        alert(`تعذر تفعيل الاشتراك: ${errorMessage(err)}`);
      }
    });

    const yearlyBtn = this.makeButton(
      '🛡️ تفعيل سنوي (+365)',
      'bg-purple-600 hover:bg-purple-500 text-white shadow'
    );
    yearlyBtn.classList.add('justify-center');
    yearlyBtn.title = 'تجديد الاشتراك لسنة كاملة (150,000 د.ع)';
    yearlyBtn.addEventListener('click', async () => {
      if (!confirm(`تفعيل أو تمديد اشتراك «${tenant.name}» لمدة سنة كاملة (365 يوماً)؟`)) return;
      try {
        await db.activateOrExtendTenant(tenant.id, 365, 'yearly');
        await this.loadData();
      } catch (err) {
        alert(`تعذر تفعيل الاشتراك: ${errorMessage(err)}`);
      }
    });

    const lifetimeBtn = this.makeButton(
      '👑 تفعيل دائمي',
      'bg-amber-600 hover:bg-amber-500 text-slate-950 font-black shadow'
    );
    lifetimeBtn.classList.add('justify-center');
    lifetimeBtn.title = 'تفعيل المنظومة بترخيص دائمي مدى الحياة (بدون تجديد سنوي)';
    lifetimeBtn.addEventListener('click', async () => {
      if (!confirm(`تفعيل ترخيص دائمي (مدى الحياة) لمولدة «${tenant.name}»؟`)) return;
      try {
        await db.activateOrExtendTenant(tenant.id, 36500, 'yearly');
        await this.loadData();
      } catch (err) {
        alert(`تعذر تفعيل الترخيص: ${errorMessage(err)}`);
      }
    });

    const licenseBtn = this.makeButton(
      '🔑 تطبيق كود ترخيص',
      'bg-[#0E7490] hover:bg-cyan-600 text-white shadow'
    );
    licenseBtn.classList.add('justify-center');
    licenseBtn.title = 'لصق كود ترخيص موقّع تم إصداره عبر أداة المنصة';
    licenseBtn.addEventListener('click', () => this.openLicenseImportModal(tenant));

    primaryActions.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2';
    primaryActions.appendChild(yearlyBtn);
    primaryActions.appendChild(lifetimeBtn);
    primaryActions.appendChild(monthlyBtn);
    primaryActions.appendChild(licenseBtn);
    actionsContainer.appendChild(primaryActions);

    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] pt-1';

    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className =
      'min-h-[36px] py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer';
    enterBtn.textContent = '👁️ معاينة';
    enterBtn.title = 'فتح مساحة عمل هذه المولدة لإدارتها أو تقديم الدعم الفني';
    enterBtn.addEventListener('click', async () => {
      if (
        !confirm(
          `سيتم تحويل مساحة العمل الحالية إلى «${tenant.name}» لمعاينتها.\nيمكنك العودة إلى لوحة الإدارة من زر «العودة للإدارة» أعلى الشاشة.\n\nهل تريد المتابعة؟`
        )
      ) {
        return;
      }
      try {
        await db.setCurrentTenant(tenant.id);
        this.goToApp();
      } catch (err) {
        alert(`تعذر التبديل إلى المولدة: ${errorMessage(err)}`);
      }
    });

    const waBtn = document.createElement('a');
    const cleanPhone = (tenant.phone || '').replace(/^0/, '964').replace(/\D/g, '');
    const waMsg = encodeURIComponent(
      `مرحباً أخي ${tenant.ownerName}، معك إدارة منصة «أمبيرجي» لإدارة المولدات الأهلية.\nبخصوص مولدة: ${tenant.name}.\nحالة الاشتراك: ${
        days !== null && days > 0 ? `ساري (متبقي ${days} يوماً)` : 'منتهي وبحاجة لتجديد'
      }.`
    );
    waBtn.href = `https://wa.me/${cleanPhone}?text=${waMsg}`;
    waBtn.target = '_blank';
    waBtn.rel = 'noopener noreferrer';
    waBtn.className =
      'min-h-[36px] py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold text-center flex items-center justify-center gap-1';
    waBtn.textContent = '💬 واتساب';

    const blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = `min-h-[36px] py-1.5 rounded-lg font-semibold border cursor-pointer ${
      isBlocked
        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900'
        : 'bg-rose-950/60 border-rose-500/40 text-rose-400 hover:bg-rose-900'
    }`;
    blockBtn.textContent = isBlocked ? 'فك الحظر' : 'حظر';
    blockBtn.addEventListener('click', async () => {
      const willBlock = !isBlocked;
      if (
        !confirm(
          willBlock
            ? `حظر «${tenant.name}»؟ سيتم منع إضافة سجلات جديدة لحين فك الحظر.`
            : `فك الحظر عن «${tenant.name}»؟`
        )
      ) {
        return;
      }
      try {
        const blocked = await db.toggleTenantBlock(tenant.id);
        alert(blocked ? 'تم حظر حساب المولدة' : 'تم فك الحظر عن المولدة');
        await this.loadData();
      } catch (err) {
        alert(`تعذر تغيير حالة الحظر: ${errorMessage(err)}`);
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'min-h-[36px] py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 font-semibold cursor-pointer';
    deleteBtn.textContent = '🗑️ حذف';
    deleteBtn.addEventListener('click', async () => {
      if (
        !confirm(
          `تحذير: سيتم حذف مولدة «${tenant.name}» نهائياً مع جميع مشتركيها وسجلات الجباية والمصاريف التابعة لها.\nلا يمكن التراجع عن هذه العملية. هل أنت متأكد؟`
        )
      ) {
        return;
      }
      try {
        await db.deleteTenant(tenant.id);
        alert('تم حذف المولدة وكل بياناتها');
        await this.loadData();
      } catch (err) {
        alert(`تعذر حذف المولدة: ${errorMessage(err)}`);
      }
    });

    secondaryActions.appendChild(enterBtn);
    secondaryActions.appendChild(waBtn);
    secondaryActions.appendChild(blockBtn);
    secondaryActions.appendChild(deleteBtn);
    actionsContainer.appendChild(secondaryActions);

    card.appendChild(actionsContainer);
    return card;
  }

  /* ====================================================
   * LICENSE IMPORT
   * ==================================================== */

  private openLicenseImportModal(tenant: Tenant): void {
    const modal = document.createElement('div');
    modal.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8 text-xs';

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-base font-black text-cyan-400">🔑 تطبيق كود ترخيص</h3>
          <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(tenant.name)} — ${escapeHtml(tenant.ownerName)}</p>
        </div>
        <button type="button" id="close-license-modal" class="text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer">&times;</button>
      </div>

      <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-[11px] text-slate-300 leading-relaxed space-y-1">
        <div>أصدر الكود من أداة المنصة على جهازك:</div>
        <div class="space-y-1 mt-1 font-mono text-[10px] break-all" dir="ltr">
          <div class="text-cyan-300 bg-slate-900/80 p-1.5 rounded-lg border border-slate-700">node tools/generate-license.js issue --name "${escapeHtml(tenant.name)}" --phone "${escapeHtml(tenant.phone)}" --type yearly</div>
          <div class="text-amber-300 bg-slate-900/80 p-1.5 rounded-lg border border-slate-700">node tools/generate-license.js issue --name "${escapeHtml(tenant.name)}" --phone "${escapeHtml(tenant.phone)}" --type lifetime</div>
        </div>
        <div class="text-[10px] text-slate-400">المفتاح الخاص لا يُضمَّن في التطبيق ولا يُرسل إلى المتصفح.</div>
      </div>

      <div>
        <label for="license-code-input" class="block text-slate-300 font-bold mb-1">كود الترخيص الموقّع</label>
        <textarea id="license-code-input" rows="4" spellcheck="false"
          placeholder="AMPEREJI-..."
          class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 font-mono text-[11px] text-cyan-200 focus:border-cyan-500 focus:outline-none select-all break-all"></textarea>
      </div>

      <div id="license-verify-result" class="text-[11px] leading-relaxed min-h-[18px]"></div>

      <div class="flex items-center gap-2 pt-1">
        <button type="button" id="verify-license-btn"
          class="flex-1 min-h-[44px] py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold shadow cursor-pointer disabled:opacity-60">
          🔍 فحص التوقيع
        </button>
        <button type="button" id="apply-license-btn" disabled
          class="flex-1 min-h-[44px] py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          ✅ تطبيق الترخيص
        </button>
      </div>

      <button type="button" id="cancel-license-btn"
        class="min-h-[40px] py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 cursor-pointer">
        إلغاء
      </button>
    `;

    const textarea = card.querySelector<HTMLTextAreaElement>('#license-code-input');
    const resultEl = card.querySelector<HTMLElement>('#license-verify-result');
    const verifyBtn = card.querySelector<HTMLButtonElement>('#verify-license-btn');
    const applyBtn = card.querySelector<HTMLButtonElement>('#apply-license-btn');

    let verified: { code: string; payload: DecodedLicensePayload } | null = null;

    const close = (): void => {
      if (modal.parentElement) modal.parentElement.removeChild(modal);
    };

    card.querySelector('#close-license-modal')?.addEventListener('click', close);
    card.querySelector('#cancel-license-btn')?.addEventListener('click', close);

    const resetVerification = (): void => {
      verified = null;
      if (applyBtn) applyBtn.disabled = true;
    };

    textarea?.addEventListener('input', () => {
      resetVerification();
      if (resultEl) resultEl.innerHTML = '';
    });

    verifyBtn?.addEventListener('click', async () => {
      const code = textarea?.value.trim() || '';
      resetVerification();

      if (!code) {
        if (resultEl) resultEl.innerHTML = '<span class="text-rose-400">يرجى لصق كود الترخيص أولاً.</span>';
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.textContent = 'جاري الفحص…';
      if (resultEl) resultEl.innerHTML = '<span class="text-slate-400">جاري التحقق من التوقيع الرقمي…</span>';

      try {
        const result = await licenseManager.verifyLicense(code);
        if (!result.isValid || !result.payload) {
          if (resultEl) {
            resultEl.innerHTML = `<span class="text-rose-400">❌ ${escapeHtml(
              result.error || 'كود الترخيص غير صالح'
            )}</span>`;
          }
          return;
        }

        const payload = result.payload;
        if (payload.system !== 'ampereji') {
          if (resultEl) {
            resultEl.innerHTML = '<span class="text-rose-400">❌ هذا الكود لا يخص منظومة أمبيرجي.</span>';
          }
          return;
        }

        verified = { code, payload };

        const licensePhone = normalizePhone(payload.ownerPhone);
        const tenantPhone = normalizePhone(tenant.phone);
        const nameMismatch = normalizeName(payload.generatorName) !== normalizeName(tenant.name);
        const phoneMismatch = Boolean(licensePhone && tenantPhone && licensePhone !== tenantPhone);

        if (resultEl) {
          resultEl.innerHTML = `
            <div class="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 space-y-1">
              <div class="font-black text-emerald-300">✅ توقيع رقمي صالح</div>
              <div class="text-slate-300">المولدة: <strong class="text-white">${escapeHtml(payload.generatorName)}</strong></div>
              <div class="text-slate-300">الهاتف: ${escapeHtml(payload.ownerPhone || 'غير محدد')}</div>
              <div class="text-slate-300">نوع الترخيص: ${escapeHtml(payload.licenseType)}</div>
              <div class="text-slate-300">ينتهي في: ${escapeHtml(formatDate(payload.expiresAt))}</div>
              ${
                nameMismatch || phoneMismatch
                  ? `<div class="mt-2 pt-2 border-t border-amber-800/60 text-amber-300">⚠️ بيانات الترخيص لا تطابق بيانات هذه المولدة بالكامل. راجع الاسم والهاتف قبل التطبيق.</div>`
                  : ''
              }
            </div>
          `;
        }

        if (applyBtn) applyBtn.disabled = false;
      } catch (err) {
        if (resultEl) {
          resultEl.innerHTML = `<span class="text-rose-400">❌ ${escapeHtml(errorMessage(err))}</span>`;
        }
      } finally {
        if (verifyBtn.isConnected) {
          verifyBtn.disabled = false;
          verifyBtn.textContent = '🔍 فحص التوقيع';
        }
      }
    });

    applyBtn?.addEventListener('click', async () => {
      if (!verified) return;
      const { code, payload } = verified;

      const nameMismatch = normalizeName(payload.generatorName) !== normalizeName(tenant.name);
      const licensePhone = normalizePhone(payload.ownerPhone);
      const tenantPhone = normalizePhone(tenant.phone);
      const phoneMismatch = Boolean(licensePhone && tenantPhone && licensePhone !== tenantPhone);

      if (nameMismatch || phoneMismatch) {
        const proceed = confirm(
          `تنبيه: الترخيص صادر لـ «${payload.generatorName}» (${
            payload.ownerPhone || 'بدون هاتف'
          }) بينما المولدة الحالية «${tenant.name}» (${tenant.phone || 'بدون هاتف'}).\nهل أنت متأكد من تطبيقه على هذه المولدة؟`
        );
        if (!proceed) return;
      }

      applyBtn.disabled = true;
      applyBtn.textContent = 'جاري التطبيق…';

      try {
        await db.applyLicenseToTenant(tenant.id, code);
        close();
        alert(`🎉 تم تطبيق ترخيص «${payload.generatorName}» بنجاح.`);
        await this.loadData();
      } catch (err) {
        alert(`تعذر تطبيق الترخيص: ${errorMessage(err)}`);
        if (applyBtn.isConnected) {
          applyBtn.disabled = false;
          applyBtn.textContent = '✅ تطبيق الترخيص';
        }
      }
    });

    modal.appendChild(card);
    document.body.appendChild(modal);
    textarea?.focus();
  }

  /* ====================================================
   * PASSWORD CHANGE
   * ==================================================== */

  private openChangePasswordModal(): void {
    const modal = document.createElement('div');
    modal.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8 text-xs';

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-black text-cyan-400">🔐 تغيير كلمة مرور مدير المنصة</h3>
        <button type="button" id="close-password-modal" class="text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer">&times;</button>
      </div>

      <form id="change-password-form" class="space-y-3">
        <div>
          <label for="current-password" class="block text-slate-300 font-bold mb-1">كلمة المرور الحالية</label>
          <input type="password" id="current-password" required autocomplete="current-password"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>
        <div>
          <label for="new-password" class="block text-slate-300 font-bold mb-1">كلمة المرور الجديدة</label>
          <input type="password" id="new-password" required minlength="8" autocomplete="new-password"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
          <p class="text-[10px] text-slate-500 mt-1">8 أحرف على الأقل، ويُفضّل مزج الأحرف والأرقام والرموز.</p>
        </div>
        <div>
          <label for="confirm-password" class="block text-slate-300 font-bold mb-1">تأكيد كلمة المرور الجديدة</label>
          <input type="password" id="confirm-password" required minlength="8" autocomplete="new-password"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>

        <div id="password-feedback" class="text-rose-400 text-[11px] min-h-[18px] leading-relaxed"></div>

        <div class="flex items-center gap-2 pt-1">
          <button type="submit" id="save-password-btn"
            class="flex-1 min-h-[44px] rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow cursor-pointer disabled:opacity-60">
            💾 حفظ كلمة المرور
          </button>
          <button type="button" id="cancel-password-btn"
            class="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 cursor-pointer">
            إلغاء
          </button>
        </div>
      </form>
    `;

    const close = (): void => {
      if (modal.parentElement) modal.parentElement.removeChild(modal);
    };
    card.querySelector('#close-password-modal')?.addEventListener('click', close);
    card.querySelector('#cancel-password-btn')?.addEventListener('click', close);

    const form = card.querySelector<HTMLFormElement>('#change-password-form');
    const feedback = card.querySelector<HTMLElement>('#password-feedback');
    const saveBtn = card.querySelector<HTMLButtonElement>('#save-password-btn');

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!feedback || !saveBtn) return;

      const currentPassword =
        card.querySelector<HTMLInputElement>('#current-password')?.value || '';
      const newPassword = card.querySelector<HTMLInputElement>('#new-password')?.value || '';
      const confirmPassword =
        card.querySelector<HTMLInputElement>('#confirm-password')?.value || '';

      feedback.textContent = '';

      if (newPassword !== confirmPassword) {
        feedback.textContent = 'كلمتا المرور الجديدتان غير متطابقتين';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'جاري الحفظ…';

      try {
        const result = await authService.changePassword(currentPassword, newPassword);
        if (!result.success) {
          feedback.textContent = result.error || 'تعذر تغيير كلمة المرور';
          return;
        }
        close();
        alert('تم تغيير كلمة المرور بنجاح. استخدم كلمة المرور الجديدة في الدخول القادم.');
        await this.render();
      } catch (err) {
        feedback.textContent = errorMessage(err);
      } finally {
        if (saveBtn.isConnected) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 حفظ كلمة المرور';
        }
      }
    });

    modal.appendChild(card);
    document.body.appendChild(modal);
    card.querySelector<HTMLInputElement>('#current-password')?.focus();
  }

  /* ====================================================
   * NAVIGATION
   * ==================================================== */

  private goToApp(): void {
    this.closeSubscriberModal();
    if (window.location.hash === '#subscribers') {
      window.dispatchEvent(new CustomEvent('ampereji:navigate', { detail: { screen: 'subscribers' } }));
      return;
    }
    window.location.hash = '#subscribers';
  }
}
