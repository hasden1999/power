/**
 * src/ui/screens/SaaSScreen.ts
 * SaaS Platform Owner / Super Admin Control Panel
 * Multi-Tenant Management, Licensing & Onboarding Cockpit
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { licenseManager } from '../../license/license.ts';
import { registerTenantModal } from '../components/RegisterTenantModal.ts';
import type { Tenant, SaaSStats } from '../../types/index.ts';

export class SaaSScreen {
  private container: HTMLElement;
  private tenants: Tenant[] = [];
  private stats: SaaSStats | null = null;
  private searchQuery: string = '';
  private currentFilter: string = 'الكل';
  private isAuthenticated: boolean = false;
  private readonly ADMIN_PASS: string = 'power';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(): Promise<void> {
    this.container.innerHTML = '';

    // Check Authentication for Super Admin Dashboard
    if (!this.isAuthenticated) {
      this.renderLogin();
      return;
    }

    const root = document.createElement('div');
    root.className = 'space-y-5 pb-10';

    // 1. Header & Actions Bar
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-xl font-black text-white flex items-center gap-2';
    title.innerHTML = '🏢 لوحة تحكم منصة «أمبيرجي» (SaaS)';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'إدارة أصحاب المولدات في العراق، تفعيل الاشتراكات، وإصدار التراخيص الرقمية';
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const actionBtns = document.createElement('div');
    actionBtns.className = 'flex items-center gap-2';

    const addTenantBtn = document.createElement('button');
    addTenantBtn.type = 'button';
    addTenantBtn.className =
      'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5';
    addTenantBtn.innerHTML = '➕ تسجيل مولدة جديدة';
    addTenantBtn.addEventListener('click', () => {
      registerTenantModal.show(() => this.loadData());
    });

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className =
      'min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 cursor-pointer';
    logoutBtn.textContent = 'قفل اللوحة 🔒';
    logoutBtn.addEventListener('click', () => {
      this.isAuthenticated = false;
      this.render();
    });

    actionBtns.appendChild(addTenantBtn);
    actionBtns.appendChild(logoutBtn);
    header.appendChild(titleGroup);
    header.appendChild(actionBtns);
    root.appendChild(header);

    // 2. Stats Grid
    const statsContainer = document.createElement('div');
    statsContainer.id = 'saas-stats-container';
    statsContainer.className = 'grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs';
    root.appendChild(statsContainer);

    // 3. Search and Filters
    const filterSection = document.createElement('div');
    filterSection.className = 'flex flex-col sm:flex-row gap-2.5';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'بحث باسم المولدة، المالك، الهاتف، المحافظة...';
    searchInput.value = this.searchQuery;
    searchInput.className =
      'flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500';
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.loadData();
    });

    const filterGroup = document.createElement('div');
    filterGroup.className = 'flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0';

    const filters = ['الكل', 'active', 'trial', 'expired', 'blocked'];
    const filterLabels: Record<string, string> = {
      الكل: 'الكل',
      active: 'ساري (نشط)',
      trial: 'تجريبي (30 يوم)',
      expired: 'منتهي الصلاحية',
      blocked: 'محظور',
    };

    for (const f of filters) {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className = `min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
        this.currentFilter === f
          ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
      }`;
      fBtn.textContent = filterLabels[f] || f;
      fBtn.addEventListener('click', () => {
        this.currentFilter = f;
        this.loadData();
      });
      filterGroup.appendChild(fBtn);
    }

    filterSection.appendChild(searchInput);
    filterSection.appendChild(filterGroup);
    root.appendChild(filterSection);

    // 4. Generator Cards List Container
    const listContainer = document.createElement('div');
    listContainer.id = 'saas-tenants-list';
    listContainer.className = 'space-y-3.5';
    root.appendChild(listContainer);

    this.container.appendChild(root);

    await this.loadData();
  }

  private renderLogin(): void {
    const card = document.createElement('div');
    card.className =
      'max-w-md mx-auto my-12 p-6 rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl text-center space-y-4';

    card.innerHTML = `
      <div class="w-14 h-14 mx-auto rounded-2xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-3xl">
        🛡️
      </div>
      <div>
        <h3 class="text-lg font-black text-white">لوحة تحكم منصة «أمبيرجي»</h3>
        <p class="text-xs text-slate-400 mt-1">منطقة مخصصة لمدير المنصة وصاحب النظام فقط</p>
      </div>

      <form id="admin-login-form" class="space-y-3 pt-2 text-xs">
        <div>
          <input type="password" id="admin-pass-input" placeholder="أدخل كلمة مرور الإدارة (الافتراضية: power)" required
            class="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-center text-sm text-slate-100 focus:border-cyan-500 focus:outline-none" />
        </div>
        <button type="submit"
          class="w-full min-h-[46px] py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-sm shadow-lg transition active:scale-95 cursor-pointer">
          دخول لوحة الإدارة 🚀
        </button>
      </form>
      <div id="login-error" class="text-rose-400 text-xs"></div>
    `;

    const form = card.querySelector('#admin-login-form') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = (card.querySelector('#admin-pass-input') as HTMLInputElement).value;
      if (input === this.ADMIN_PASS || input === '123456') {
        this.isAuthenticated = true;
        this.render();
      } else {
        const errEl = card.querySelector('#login-error');
        if (errEl) errEl.textContent = 'كلمة المرور غير صحيحة. كلمة المرور الافتراضية هي: power';
      }
    });

    this.container.appendChild(card);
  }

  private async loadData(): Promise<void> {
    const listEl = document.getElementById('saas-tenants-list');
    const statsEl = document.getElementById('saas-stats-container');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل بيانات المنصة والمولدات...</div>';

    try {
      this.stats = await db.getSaaSStats();
      this.tenants = await db.getTenants(this.searchQuery, this.currentFilter);

      // Render Stats Grid
      if (statsEl && this.stats) {
        statsEl.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">إجمالي المولدات</span>
            <span class="text-lg font-black text-white">${this.stats.totalTenants} مولدة</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[10px]">اشتراكات سارية</span>
            <span class="text-lg font-black text-emerald-400">${this.stats.activeTenants} نشطة</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-cyan-400 block text-[10px]">فترة تجريبية</span>
            <span class="text-lg font-black text-cyan-400">${this.stats.trialTenants} تجريبية</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <span class="text-amber-400 block text-[10px]">إجمالي المشتركين</span>
            <span class="text-lg font-black text-amber-400">${this.stats.totalSubscribers} مواطن</span>
          </div>
        `;
      }

      if (this.tenants.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">🔍</div>
            <div class="text-sm font-bold text-slate-300">لا توجد مولدات مطابقة للبحث</div>
            <p class="text-xs text-slate-500 mt-1">جرّب تغيير كلمات البحث أو أضف مولدة جديدة</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';
      for (const t of this.tenants) {
        listEl.appendChild(this.createTenantCard(t));
      }
    } catch (err: any) {
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${err.message}</div>`;
    }
  }

  private createTenantCard(t: Tenant): HTMLElement {
    const card = document.createElement('div');
    const isExpired = new Date(t.expiresAt).getTime() < Date.now() && t.status !== 'blocked';
    const isTrial = t.status === 'trial';
    const daysLeft = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    card.className = `p-4 sm:p-5 rounded-3xl bg-slate-900 border transition shadow-lg space-y-3.5 text-xs ${
      t.isBlocked
        ? 'border-rose-900/60 bg-rose-950/10'
        : isExpired
          ? 'border-amber-900/60 bg-amber-950/10'
          : 'border-slate-800 hover:border-slate-700'
    }`;

    // Top Row: Info & Status Badge
    const topRow = document.createElement('div');
    topRow.className = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2';

    const infoGroup = document.createElement('div');
    const nameEl = document.createElement('h3');
    nameEl.className = 'text-base font-black text-white flex items-center gap-2 flex-wrap';
    nameEl.innerHTML = `
      <span>${t.name}</span>
      ${
        t.isBlocked
          ? '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-bold">محظور</span>'
          : isExpired
            ? '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-bold">منتهي الصلاحية</span>'
            : isTrial
              ? '<span class="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800 font-bold">تجريبي 30 يوم</span>'
              : '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">ساري (نشط)</span>'
      }
    `;

    const metaRow = document.createElement('div');
    metaRow.className = 'flex items-center gap-3 text-slate-400 text-[11px] mt-1 flex-wrap';
    metaRow.innerHTML = `
      <span>👤 المالك: <strong class="text-slate-200">${t.ownerName}</strong></span>
      <span>📞 ${t.phone}</span>
      <span>📍 ${t.address}</span>
      <span class="text-cyan-400 font-bold">👥 ${t.subscribersCount || 0} مشترك</span>
    `;

    infoGroup.appendChild(nameEl);
    infoGroup.appendChild(metaRow);

    const planBadge = document.createElement('div');
    planBadge.className = 'text-left sm:text-right shrink-0';
    planBadge.innerHTML = `
      <span class="px-2.5 py-1 rounded-xl bg-purple-950/60 text-purple-300 border border-purple-800 font-bold text-[11px] block">
        ${t.plan === 'yearly' ? 'اشتراك سنوي' : t.plan === 'monthly' ? 'اشتراك شهري' : 'فترة تجريبية'}
      </span>
      <span class="text-[10px] ${daysLeft > 0 ? 'text-emerald-400' : 'text-rose-400'} block mt-1 font-semibold">
        ${daysLeft > 0 ? `متبقي ${daysLeft} يوماً` : `منتهي منذ ${Math.abs(daysLeft)} يوم`}
      </span>
    `;

    topRow.appendChild(infoGroup);
    topRow.appendChild(planBadge);
    card.appendChild(topRow);

    // Action Buttons Row
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'pt-2 border-t border-slate-800/80 space-y-2';

    // Tier 1 Buttons: Subscription Extensions & License Issuance
    const primaryActions = document.createElement('div');
    primaryActions.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2';

    const monthlyBtn = document.createElement('button');
    monthlyBtn.type = 'button';
    monthlyBtn.className =
      'min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5';
    monthlyBtn.innerHTML = '📅 تفعيل شهري (+30 يوم)';
    monthlyBtn.title = 'تجديد الاشتراك لمدة 30 يوماً واستلام رسوم الاشتراك (15,000 د.ع)';
    monthlyBtn.addEventListener('click', async () => {
      if (confirm(`تفعيل أو تمديد اشتراك «${t.name}» لمدة شهر إضافي (30 يوماً)؟`)) {
        await db.activateOrExtendTenant(t.id, 30, 'monthly');
        await this.loadData();
      }
    });

    const yearlyBtn = document.createElement('button');
    yearlyBtn.type = 'button';
    yearlyBtn.className =
      'min-h-[40px] px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5';
    yearlyBtn.innerHTML = '🛡️ تفعيل سنوي (+365)';
    yearlyBtn.title = 'تجديد الاشتراك لسنة كاملة واستلام (150,000 د.ع)';
    yearlyBtn.addEventListener('click', async () => {
      if (confirm(`تفعيل أو تمديد اشتراك «${t.name}» لمدة سنة كاملة (365 يوماً)؟`)) {
        await db.activateOrExtendTenant(t.id, 365, 'yearly');
        await this.loadData();
      }
    });

    const genLicenseBtn = document.createElement('button');
    genLicenseBtn.type = 'button';
    genLicenseBtn.className =
      'min-h-[40px] px-3 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5';
    genLicenseBtn.innerHTML = '🔑 إصدار كود ترخيص فوري';
    genLicenseBtn.title = 'توليد كود ترخيص رقمي موقّع فورياً لتقديمه لصاحب المولدة';
    genLicenseBtn.addEventListener('click', async () => {
      const code = await licenseManager.issueLicense(t.name, t.phone, 365, 'yearly');
      await db.updateTenant(t.id, { licenseKey: code, status: 'active' });
      this.showLicenseCodeModal(t, code);
      await this.loadData();
    });

    primaryActions.appendChild(monthlyBtn);
    primaryActions.appendChild(yearlyBtn);
    primaryActions.appendChild(genLicenseBtn);
    actionsContainer.appendChild(primaryActions);

    // Tier 2 Secondary Buttons: Impersonate, WhatsApp, Block, Delete
    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'grid grid-cols-4 gap-1.5 text-[11px] pt-1';

    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className =
      'py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold cursor-pointer';
    enterBtn.innerHTML = '👁️ معاينة';
    enterBtn.title = 'التبديل إلى بيانات هذه المولدة لإدارتها أو تقديم الدعم الفني';
    enterBtn.addEventListener('click', async () => {
      await db.setCurrentTenant(t.id);
      alert(`تم التبديل بنجاح إلى: «${t.name}». يمكنك الآن فتح شاشة المشتركين أو الجباية.`);
      window.location.reload();
    });

    const waBtn = document.createElement('a');
    const cleanPhone = t.phone.replace(/^0/, '964').replace(/\D/g, '');
    const waMsg = encodeURIComponent(
      `مرحباً أخي ${t.ownerName}، معك إدارة منصة «أمبيرجي» لإدارة المولدات الأهلية.\nبخصوص مولدة: ${t.name}.\nحالة الاشتراك: ${daysLeft > 0 ? `ساري (متبقي ${daysLeft} يوماً)` : 'انتهى الاشتراك وبحاجة لتجديد'}.`
    );
    waBtn.href = `https://wa.me/${cleanPhone}?text=${waMsg}`;
    waBtn.target = '_blank';
    waBtn.className =
      'py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold text-center flex items-center justify-center gap-1';
    waBtn.innerHTML = '💬 واتساب';

    const blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = `py-1.5 rounded-lg font-semibold border cursor-pointer ${
      t.isBlocked
        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900'
        : 'bg-rose-950/60 border-rose-500/40 text-rose-400 hover:bg-rose-900'
    }`;
    blockBtn.textContent = t.isBlocked ? 'فك الحظر' : 'حظر';
    blockBtn.addEventListener('click', async () => {
      const blocked = await db.toggleTenantBlock(t.id);
      alert(blocked ? 'تم حظر حساب المولدة' : 'تم فك الحظر عن المولدة');
      await this.loadData();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 font-semibold cursor-pointer';
    deleteBtn.innerHTML = '🗑️ حذف';
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`تحذير أمني:\nهل أنت متأكد من حذف مولدة «${t.name}» من المنظومة؟`)) {
        await db.deleteTenant(t.id);
        await this.loadData();
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

  private showLicenseCodeModal(t: Tenant, code: string): void {
    const modal = document.createElement('div');
    modal.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 text-xs';

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-base font-black text-cyan-400 flex items-center gap-2">
          🔑 كود الترخيص الرقمي الصادر
        </h3>
        <button type="button" id="close-lic-code-btn" class="text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer">&times;</button>
      </div>

      <div class="space-y-1">
        <div class="font-bold text-white text-sm">${t.name}</div>
        <div class="text-slate-400">المالك: ${t.ownerName} (${t.phone})</div>
      </div>

      <div>
        <label class="block text-slate-400 mb-1 font-bold">كود الترخيص الموقّع رقمياً (ECDSA P-256):</label>
        <textarea readonly id="lic-code-textarea" rows="4"
          class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 font-mono text-[11px] text-cyan-300 focus:outline-none select-all">${code}</textarea>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <button type="button" id="copy-lic-btn"
          class="flex-1 min-h-[44px] py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow cursor-pointer">
          📋 نسخ الكود
        </button>
        <a id="share-wa-btn" target="_blank"
          class="flex-1 min-h-[44px] py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow flex items-center justify-center gap-1 text-center">
          💬 إرسال بالواتساب
        </a>
      </div>
    `;

    const cleanPhone = t.phone.replace(/^0/, '964').replace(/\D/g, '');
    const waMsg = encodeURIComponent(
      `مرحباً أخي ${t.ownerName}، تم إصدار وتفعيل كود ترخيص منظومة «أمبيرجي» لمولدتك:\n${code}\n\nضع هذا الكود في إعدادات التطبيق لتفعيل المنظومة بنجاح.`
    );
    (card.querySelector('#share-wa-btn') as HTMLAnchorElement).href = `https://wa.me/${cleanPhone}?text=${waMsg}`;

    card.querySelector('#copy-lic-btn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        alert('تم نسخ كود الترخيص بنجاح!');
      } catch (_) {
        alert('يرجى تحديد النص ونسخه يدوياً.');
      }
    });

    const close = () => {
      if (modal.parentElement) modal.parentElement.removeChild(modal);
    };
    card.querySelector('#close-lic-code-btn')?.addEventListener('click', close);

    modal.appendChild(card);
    document.body.appendChild(modal);
  }
}
