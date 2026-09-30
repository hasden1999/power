/**
 * src/ui/components/BrowserWarningBanner.ts
 * Sticky Ephemeral Memory Mode Warning Banner for Browser Mode
 * Pure Vanilla TypeScript - Zero Dependencies
 */

import { platform, type PlatformInfo } from '../../platform.ts';
import { AR_INSTALL_TEXTS } from '../../config/install-texts.ts';

export class BrowserWarningBanner {
  private element: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {}

  /**
   * Mount banner to DOM container
   */
  public mount(container: HTMLElement): void {
    this.unsubscribe = platform.subscribe((info) => {
      this.render(container, info);
    });
  }

  /**
   * Render or update banner state
   */
  private render(container: HTMLElement, info: PlatformInfo): void {
    // If in standalone mode, remove warning banner completely
    if (info.isStandalone) {
      if (this.element && this.element.parentElement) {
        this.element.parentElement.removeChild(this.element);
        this.element = null;
      }
      return;
    }

    // Only display when user has entered ephemeral demo mode or storage is uninstalled
    if (info.storageMode !== 'ephemeral' && info.storageMode !== 'blocked') {
      if (this.element && this.element.parentElement) {
        this.element.parentElement.removeChild(this.element);
        this.element = null;
      }
      return;
    }

    if (!this.element) {
      this.element = document.createElement('aside');
      this.element.id = 'ephemeral-warning-banner';
      this.element.className =
        'sticky top-0 inset-x-0 z-50 bg-amber-500/15 backdrop-blur-md border-b border-amber-500/40 text-amber-200 py-2.5 px-4 shadow-md transition-all duration-300';
      this.element.setAttribute('role', 'alert');
      this.element.setAttribute('aria-live', 'assertive');

      const contentWrapper = document.createElement('div');
      contentWrapper.className =
        'max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm';

      // Left: Badge & Warning Message
      const messageCol = document.createElement('div');
      messageCol.className = 'flex items-center gap-2.5 flex-wrap';

      const badge = document.createElement('span');
      badge.className =
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50 animate-pulse';
      badge.textContent = AR_INSTALL_TEXTS.ephemeralWarning.badge;

      const text = document.createElement('span');
      text.className = 'font-medium leading-relaxed';
      text.textContent = AR_INSTALL_TEXTS.ephemeralWarning.message;

      messageCol.appendChild(badge);
      messageCol.appendChild(text);

      // Right: CTA Install Button
      const actionsCol = document.createElement('div');
      actionsCol.className = 'flex items-center gap-2 shrink-0';

      const installBtn = document.createElement('button');
      installBtn.type = 'button';
      installBtn.className =
        'px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs tracking-wide transition shadow hover:shadow-amber-500/20 active:scale-95 cursor-pointer';
      installBtn.textContent = AR_INSTALL_TEXTS.ephemeralWarning.installCta;
      installBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ampereji:request-install-ui'));
      });

      actionsCol.appendChild(installBtn);

      contentWrapper.appendChild(messageCol);
      contentWrapper.appendChild(actionsCol);
      this.element.appendChild(contentWrapper);

      container.prepend(this.element);
    }
  }

  /**
   * Destroy and clean up subscriptions
   */
  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
      this.element = null;
    }
  }
}
