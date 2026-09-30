/**
 * src/config/app-config.ts
 * Application Configuration & Constants for Ampereji (أمبيرجي)
 */

export const APP_CONFIG = {
  name: 'أمبيرجي (نظام إدارة المولدات الأهلية)',
  shortName: 'أمبيرجي',
  version: '3.0.0',
  themeColor: '#0E7490',
  backgroundColor: '#0f172a',
  trialDays: 30,
  installSnoozeDays: 3,

  storageKeys: {
    installSnoozeUntil: 'ampereji_install_snooze_until',
    demoMode: 'ampereji_demo_mode',
    themePreference: 'ampereji_theme',
  },

  limits: {
    maxWasmCacheBytes: 6 * 1024 * 1024, // 6MB for SQLite WASM and fonts
    touchTargetMinSizePx: 44,
  },
} as const;
