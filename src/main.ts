/**
 * src/main.ts
 * Main Application Entry Point - Ampereji (أمبيرجي)
 * Pure Vanilla TypeScript Architecture - 100% Offline & Zero External CDNs
 */

import './index.css';
import { platform, type PlatformInfo } from './platform.ts';
import { APP_CONFIG } from './config/app-config.ts';
import { AR_INSTALL_TEXTS } from './config/install-texts.ts';
import { db } from './db/database.ts';
import { BrowserWarningBanner } from './ui/components/BrowserWarningBanner.ts';
import { InstallBanner } from './ui/components/InstallBanner.ts';
import { BottomNav, type ScreenId } from './ui/components/BottomNav.ts';
import { SubscribersScreen } from './ui/screens/SubscribersScreen.ts';
import { BillingScreen } from './ui/screens/BillingScreen.ts';
import { ExpensesScreen } from './ui/screens/ExpensesScreen.ts';
import { ReportsScreen } from './ui/screens/ReportsScreen.ts';
import { SettingsScreen } from './ui/screens/SettingsScreen.ts';

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
  private isSunlightMode = false;

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
    this.bottomNav = new BottomNav((screen) => this.navigateTo(screen));
    this.bottomNav.mount(root);

    // Initialize Database
    try {
      const dbInfo = await db.init();
      console.log('[Ampereji] Database ready:', dbInfo);
    } catch (err: any) {
      console.error('[Ampereji] Database init failed:', err);
    }

    // Remove loading and render initial screen
    loadingBox.remove();
    await this.renderCurrentScreen();

    // Listen for database reload events
    window.addEventListener('ampereji:db-reloaded', async () => {
      await this.renderCurrentScreen();
    });

    window.addEventListener('ampereji:demo-mode-activated', async () => {
      await db.init();
      await this.renderCurrentScreen();
    });
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
    logoGroup.addEventListener('click', () => this.navigateTo('subscribers'));

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
    rightCol.className = 'flex items-center gap-2 text-xs';

    // Sunlight High Contrast Toggle
    const sunBtn = document.createElement('button');
    sunBtn.type = 'button';
    sunBtn.className =
      'min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold transition cursor-pointer flex items-center gap-1';
    sunBtn.innerHTML = '☀️ وضع الشمس';
    sunBtn.title = 'تبديل وضع النهار فائق التباين للعمل الميداني تحت أشعة الشمس';
    sunBtn.addEventListener('click', () => {
      this.isSunlightMode = !this.isSunlightMode;
      document.documentElement.classList.toggle('sunlight-mode', this.isSunlightMode);
      document.body.classList.toggle('sunlight-mode', this.isSunlightMode);
      sunBtn.innerHTML = this.isSunlightMode ? '🌙 الوضع الداكن' : '☀️ وضع الشمس';
    });

    const info = platform.getPlatformInfo();
    const modeBadge = document.createElement('span');
    modeBadge.className = `hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${
      info.isStandalone
        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
        : 'bg-amber-950 text-amber-300 border-amber-800'
    }`;
    modeBadge.textContent = info.isStandalone ? 'تطبيق مثبت 📱' : 'متصفح ويب 🌐';

    rightCol.appendChild(sunBtn);
    rightCol.appendChild(modeBadge);

    container.appendChild(logoGroup);
    container.appendChild(rightCol);
    header.appendChild(container);
    return header;
  }

  public async navigateTo(screen: ScreenId): Promise<void> {
    if (this.currentScreen === screen) return;
    this.currentScreen = screen;
    this.bottomNav?.setActive(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await this.renderCurrentScreen();
  }

  private async renderCurrentScreen(): Promise<void> {
    if (!this.screenContainer) return;

    switch (this.currentScreen) {
      case 'subscribers':
        await new SubscribersScreen(this.screenContainer).render();
        break;
      case 'billing':
        await new BillingScreen(this.screenContainer).render();
        break;
      case 'expenses':
        await new ExpensesScreen(this.screenContainer).render();
        break;
      case 'reports':
        await new ReportsScreen(this.screenContainer).render();
        break;
      case 'settings':
        await new SettingsScreen(this.screenContainer).render();
        break;
    }
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AmperejiApp().start());
} else {
  new AmperejiApp().start();
}
