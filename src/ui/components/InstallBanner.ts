/**
 * src/ui/components/InstallBanner.ts
 * Smart Bottom Install Banner and iOS Interactive Guidance Modal
 * Pure Vanilla TypeScript - Zero Dependencies
 */

import { platform, type PlatformInfo } from '../../platform.ts';
import { AR_INSTALL_TEXTS } from '../../config/install-texts.ts';

export class InstallBanner {
  private element: HTMLElement | null = null;
  private modalElement: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private forceShow: boolean = false;
  private onInstallRequest: (() => void) | null = null;

  constructor() {}

  /**
   * Mount banner to DOM container
   */
  public mount(container: HTMLElement): void {
    this.unsubscribe = platform.subscribe((info) => {
      this.render(container, info);
    });

    this.onInstallRequest = () => {
      this.forceShow = true;
      this.render(container, platform.getPlatformInfo());
    };
    window.addEventListener('ampereji:request-install-ui', this.onInstallRequest);
  }

  /**
   * Render or update banner state
   */
  private render(container: HTMLElement, info: PlatformInfo): void {
    // 1. Hide if already installed in standalone mode
    if (info.isStandalone) {
      this.dismissBanner();
      this.dismissModal();
      return;
    }

    // 2. Hide if snoozed and not forced
    if (platform.isSnoozed() && !this.forceShow) {
      this.dismissBanner();
      return;
    }

    // 3. Render bottom banner if not already present
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = 'smart-install-banner';
      this.element.className =
        'fixed bottom-0 inset-x-0 z-40 p-4 transition-transform duration-300 ease-out';

      const card = document.createElement('div');
      card.className =
        'max-w-3xl mx-auto rounded-2xl bg-slate-900/95 border-t-2 border-cyan-500/80 border-x border-b border-slate-700/60 p-5 shadow-2xl backdrop-blur-md text-slate-100';

      // Header row
      const headerRow = document.createElement('div');
      headerRow.className = 'flex items-start justify-between gap-4 mb-3';

      const titleGroup = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'text-lg font-black text-cyan-400 flex items-center gap-2';
      title.textContent = AR_INSTALL_TEXTS.banner.title;

      const subtitle = document.createElement('p');
      subtitle.className = 'text-xs text-slate-300 mt-1 leading-normal';
      subtitle.textContent = AR_INSTALL_TEXTS.banner.subtitle;

      titleGroup.appendChild(title);
      titleGroup.appendChild(subtitle);

      // Close / Snooze quick 'X'
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className =
        'text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer text-lg leading-none';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = AR_INSTALL_TEXTS.banner.buttons.snooze;
      closeBtn.addEventListener('click', () => {
        this.forceShow = false;
        platform.snoozeInstallBanner(3);
        this.dismissBanner();
      });

      headerRow.appendChild(titleGroup);
      headerRow.appendChild(closeBtn);
      card.appendChild(headerRow);

      // Benefits list
      const benefitsGrid = document.createElement('div');
      benefitsGrid.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3';

      for (const benefit of AR_INSTALL_TEXTS.banner.benefits) {
        const item = document.createElement('div');
        item.className = 'p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-xs';

        const bTitle = document.createElement('div');
        bTitle.className = 'font-bold text-slate-200 mb-0.5';
        bTitle.textContent = benefit.title;

        const bDesc = document.createElement('div');
        bDesc.className = 'text-slate-400 text-[11px] leading-relaxed';
        bDesc.textContent = benefit.desc;

        item.appendChild(bTitle);
        item.appendChild(bDesc);
        benefitsGrid.appendChild(item);
      }
      card.appendChild(benefitsGrid);

      // In-app warning box if applicable
      if (info.isInAppBrowser) {
        const inAppBox = document.createElement('div');
        inAppBox.className =
          'p-3 mb-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200';
        inAppBox.innerHTML = `<strong>${AR_INSTALL_TEXTS.inAppBrowser.warningTitle}</strong><br>${AR_INSTALL_TEXTS.inAppBrowser.warningBody}`;
        card.appendChild(inAppBox);
      }

      // Actions row
      const actionsRow = document.createElement('div');
      actionsRow.className = 'flex flex-wrap items-center justify-end gap-2.5 pt-2';

      // Demo button
      const demoBtn = document.createElement('button');
      demoBtn.type = 'button';
      demoBtn.className =
        'min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition active:scale-95 cursor-pointer';
      demoBtn.textContent = AR_INSTALL_TEXTS.banner.buttons.proceedDemo;
      demoBtn.addEventListener('click', () => {
        this.forceShow = false;
        platform.activateEphemeralDemoMode();
        this.dismissBanner();
      });

      // Snooze button
      const snoozeBtn = document.createElement('button');
      snoozeBtn.type = 'button';
      snoozeBtn.className =
        'min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition active:scale-95 cursor-pointer';
      snoozeBtn.textContent = AR_INSTALL_TEXTS.banner.buttons.snooze;
      snoozeBtn.addEventListener('click', () => {
        this.forceShow = false;
        platform.snoozeInstallBanner(3);
        this.dismissBanner();
      });

      // Install button
      const installBtn = document.createElement('button');
      installBtn.type = 'button';
      installBtn.className =
        'min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0E7490] hover:bg-[#0891b2] text-white text-sm font-bold shadow-lg shadow-cyan-900/40 transition active:scale-95 cursor-pointer flex items-center gap-2';
      installBtn.textContent = AR_INSTALL_TEXTS.banner.buttons.installNow;
      installBtn.addEventListener('click', async () => {
        if (info.isIOS) {
          this.showIOSModal(container);
        } else if (info.isInAppBrowser) {
          alert(AR_INSTALL_TEXTS.inAppBrowser.instruction);
        } else {
          const outcome = await platform.promptInstall();
          if (outcome === 'accepted') {
            this.dismissBanner();
          } else if (outcome === 'unsupported') {
            // If prompt not available, show guidance
            if (info.isIOS) {
              this.showIOSModal(container);
            } else {
              alert(
                'لتثبيت التطبيق على جهازك، اضغط على قائمة المتصفح (⋮) ثم اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".'
              );
            }
          }
        }
      });

      actionsRow.appendChild(demoBtn);
      actionsRow.appendChild(snoozeBtn);
      actionsRow.appendChild(installBtn);
      card.appendChild(actionsRow);

      this.element.appendChild(card);
      container.appendChild(this.element);
    }
  }

  /**
   * Show iOS step-by-step guidance modal sheet
   */
  private showIOSModal(container: HTMLElement): void {
    if (this.modalElement) return;

    this.modalElement = document.createElement('div');
    this.modalElement.id = 'ios-install-modal';
    this.modalElement.className =
      'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4';

    const sheet = document.createElement('div');
    sheet.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto';

    const title = document.createElement('h3');
    title.className = 'text-lg font-black text-cyan-400 mb-1';
    title.textContent = AR_INSTALL_TEXTS.iosGuide.modalTitle;

    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-300 mb-4 leading-relaxed';
    subtitle.textContent = AR_INSTALL_TEXTS.iosGuide.modalSubtitle;

    sheet.appendChild(title);
    sheet.appendChild(subtitle);

    const stepsList = document.createElement('div');
    stepsList.className = 'space-y-3 mb-5';

    for (const step of AR_INSTALL_TEXTS.iosGuide.steps) {
      const stepRow = document.createElement('div');
      stepRow.className = 'flex items-start gap-3 p-3 rounded-2xl bg-slate-800/70 border border-slate-700/50';

      const num = document.createElement('div');
      num.className =
        'w-7 h-7 rounded-full bg-cyan-600 text-white font-bold text-sm flex items-center justify-center shrink-0';
      num.textContent = step.stepNumber.toString();

      const textCol = document.createElement('div');
      const sTitle = document.createElement('div');
      sTitle.className = 'font-bold text-sm text-slate-200';
      sTitle.textContent = step.title;

      const sDesc = document.createElement('div');
      sDesc.className = 'text-xs text-slate-400 mt-0.5 leading-normal';
      sDesc.textContent = step.desc;

      textCol.appendChild(sTitle);
      textCol.appendChild(sDesc);
      stepRow.appendChild(num);
      stepRow.appendChild(textCol);
      stepsList.appendChild(stepRow);
    }
    sheet.appendChild(stepsList);

    const hint = document.createElement('p');
    hint.className = 'text-xs text-cyan-300/80 bg-cyan-950/40 border border-cyan-800/40 rounded-xl p-3 mb-5';
    hint.textContent = AR_INSTALL_TEXTS.iosGuide.hint;
    sheet.appendChild(hint);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className =
      'w-full min-h-[48px] py-3 rounded-xl bg-[#0E7490] hover:bg-[#0891b2] text-white text-sm font-bold shadow-md transition active:scale-98 cursor-pointer';
    closeBtn.textContent = AR_INSTALL_TEXTS.iosGuide.closeButton;
    closeBtn.addEventListener('click', () => {
      this.dismissModal();
    });

    sheet.appendChild(closeBtn);
    this.modalElement.appendChild(sheet);
    container.appendChild(this.modalElement);
  }

  private dismissModal(): void {
    if (this.modalElement && this.modalElement.parentElement) {
      this.modalElement.parentElement.removeChild(this.modalElement);
      this.modalElement = null;
    }
  }

  private dismissBanner(): void {
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
      this.element = null;
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.onInstallRequest) {
      window.removeEventListener('ampereji:request-install-ui', this.onInstallRequest);
      this.onInstallRequest = null;
    }
    this.dismissBanner();
    this.dismissModal();
  }
}
