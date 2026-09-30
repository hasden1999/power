/**
 * src/platform.ts
 * Platform Discovery, Standalone Enforcement & Storage Mode Gatekeeper
 * Pure Vanilla TypeScript - Zero Dependencies
 */

import { APP_CONFIG } from './config/app-config.ts';

export type DisplayMode = 'standalone' | 'browser' | 'minimal-ui' | 'fullscreen';
export type StorageMode = 'persistent' | 'ephemeral' | 'blocked';

export interface PlatformCapabilities {
  hasStorageManager: boolean;
  hasPersistentStorage: boolean;
  hasOpfs: boolean;
  hasSharedArrayBuffer: boolean;
  isCrossOriginIsolated: boolean;
}

export interface PlatformInfo {
  isStandalone: boolean;
  displayMode: DisplayMode;
  isIOS: boolean;
  isIOSSafari: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isInAppBrowser: boolean;
  inAppBrowserName: string | null;
  supportsOPFS: boolean;
  supportsStoragePersist: boolean;
  canInstallPrompt: boolean;
  storageMode: StorageMode;
  capabilities: PlatformCapabilities;
  recommendedStorageMode: 'opfs' | 'memory';
}

export interface InstallSnoozeState {
  isSnoozed: boolean;
  snoozeUntil: number | null;
  remainingHours: number;
}

export type PlatformListener = (info: PlatformInfo) => void;

export class PlatformManager {
  private deferredPrompt: any = null;
  private listeners: Set<PlatformListener> = new Set();
  private state: PlatformInfo;

  constructor() {
    this.state = this.evaluatePlatform();
    this.initEventListeners();
  }

