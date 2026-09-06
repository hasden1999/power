export const APP_VERSION = 'v2.5.0';

/**
 * دالة التفريغ الإجباري للذاكرة المؤقتة (Cache Buster)
 * تقوم بإلغاء تسجيل السيرفس وركر ومسح كاش المتصفح وإعادة التحميل برابط محدث
 */
export async function forceReloadAndClearCache() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) {
        await caches.delete(k);
      }
    }
  } catch (err) {
    console.error('Error clearing cache:', err);
  } finally {
    window.location.href = window.location.origin + window.location.pathname + '?refresh=' + Date.now();
  }
}