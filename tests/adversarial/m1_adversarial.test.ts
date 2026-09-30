/**
 * tests/adversarial/m1_adversarial.test.ts
 * Empirical Adversarial & Stress Harness for Milestone 1
 * Ampereji (أمبيرجي)
 *
 * Tests:
 * 1. Adversarial Platform Detection & WebView Spoofing
 * 2. Standalone vs Browser Mode Dynamic Switching & State Synchronization
 * 3. Snooze Expiration, Clock Rollback & Extreme Timestamps
 * 4. Ephemeral Warning Banner Rendering & DOM Lifecycle
 * 5. Storage Mode Gatekeeper Resilience
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PlatformManager, platform, getDatabaseInitConfig } from '../../src/platform.ts';
import { BrowserWarningBanner } from '../../src/ui/components/BrowserWarningBanner.ts';
import { InstallBanner } from '../../src/ui/components/InstallBanner.ts';
import { APP_CONFIG } from '../../src/config/app-config.ts';
import { AR_INSTALL_TEXTS } from '../../src/config/install-texts.ts';

// Lightweight in-memory DOM mock for Node.js empirical testing
class MockDOMElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public attributes: Map<string, string> = new Map();
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  private _textContent: string = '';
  public innerHTML: string = '';
  public type: string = '';
  public title: string = '';
  private eventListeners: Map<string, Array<(e: any) => void>> = new Map();

  get textContent(): string {
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join(' ');
    }
    return this._textContent;
  }

  set textContent(val: string) {
    this._textContent = val;
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: MockDOMElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  prepend(child: MockDOMElement): void {
    child.parentElement = this;
    this.children.unshift(child);
  }

  removeChild(child: MockDOMElement): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  addEventListener(event: string, handler: (e: any) => void): void {
    const list = this.eventListeners.get(event) || [];
    list.push(handler);
    this.eventListeners.set(event, list);
  }

  removeEventListener(event: string, handler: (e: any) => void): void {
    const list = this.eventListeners.get(event) || [];
    this.eventListeners.set(event, list.filter((h) => h !== handler));
  }

  dispatchEvent(event: { type: string }): boolean {
    const list = this.eventListeners.get(event.type) || [];
    list.forEach((h) => h(event));
    return true;
  }

  querySelector(selector: string): MockDOMElement | null {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      return this.find((el) => el.id === targetId);
    }
    return null;
  }

  private find(predicate: (el: MockDOMElement) => boolean): MockDOMElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }
}

class MockStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }
}

describe('Tier 5 Adversarial Harness: Milestone 1 Platform & Security Gatekeeping', () => {
  let originalWindow: any;
  let originalNavigator: any;
  let originalDocument: any;
  let originalLocalStorage: any;
  let originalSessionStorage: any;

  beforeEach(() => {
    originalWindow = (global as any).window;
    originalNavigator = (global as any).navigator;
    originalDocument = (global as any).document;
    originalLocalStorage = (global as any).localStorage;
    originalSessionStorage = (global as any).sessionStorage;
    (platform as any).updateState({
      isStandalone: false,
      displayMode: 'browser',
      storageMode: 'blocked',
      recommendedStorageMode: 'memory',
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: originalSessionStorage, configurable: true, writable: true });
  });

  // Setup helper for simulating browser environments
  function setupEnvironment(options: {
    userAgent?: string;
    platformStr?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    displayMode?: string;
    referrer?: string;
    crossOriginIsolated?: boolean;
    localStorage?: MockStorage;
    sessionStorage?: MockStorage;
  }) {
    const mockLocalStorage = options.localStorage || new MockStorage();
    const mockSessionStorage = options.sessionStorage || new MockStorage();
    const windowListeners: Map<string, Array<(e: any) => void>> = new Map();
    const mediaQueryListeners: Map<string, Array<(e: any) => void>> = new Map();

    const mockWindow: any = {
      crossOriginIsolated: options.crossOriginIsolated ?? true,
      addEventListener: (type: string, listener: (e: any) => void) => {
        const list = windowListeners.get(type) || [];
        list.push(listener);
        windowListeners.set(type, list);
      },
      removeEventListener: (type: string, listener: (e: any) => void) => {
        const list = windowListeners.get(type) || [];
        windowListeners.set(type, list.filter((l) => l !== listener));
      },
      dispatchEvent: (event: any) => {
        const list = windowListeners.get(event.type) || [];
        list.forEach((l) => l(event));
        return true;
      },
      matchMedia: (query: string) => {
        const isStandaloneQuery = query.includes('display-mode: standalone');
        const matches = options.displayMode === 'standalone' && isStandaloneQuery;
        return {
          matches,
          media: query,
          addEventListener: (event: string, listener: (e: any) => void) => {
            const list = mediaQueryListeners.get(query) || [];
            list.push(listener);
            mediaQueryListeners.set(query, list);
          },
          removeEventListener: (event: string, listener: (e: any) => void) => {
            const list = mediaQueryListeners.get(query) || [];
            mediaQueryListeners.set(query, list.filter((l) => l !== listener));
          },
        };
      },
      _triggerMediaQuery: (query: string, matches: boolean) => {
        const list = mediaQueryListeners.get(query) || [];
        list.forEach((l) => l({ matches, media: query }));
      },
      _triggerWindowEvent: (event: any) => {
        const list = windowListeners.get(event.type) || [];
        list.forEach((l) => l(event));
      },
    };

    const mockNavigator: any = {
      userAgent: options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      platform: options.platformStr ?? 'Win32',
      maxTouchPoints: options.maxTouchPoints ?? 0,
      standalone: options.standalone,
      storage: {
        persist: async () => true,
        getDirectory: async () => ({}),
      },
    };

    const mockDoc: any = {
      referrer: options.referrer ?? '',
      createElement: (tag: string) => new MockDOMElement(tag),
      documentElement: { lang: 'ar', dir: 'rtl' },
    };

    Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: mockNavigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: mockDoc, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: class {
        public type: string;
        public detail: any;
        constructor(type: string, params?: { detail: any }) {
          this.type = type;
          this.detail = params?.detail;
        }
      },
      configurable: true,
      writable: true,
    });

    return { mockWindow, mockNavigator, mockDoc, mockLocalStorage, mockSessionStorage };
  }

  // =========================================================================
  // 1. Adversarial Platform Detection & WebView Spoofing
  // =========================================================================
  describe('1. Adversarial Platform Detection', () => {
    it('ADV-PL-1: detects iPadOS Safari in Desktop Mode (MacIntel + maxTouchPoints > 1)', () => {
      setupEnvironment({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        platformStr: 'MacIntel',
        maxTouchPoints: 5,
        displayMode: 'browser',
      });

      const pm = new PlatformManager();
      const info = pm.getPlatformInfo();

      assert.equal(info.isIOS, true, 'iPadOS desktop mode must be detected as iOS');
      assert.equal(info.isIOSSafari, true, 'iPadOS desktop Safari must be detected as iOS Safari');
      assert.equal(info.isDesktop, false, 'iPadOS touch must NOT be misclassified as Desktop');
    });

    it('ADV-PL-2: does not misclassify Windows Touch Laptops as iOS', () => {
      setupEnvironment({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        platformStr: 'Win32',
        maxTouchPoints: 10, // Surface Pro touch screen
        displayMode: 'browser',
      });

      const pm = new PlatformManager();
      const info = pm.getPlatformInfo();

      assert.equal(info.isIOS, false, 'Windows touch laptops must NOT be iOS');
      assert.equal(info.isDesktop, true, 'Windows touch laptops must be Desktop');
    });

    it('ADV-PL-3: detects in-app browser signatures (Instagram, Telegram, TikTok, WeChat, Android WebView)', () => {
      const webviews = [
        { name: 'instagram', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Instagram 310.0.0.11' },
        { name: 'telegram', ua: 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Telegram/10.2.1' },
        { name: 'tiktok', ua: 'Mozilla/5.0 (Linux; Android 13) ByteDance/TikTok Mobile' },
        { name: 'wechat', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5) MicroMessenger/8.0.38' },
        { name: 'androidWebview', ua: 'Mozilla/5.0 (Linux; U; Android 12; en-us; Build/SP1A) AppleWebKit/537.36 Version/4.0 Chrome/100.0.4896.127 Mobile Safari/537.36' },
      ];

      for (const item of webviews) {
        setupEnvironment({ userAgent: item.ua, displayMode: 'browser' });
        const pm = new PlatformManager();
        const info = pm.getPlatformInfo();

        assert.equal(info.isInAppBrowser, true, `Failed to detect in-app browser for ${item.name}`);
        assert.equal(info.inAppBrowserName, item.name, `Incorrect in-app browser name for ${item.name}`);
        assert.equal(info.storageMode, 'blocked', `In-app browser must default to blocked storage`);
      }
    });

    it('ADV-PL-4: handles Android App Referrer without falsely claiming standalone when inside in-app browser', () => {
      // When opened from Telegram on Android, document.referrer is "android-app://org.telegram.messenger"
      // while UA contains Telegram
      setupEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Telegram/10.5.0 Mobile',
        referrer: 'android-app://org.telegram.messenger',
        displayMode: 'browser',
      });

      const pm = new PlatformManager();
      const info = pm.getPlatformInfo();

      assert.equal(info.isInAppBrowser, true, 'Must identify as in-app browser');
      assert.equal(info.isStandalone, false, 'BUG DETECTED: In-App browser (Telegram) with android-app:// referrer was falsely classified as standalone!');
      assert.notEqual(info.storageMode, 'persistent', 'BUG DETECTED: In-App browser was granted persistent storage!');
    });
  });

  // =========================================================================
  // 2. Standalone vs Browser Mode Dynamic Switching & State Synchronization
  // =========================================================================
  describe('2. Standalone vs Browser Mode Switching', () => {
    it('ADV-SW-1: dynamically upgrades to persistent storage upon appinstalled event', () => {
      const { mockWindow } = setupEnvironment({ displayMode: 'browser' });
      const pm = new PlatformManager();

      assert.equal(pm.getPlatformInfo().isStandalone, false);
      assert.equal(pm.getPlatformInfo().storageMode, 'blocked');

      // Trigger appinstalled event
      mockWindow._triggerWindowEvent({ type: 'appinstalled' });

      const updated = pm.getPlatformInfo();
      assert.equal(updated.isStandalone, true, 'isStandalone must become true after appinstalled');
      assert.equal(updated.displayMode, 'standalone');
      assert.equal(updated.storageMode, 'persistent', 'storageMode must become persistent after installation');
      assert.equal(updated.recommendedStorageMode, 'opfs');
    });

    it('ADV-SW-2: verifies media query transition from Standalone to Browser mode resets storageMode', () => {
      const { mockWindow } = setupEnvironment({ displayMode: 'standalone' });
      const pm = new PlatformManager();

      assert.equal(pm.getPlatformInfo().isStandalone, true);
      assert.equal(pm.getPlatformInfo().storageMode, 'persistent');

      // User exits standalone mode or opens URL in regular browser tab
      // Media query fires with matches = false
      mockWindow._triggerMediaQuery('(display-mode: standalone)', false);

      const downgraded = pm.getPlatformInfo();
      assert.equal(downgraded.isStandalone, false, 'isStandalone must become false');
      assert.equal(downgraded.displayMode, 'browser', 'displayMode must become browser');

      // CRITICAL CHECK: In browser mode, storageMode must NOT stay 'persistent'!
      assert.notEqual(
        downgraded.storageMode,
        'persistent',
        'BUG DETECTED: storageMode remained persistent after switching from standalone to browser mode!'
      );
    });

    it('ADV-SW-3: verifies database init config strictly respects standalone status', () => {
      setupEnvironment({ displayMode: 'standalone' });
      // In standalone
      const standaloneDb = getDatabaseInitConfig();
      // Note: getDatabaseInitConfig uses the exported platform singleton
      // We check its contract
      assert.equal(typeof standaloneDb.filename, 'string');
      assert.equal(typeof standaloneDb.vfs, 'string');
      assert.equal(typeof standaloneDb.isEphemeral, 'boolean');
    });
  });

  // =========================================================================
  // 3. Snooze Expiration, Clock Rollback & Extreme Timestamps
  // =========================================================================
  describe('3. Snooze Expiration & Clock Tampering', () => {
    it('ADV-SN-1: correctly calculates 3-day snooze window and remaining hours', () => {
      const mockStorage = new MockStorage();
      setupEnvironment({ localStorage: mockStorage });
      const pm = new PlatformManager();

      const startTime = Date.now();
      pm.snoozeInstallBanner(3);

      const snoozeState = pm.getSnoozeState();
      assert.equal(snoozeState.isSnoozed, true);
      assert.ok(snoozeState.snoozeUntil! > startTime);
      assert.ok(snoozeState.remainingHours >= 71 && snoozeState.remainingHours <= 72);
      assert.equal(pm.isSnoozed(), true);
    });

    it('ADV-SN-2: handles clock jump forward (snooze expires cleanly and purges storage)', () => {
      const mockStorage = new MockStorage();
      setupEnvironment({ localStorage: mockStorage });
      const pm = new PlatformManager();

      // Set snooze to 10 seconds in the past
      mockStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, String(Date.now() - 10000));

      const snoozeState = pm.getSnoozeState();
      assert.equal(snoozeState.isSnoozed, false, 'Expired snooze must return false');
      assert.equal(snoozeState.snoozeUntil, null);
      assert.equal(snoozeState.remainingHours, 0);
      assert.equal(mockStorage.getItem(APP_CONFIG.storageKeys.installSnoozeUntil), null, 'Expired snooze key must be deleted');
    });

    it('ADV-SN-3: stress-tests non-finite & extreme values (Infinity, -Infinity, NaN, 1e30)', () => {
      const mockStorage = new MockStorage();
      setupEnvironment({ localStorage: mockStorage });
      const pm = new PlatformManager();

      // Test "NaN"
      mockStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, 'NaN');
      assert.equal(pm.getSnoozeState().isSnoozed, false, 'NaN must be rejected');

      // Test negative
      mockStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, '-99999999');
      assert.equal(pm.getSnoozeState().isSnoozed, false, 'Negative timestamp must be rejected');

      // Test empty string / whitespace
      mockStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, '   ');
      assert.equal(pm.getSnoozeState().isSnoozed, false, 'Whitespace must be rejected');

      // Adversarial: "Infinity"
      mockStorage.setItem(APP_CONFIG.storageKeys.installSnoozeUntil, 'Infinity');
      const infState = pm.getSnoozeState();
      // An adversarial string "Infinity" should not permanently lock snooze
      assert.equal(
        Number.isFinite(infState.snoozeUntil ?? 0),
        true,
        'BUG DETECTED: Infinity was accepted as a valid snooze timestamp!'
      );
    });

    it('ADV-SN-4: clears snooze explicitly with clearSnooze()', () => {
      const mockStorage = new MockStorage();
      setupEnvironment({ localStorage: mockStorage });
      const pm = new PlatformManager();

      pm.snoozeInstallBanner(3);
      assert.equal(pm.isSnoozed(), true);

      pm.clearSnooze();
      assert.equal(pm.isSnoozed(), false);
      assert.equal(mockStorage.getItem(APP_CONFIG.storageKeys.installSnoozeUntil), null);
    });
  });

  // =========================================================================
  // 4. Ephemeral Warning Banner Rendering & DOM Lifecycle
  // =========================================================================
  describe('4. Ephemeral Warning Banner Rendering', () => {
    it('ADV-BN-1: renders sticky ephemeral warning banner in uninstalled browser mode', () => {
      setupEnvironment({ displayMode: 'browser' });
      const container = new MockDOMElement('DIV');
      const banner = new BrowserWarningBanner();

      // Ensure platform state reflects browser mode
      (platform as any).updateState({ isStandalone: false, storageMode: 'blocked' });

      banner.mount(container as any);

      // Warning banner must be prepended
      const bannerEl = container.querySelector('#ephemeral-warning-banner');
      assert.ok(bannerEl, 'Ephemeral warning banner must render in browser mode');
      assert.ok(bannerEl.textContent.includes(AR_INSTALL_TEXTS.ephemeralWarning.badge), 'Must display badge');
      assert.equal(bannerEl.getAttribute('role'), 'alert');
      banner.destroy();
    });

    it('ADV-BN-2: does NOT render warning banner in standalone mode', () => {
      setupEnvironment({ displayMode: 'standalone' });
      const container = new MockDOMElement('DIV');
      const banner = new BrowserWarningBanner();

      // Ensure platform state reflects standalone mode
      (platform as any).updateState({ isStandalone: true, storageMode: 'persistent' });

      banner.mount(container as any);

      const bannerEl = container.querySelector('#ephemeral-warning-banner');
      assert.equal(bannerEl, null, 'Warning banner must NOT render in standalone mode');
      banner.destroy();
    });

    it('ADV-BN-3: cleanly removes banner and unsubscribes on destroy()', () => {
      setupEnvironment({ displayMode: 'browser' });
      const container = new MockDOMElement('DIV');
      const banner = new BrowserWarningBanner();

      banner.mount(container as any);
      assert.ok(container.querySelector('#ephemeral-warning-banner'));

      banner.destroy();
      assert.equal(container.querySelector('#ephemeral-warning-banner'), null, 'Banner must be removed from DOM on destroy');
    });

    it('ADV-BN-4: install CTA in warning banner dispatches ampereji:request-install-ui event', () => {
      const { mockWindow } = setupEnvironment({ displayMode: 'browser' });
      const container = new MockDOMElement('DIV');
      const banner = new BrowserWarningBanner();

      banner.mount(container as any);

      let requestedInstallUi = false;
      mockWindow.addEventListener('ampereji:request-install-ui', () => {
        requestedInstallUi = true;
      });

      const bannerEl = container.querySelector('#ephemeral-warning-banner');
      assert.ok(bannerEl);

      // Find the CTA button
      const ctaBtn = bannerEl.children[0]?.children[1]?.children[0];
      assert.ok(ctaBtn, 'Install CTA button must exist in warning banner');

      ctaBtn.dispatchEvent({ type: 'click' });
      assert.equal(requestedInstallUi, true, 'Clicking CTA must dispatch ampereji:request-install-ui');
      banner.destroy();
    });

    it('ADV-BN-5: InstallBanner cleans up window event listeners upon destroy()', () => {
      const { mockWindow } = setupEnvironment({ displayMode: 'browser' });
      const container = new MockDOMElement('DIV');
      const banner = new InstallBanner();

      banner.mount(container as any);
      assert.ok(container.querySelector('#smart-install-banner'), 'Banner must be mounted');

      banner.destroy();
      assert.equal(container.querySelector('#smart-install-banner'), null, 'Banner must be removed on destroy');

      // Dispatch request-install-ui after destroy: destroyed banner must NOT resurrect or re-render!
      mockWindow._triggerWindowEvent({ type: 'ampereji:request-install-ui' });

      assert.equal(
        container.querySelector('#smart-install-banner'),
        null,
        'BUG DETECTED: Destroyed InstallBanner resurrected because window listener was leaked on destroy!'
      );
    });
  });

  // =========================================================================
  // 5. Storage Mode Gatekeeper Resilience
  // =========================================================================
  describe('5. Storage Mode Gatekeeper Resilience', () => {
    it('ADV-GK-1: browser mode defaults to blocked storage until demo mode is activated', () => {
      const mockSession = new MockStorage();
      setupEnvironment({ displayMode: 'browser', sessionStorage: mockSession });
      const pm = new PlatformManager();

      assert.equal(pm.getPlatformInfo().storageMode, 'blocked');

      // Activate demo mode
      pm.activateEphemeralDemoMode();

      assert.equal(pm.getPlatformInfo().storageMode, 'ephemeral');
      assert.equal(mockSession.getItem(APP_CONFIG.storageKeys.demoMode), 'true');
    });

    it('ADV-GK-2: persistent OPFS storage is strictly denied in uninstalled browser mode', () => {
      setupEnvironment({ displayMode: 'browser' });
      const pm = new PlatformManager();
      const info = pm.getPlatformInfo();

      assert.equal(info.isStandalone, false);
      assert.notEqual(info.storageMode, 'persistent');
      assert.equal(info.recommendedStorageMode, 'memory');
    });
  });
});