  /**
   * Evaluate the execution platform, display mode, and storage capabilities
   */
  public evaluatePlatform(): PlatformInfo {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        isStandalone: false,
        displayMode: 'browser',
        isIOS: false,
        isIOSSafari: false,
        isAndroid: false,
        isDesktop: false,
        isInAppBrowser: false,
        inAppBrowserName: null,
        supportsOPFS: false,
        supportsStoragePersist: false,
        canInstallPrompt: false,
        storageMode: 'blocked',
        capabilities: {
          hasStorageManager: false,
          hasPersistentStorage: false,
          hasOpfs: false,
          hasSharedArrayBuffer: false,
          isCrossOriginIsolated: false,
        },
        recommendedStorageMode: 'memory',
      };
    }

    const ua = navigator.userAgent || '';
    const platformStr = (navigator as any).userAgentData?.platform || navigator.platform || '';

    // 1. Detect iOS / iPadOS (including iPadOS 13+ requesting desktop site)
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (platformStr === 'MacIntel' && navigator.maxTouchPoints > 1 && !('MSStream' in window));

    // 2. Detect In-App Browsers (WebViews)
    const inAppSignatures: Record<string, RegExp> = {
      telegram: /Telegram/i,
      instagram: /Instagram/i,
      facebook: /FBAN|FBAV/i,
      twitter: /Twitter/i,
      tiktok: /musical_ly|ByteDance|TikTok/i,
      snapchat: /Snapchat/i,
      line: /Line\//i,
      wechat: /MicroMessenger/i,
      androidWebview: /\bwv\b|Version\/.*Chrome/i,
    };

    let isInAppBrowser = false;
    let inAppBrowserName: string | null = null;

    for (const [name, regex] of Object.entries(inAppSignatures)) {
      if (regex.test(ua)) {
        isInAppBrowser = true;
        inAppBrowserName = name;
        break;
      }
    }

    const isIOSStandalone = Boolean((navigator as any).standalone === true);

    if (isIOS && !isIOSStandalone && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) {
      isInAppBrowser = true;
      if (!inAppBrowserName) inAppBrowserName = 'iosWebview';
    }

    // 3. Detect Standalone PWA mode
    // Standalone mode is strictly false if inside an in-app browser (ADV-PL-4)
    const hasStandaloneDisplayMode =
      (typeof window.matchMedia === 'function' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches)) ||
      isIOSStandalone;

    const hasAndroidAppReferrer =
      typeof document !== 'undefined' && document.referrer.startsWith('android-app://');

    const isStandalone = !isInAppBrowser && (hasStandaloneDisplayMode || hasAndroidAppReferrer);

    const displayMode: DisplayMode = isStandalone ? 'standalone' : 'browser';

    // 4. Detect iOS Safari
    const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
    const isIOSSafari =
      isIOS && /Safari/i.test(ua) && !isOtherIOSBrowser && !isInAppBrowser && !isStandalone;

    // 5. Detect Android and Desktop
    const isAndroid = /Android/i.test(ua);
    const isDesktop = !isIOS && !isAndroid && !/Mobi/i.test(ua);

    // 6. Storage & Security Capabilities
    const hasStorageManager = typeof navigator.storage !== 'undefined';
    const supportsOPFS =
      hasStorageManager && typeof (navigator.storage as any)?.getDirectory === 'function';
    const supportsStoragePersist =
      hasStorageManager && typeof navigator.storage?.persist === 'function';
    const isCrossOriginIsolated = Boolean(window.crossOriginIsolated);
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

    // 7. Initial Storage Mode determination
    const storageMode: StorageMode = isStandalone
      ? 'persistent'
      : this.isDemoApproved()
        ? 'ephemeral'
        : 'blocked';

    return {
      isStandalone,
      displayMode,
      isIOS,
      isIOSSafari,
      isAndroid,
      isDesktop,
      isInAppBrowser,
      inAppBrowserName,
      supportsOPFS,
      supportsStoragePersist,
      canInstallPrompt: !!this.deferredPrompt,
      storageMode,
      capabilities: {
        hasStorageManager,
        hasPersistentStorage: supportsStoragePersist,
        hasOpfs: supportsOPFS,
        hasSharedArrayBuffer,
        isCrossOriginIsolated,
      },
      recommendedStorageMode: isStandalone ? 'opfs' : 'memory',
    };
  }

  /**
   * Helper to check if ephemeral demo mode has been approved in this session
   */
  private isDemoApproved(): boolean {
    try {
      return (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(APP_CONFIG.storageKeys.demoMode) === 'true'
      );
    } catch (_) {
      return false;
    }
  }

  private initEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Listen for display mode changes (e.g. installed or launched)
    try {
      if (typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(display-mode: standalone)');
        mq.addEventListener?.('change', (e) => {
          this.updateState({
            isStandalone: e.matches,
            displayMode: e.matches ? 'standalone' : 'browser',
            storageMode: e.matches
              ? 'persistent'
              : this.isDemoApproved()
                ? 'ephemeral'
                : 'blocked',
            recommendedStorageMode: e.matches ? 'opfs' : 'memory',
          });
        });
      }
    } catch (_) {}

    // Capture beforeinstallprompt for Chromium/Android
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateState({ canInstallPrompt: true });
      window.dispatchEvent(new CustomEvent('ampereji:installprompt-ready'));
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.clearSnooze();
      this.updateState({
        isStandalone: true,
        displayMode: 'standalone',
        canInstallPrompt: false,
        storageMode: 'persistent',
        recommendedStorageMode: 'opfs',
      });
      window.dispatchEvent(new CustomEvent('ampereji:app-installed'));
    });
  }

  private updateState(partial: Partial<PlatformInfo>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[PlatformManager] Listener error:', err);
      }
    }
  }

  public getPlatformInfo(): PlatformInfo {
    return this.state;
  }

  public subscribe(listener: PlatformListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Prompt user with native installation dialog
   */
  public async promptInstall(): Promise<'accepted' | 'dismissed' | 'unsupported'> {
    if (!this.deferredPrompt) {
      return 'unsupported';
    }
    try {
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        this.updateState({
          isStandalone: true,
          displayMode: 'standalone',
          storageMode: 'persistent',
          recommendedStorageMode: 'opfs',
        });
      }
      this.deferredPrompt = null;
      this.updateState({ canInstallPrompt: false });
      return choice.outcome;
    } catch (err) {
      console.error('[PlatformManager] Installation prompt error:', err);
      return 'unsupported';
    }
  }

  /**
   * Activate temporary ephemeral memory mode
   */
  public activateEphemeralDemoMode(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(APP_CONFIG.storageKeys.demoMode, 'true');
      }
    } catch (_) {}
    this.updateState({ storageMode: 'ephemeral' });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ampereji:demo-mode-activated'));
    }
  }

  /**
   * Snooze the installation banner for a period of days (default: 3)
   */
  public snoozeInstallBanner(days: number = APP_CONFIG.installSnoozeDays): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const snoozeUntil = Date.now() + days * 24 * 60 * 60 * 1000;
        localStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, snoozeUntil.toString());
      }
    } catch (_) {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ampereji:install-snoozed'));
    }
  }

  /**
   * Check if installation prompt is currently snoozed
   */
  public isSnoozed(): boolean {
    const snoozeState = this.getSnoozeState();
    return snoozeState.isSnoozed;
  }

  /**
   * Get detailed snooze state
   */
  public getSnoozeState(): InstallSnoozeState {
    if (typeof localStorage === 'undefined') {
      return { isSnoozed: false, snoozeUntil: null, remainingHours: 0 };
    }
    try {
      const raw = localStorage.getItem(APP_CONFIG.storageKeys.installSnoozeUntil);
      if (!raw) return { isSnoozed: false, snoozeUntil: null, remainingHours: 0 };

      const timestamp = Number(raw);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        localStorage.removeItem(APP_CONFIG.storageKeys.installSnoozeUntil);
        return { isSnoozed: false, snoozeUntil: null, remainingHours: 0 };
      }

      const now = Date.now();
      if (now >= timestamp || timestamp > now + 365 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(APP_CONFIG.storageKeys.installSnoozeUntil);
        return { isSnoozed: false, snoozeUntil: null, remainingHours: 0 };
      }

      const remainingHours = Math.ceil((timestamp - now) / (1000 * 60 * 60));
      return { isSnoozed: true, snoozeUntil: timestamp, remainingHours };
    } catch (_) {
      return { isSnoozed: false, snoozeUntil: null, remainingHours: 0 };
    }
  }

  /**
   * Clear install snooze
   */
  public clearSnooze(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(APP_CONFIG.storageKeys.installSnoozeUntil);
      }
    } catch (_) {}
  }
}

export const platform = new PlatformManager();

/**
 * Returns database initialization parameters for Milestone 2 Web Worker
 */
export function getDatabaseInitConfig(): {
  filename: string;
  vfs: 'opfs' | 'memdb';
  isEphemeral: boolean;
} {
  const info = platform.getPlatformInfo();
  if (info.isStandalone) {
    return {
      filename: '/ampereji.sqlite',
      vfs: 'opfs',
      isEphemeral: false,
    };
  }
  return {
    filename: ':memory:',
    vfs: 'memdb',
    isEphemeral: true,
  };
}

// Standalone utility exports
export function snoozeInstallPrompt(days: number = APP_CONFIG.installSnoozeDays): void {
  platform.snoozeInstallBanner(days);
}

export function clearInstallSnooze(): void {
  platform.clearSnooze();
}

export function getInstallSnoozeState(): InstallSnoozeState {
  return platform.getSnoozeState();
}
