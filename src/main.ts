/**
 * src/main.ts
 * Main Application Entry Point - Ampereji (أمبيرجي)
 * Pure Vanilla TypeScript Architecture - 100% Offline & Zero External CDNs
 */

import './index.css';
import { platform } from './platform.ts';
import { APP_CONFIG } from './config/app-config.ts';
import { AR_INSTALL_TEXTS } from './config/install-texts.ts';
import { db } from './db/database.ts';
import { authService } from './services/authService.ts';
import { BrowserWarningBanner } from './ui/components/BrowserWarningBanner.ts';
import { InstallBanner } from './ui/components/InstallBanner.ts';
import { BottomNav, type ScreenId } from './ui/components/BottomNav.ts';
import { SubscribersScreen } from './ui/screens/SubscribersScreen.ts';
import { BillingScreen } from './ui/screens/BillingScreen.ts';
import { ExpensesScreen } from './ui/screens/ExpensesScreen.ts';
import { ReportsScreen } from './ui/screens/ReportsScreen.ts';
import { SettingsScreen } from './ui/screens/SettingsScreen.ts';
import { SaaSScreen } from './ui/screens/SaaSScreen.ts';

const APP_SCREENS: ScreenId[] = ['subscribers', 'billing', 'expenses', 'reports', 'settings', 'saas'];

// 1. Service Worker for PWA Offline Execution
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New update ready');
                window.dispatchEvent(new CustomEvent('ampereji:app-update-ready'));
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration skipped or failed:', err);
      });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.dispatchEvent(new CustomEvent('ampereji:controller-changed'));
  });
}

class AmperejiApp {
  private currentScreen: ScreenId = 'subscribers';
  private screenContainer: HTMLElement | null = null;
  private bottomNav: BottomNav | null = null;
  private headerActions: HTMLElement | null = null;
  private isSunlightMode = false;
  private dbReady = false;
  private navigationToken = 0;
  private renderQueue: Promise<void> = Promise.resolve();

  constructor() {}

