/**
 * Test Environment Harness: Simulates Browser, Storage, and PWA Lifecycle
 */

export interface MockStorageEstimate {
  usage: number;
  quota: number;
}

export class MockStorageManager {
  private _isPersisted = false;
  private _usage = 1024 * 1024 * 12; // 12 MB default usage
  private _quota = 1024 * 1024 * 1024 * 5; // 5 GB default quota

  async persist(): Promise<boolean> {
    this._isPersisted = true;
    return true;
  }

  async persisted(): Promise<boolean> {
    return this._isPersisted;
  }

  async estimate(): Promise<MockStorageEstimate> {
    return {
      usage: this._usage,
      quota: this._quota
    };
  }

  setUsage(usage: number): void {
    this._usage = usage;
  }

  setPersisted(status: boolean): void {
    this._isPersisted = status;
  }
}

export class MockLocalStorage {
  private _store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this._store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this._store.set(key, String(value));
  }

  removeItem(key: string): void {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  get length(): number {
    return this._store.size;
  }

  key(index: number): string | null {
    return Array.from(this._store.keys())[index] ?? null;
  }
}

export interface PlatformContext {
  userAgent: string;
  isStandalone: boolean;
  standaloneMatched: boolean;
  hasServiceWorker: boolean;
  isCrosssiteIsolated: boolean;
}

export function createPlatformContext(options: Partial<PlatformContext> = {}): PlatformContext {
  return {
    userAgent: options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    isStandalone: options.isStandalone ?? false,
    standaloneMatched: options.standaloneMatched ?? false,
    hasServiceWorker: options.hasServiceWorker ?? true,
    isCrosssiteIsolated: options.isCrosssiteIsolated ?? true
  };
}

export function detectPlatform(context: PlatformContext) {
  const ua = context.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isInApp = /fbav|instagram|fban|line|micromessenger/.test(ua);
  const isStandalone = context.isStandalone || context.standaloneMatched;

  return {
    isIOS,
    isAndroid,
    isInApp,
    isStandalone,
    browserMode: !isStandalone,
    canPersistStorage: isStandalone && !isInApp
  };
}
