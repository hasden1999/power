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

  support: {
    phone: '07764271130',
    whatsapp: '9647764271130',
    formattedPhone: '0776 427 1130',
    name: 'صاحب التطبيق / الدعم الفني',
  },

  plans: {
    trial: { label: 'فترة تجريبية (30 يوم)', days: 30, price: 0 },
    monthly: { label: 'اشتراك شهري', days: 30, price: 15000 },
    yearly: { label: 'اشتراك سنوي (365 يوم)', days: 365, price: 150000 },
    lifetime: { label: 'ترخيص دائمي (مدى الحياة)', days: 36500, price: 350000 },
  },

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