  public async start(): Promise<void> {
    const root = document.getElementById('app');
    if (!root) {
      console.error('[Ampereji] Root element #app not found');
      return;
    }

    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';

    // Mount browser warning banner (shows only in browser mode)
    const warningBanner = new BrowserWarningBanner();
    warningBanner.mount(root);

    // App Layout Shell
    const layout = document.createElement('div');
    layout.className = 'min-h-screen flex flex-col text-slate-100';

    // Header
    const header = this.buildHeader();
    layout.appendChild(header);

    // Main Viewport
    const main = document.createElement('main');
    main.id = 'main-view';
    main.className = 'flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28';

    // Loading State while SQLite WASM initializes
    const loadingBox = document.createElement('div');
    loadingBox.id = 'db-loading-box';
    loadingBox.className = 'flex flex-col items-center justify-center py-20 text-center space-y-3';
    loadingBox.innerHTML = `
      <div class="w-12 h-12 rounded-2xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-2xl animate-spin">
        ⚡
      </div>
      <div class="text-sm font-bold text-slate-200">جاري تشغيل محرك SQLite WebAssembly والتخزين الدائم...</div>
      <div class="text-xs text-slate-400">تحميل ملفات قاعدة البيانات محلياً بدون إنترنت (Zero-CDN)</div>
    `;
    main.appendChild(loadingBox);

    this.screenContainer = main;
    layout.appendChild(main);
    root.appendChild(layout);

    // Mount bottom install banner
    const installBanner = new InstallBanner();
    installBanner.mount(root);

    // Mount bottom navigation
    this.bottomNav = new BottomNav((screen) => void this.navigateTo(screen));
    this.bottomNav.mount(root);

    // Initialize Database and authentication
    try {
      let dbInfo: { isOpfs: boolean; version: string } | null = null;
      let lastInitError: unknown = null;

      // The SQLite worker can be slow on the very first cold load (WASM
      // download + compile). Retry once before surfacing a fatal error.
      for (let attempt = 1; attempt <= 2 && !dbInfo; attempt++) {
        try {
          dbInfo = await db.init();
        } catch (err) {
          lastInitError = err;
          console.warn(`[Ampereji] Database init attempt ${attempt} failed:`, err);
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }

      if (!dbInfo) throw lastInitError;

      this.dbReady = true;
      await authService.ensureDefaultAdmin();
      await authService.validateSession();
      await db.ensureActiveTenant();
      await db.reconcileTenantStatuses();
      console.log('[Ampereji] Database ready:', dbInfo);
    } catch (err: any) {
      console.error('[Ampereji] Database init failed:', err);
      this.renderStartupError(loadingBox, err);
      return;
    }

    // Remove loading and render the route requested by the URL hash.
    loadingBox.remove();
    await this.applyScreen(this.resolveScreenFromHash(), false);

    this.bindGlobalEvents();
  }

  private bindGlobalEvents(): void {
    window.addEventListener('hashchange', () => {
      void this.applyScreen(this.resolveScreenFromHash(), false);
    });

    window.addEventListener('ampereji:navigate', (event: Event) => {
      const screen = (event as CustomEvent<{ screen?: ScreenId }>).detail?.screen;
      if (screen && APP_SCREENS.includes(screen)) {
        void this.navigateTo(screen);
      }
    });

    window.addEventListener('ampereji:auth-changed', () => {
      this.updateHeaderActions();
    });

    window.addEventListener('ampereji:db-reloaded', async () => {
      // A restored database may not contain the current admin account.
      authService.logout();
      try {
        await authService.ensureDefaultAdmin();
        await db.ensureActiveTenant();
        await db.reconcileTenantStatuses();
      } catch (err) {
        console.warn('[Ampereji] Post-restore refresh warning:', err);
      }
      await this.refreshCurrentScreen();
    });

    window.addEventListener('ampereji:tenant-changed', async () => {
      if (this.currentScreen !== 'saas') {
        await this.refreshCurrentScreen();
      }
    });

    window.addEventListener('ampereji:demo-mode-activated', async () => {
      await db.init();
      await this.refreshCurrentScreen();
    });
  }

  private resolveScreenFromHash(): ScreenId {
    const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    switch (raw) {
      case '': // fall through
      case 'subscribers':
      case 'المشتركون':
        return 'subscribers';
      case 'billing':
        return 'billing';
      case 'expenses':
        return 'expenses';
      case 'reports':
        return 'reports';
      case 'settings':
        return 'settings';
      case 'admin':
      case 'login':
      case 'saas':
        return 'saas';
      default:
        return 'subscribers';
    }
  }

  public async navigateTo(screen: ScreenId): Promise<void> {
    if (!this.dbReady) return;

    const desiredHash = screen === 'saas' ? '#admin' : `#${screen}`;
    if (window.location.hash !== desiredHash) {
      // The hashchange listener will apply the screen.
      window.location.hash = desiredHash;
      return;
    }
    await this.applyScreen(screen, false);
  }

  private async applyScreen(screen: ScreenId, updateHash: boolean = true): Promise<void> {
    this.currentScreen = screen;
    const token = ++this.navigationToken;
    const isAdmin = screen === 'saas';

    this.bottomNav?.setVisible(!isAdmin);
    this.bottomNav?.setActive(isAdmin ? 'subscribers' : screen);

    if (this.screenContainer) {
      this.screenContainer.classList.toggle('pb-28', !isAdmin);
      this.screenContainer.classList.toggle('pb-8', isAdmin);
    }

    if (updateHash) {
      const desiredHash = isAdmin ? '#admin' : `#${screen}`;
      if (window.location.hash !== desiredHash) {
        window.history.replaceState(null, '', desiredHash);
      }
    }

    this.updateHeaderActions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await this.renderCurrentScreen(token);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className =
      'sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-cyan-950/80 px-4 py-3 shadow-lg select-none';

    const container = document.createElement('div');
    container.className = 'max-w-7xl mx-auto flex items-center justify-between gap-3';

    // Logo & Brand
    const logoGroup = document.createElement('div');
    logoGroup.className = 'flex items-center gap-3 cursor-pointer';
    logoGroup.addEventListener('click', () => void this.navigateTo('subscribers'));

    const logoIcon = document.createElement('div');
    logoIcon.className =
      'w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0E7490] to-cyan-400 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-cyan-950 shrink-0';
    logoIcon.textContent = '⚡';

    const brandText = document.createElement('div');
    const brandName = document.createElement('h1');
    brandName.className = 'font-black text-lg text-white tracking-wide leading-tight';
    brandName.textContent = APP_CONFIG.shortName;

    const brandDesc = document.createElement('p');
    brandDesc.className = 'text-[11px] text-cyan-400 font-semibold';
    brandDesc.textContent = AR_INSTALL_TEXTS.app.tagline;

    brandText.appendChild(brandName);
    brandText.appendChild(brandDesc);
    logoGroup.appendChild(logoIcon);
    logoGroup.appendChild(brandText);

    // Badges & Actions
    const rightCol = document.createElement('div');
    rightCol.className = 'flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap justify-end';

    // Admin actions are rendered dynamically. Regular users never see an
    // "enter admin" button; the cockpit is reachable only via #admin / #login
    // or through this return button while an admin session is active.
    this.headerActions = document.createElement('div');
    this.headerActions.id = 'header-dynamic-actions';
    this.headerActions.className = 'flex items-center gap-1.5 sm:gap-2';

    // Sunlight High Contrast Toggle
    const sunBtn = document.createElement('button');
    sunBtn.type = 'button';
    sunBtn.className =
      'min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold transition cursor-pointer flex items-center gap-1';
    sunBtn.innerHTML = '☀️';
    sunBtn.title = 'تبديل وضع النهار فائق التباين للعمل الميداني تحت أشعة الشمس';
    sunBtn.addEventListener('click', () => {
      this.isSunlightMode = !this.isSunlightMode;
      document.documentElement.classList.toggle('sunlight-mode', this.isSunlightMode);
      document.body.classList.toggle('sunlight-mode', this.isSunlightMode);
      sunBtn.innerHTML = this.isSunlightMode ? '🌙' : '☀️';
    });

    const info = platform.getPlatformInfo();
    const modeBadge = document.createElement('span');
    modeBadge.className = `hidden lg:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${
      info.isStandalone
        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
        : 'bg-amber-950 text-amber-300 border-amber-800'
    }`;
    modeBadge.textContent = info.isStandalone ? 'تطبيق مثبت 📱' : 'متصفح ويب 🌐';

    rightCol.appendChild(this.headerActions);
    rightCol.appendChild(sunBtn);
    rightCol.appendChild(modeBadge);

    container.appendChild(logoGroup);
    container.appendChild(rightCol);
    header.appendChild(container);
    return header;
  }

  private updateHeaderActions(): void {
    if (!this.headerActions) return;
    this.headerActions.innerHTML = '';

    if (this.currentScreen === 'saas' || !authService.isSuperAdmin()) {
      return;
    }

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.id = 'saas-admin-back-btn';
    backBtn.className =
      'min-h-[40px] px-3 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900 text-purple-200 border border-purple-800/70 font-black transition cursor-pointer flex items-center gap-1 shadow-sm';
    backBtn.innerHTML = '<span>🛡️ العودة للإدارة</span>';
    backBtn.title = 'العودة إلى لوحة تحكم مدير المنصة';
    backBtn.addEventListener('click', () => void this.navigateTo('saas'));
    this.headerActions.appendChild(backBtn);
  }

  private refreshCurrentScreen(): Promise<void> {
    return this.renderCurrentScreen(++this.navigationToken);
  }

  private renderCurrentScreen(token: number): Promise<void> {
    const container = this.screenContainer;
    const screen = this.currentScreen;
    if (!container || !this.dbReady) return Promise.resolve();

    // Serialize screen renders: a fast tap sequence must never mount two
    // screens on top of each other. The container is only cleared immediately
    // before the winning screen starts rendering.
    const run = this.renderQueue.then(async () => {
      if (token !== this.navigationToken || screen !== this.currentScreen || !this.screenContainer) return;

      const target = this.screenContainer;
      target.replaceChildren();

      switch (screen) {
        case 'subscribers':
          await new SubscribersScreen(target).render();
          break;
        case 'billing':
          await new BillingScreen(target).render();
          break;
        case 'expenses':
          await new ExpensesScreen(target).render();
          break;
        case 'reports':
          await new ReportsScreen(target).render();
          break;
        case 'settings':
          await new SettingsScreen(target).render();
          break;
        case 'saas':
          await new SaaSScreen(target).render();
          break;
      }
    });

    this.renderQueue = run.catch((err) => {
      console.error('[Ampereji] Screen render failed:', err);
    });
    return this.renderQueue;
  }

  private renderStartupError(container: HTMLElement, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'max-w-lg mx-auto mt-10 p-6 rounded-3xl bg-rose-950/40 border border-rose-800 text-center space-y-3';

    const icon = document.createElement('div');
    icon.className = 'text-4xl';
    icon.textContent = '⚠️';

    const title = document.createElement('h2');
    title.className = 'text-base font-black text-rose-200';
    title.textContent = 'تعذر تشغيل قاعدة البيانات المحلية';

    const detail = document.createElement('p');
    detail.className = 'text-xs text-rose-300 leading-relaxed break-words';
    detail.textContent = message;

    const hint = document.createElement('p');
    hint.className = 'text-[11px] text-slate-400 leading-relaxed';
    hint.textContent =
      'تأكد من فتح التطبيق عبر HTTPS أو localhost، ومن توفر مساحة تخزين كافية. إذا استمرت المشكلة فأعد تحميل الصفحة.';

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className =
      'min-h-[44px] px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm cursor-pointer';
    reload.textContent = 'إعادة المحاولة';
    reload.addEventListener('click', () => window.location.reload());

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(hint);
    card.appendChild(reload);
    container.appendChild(card);
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AmperejiApp().start());
} else {
  new AmperejiApp().start();
}
