import { useState, useEffect } from 'react';
import { db } from '../db/db';

export interface SyncStatusInfo {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: string | null;
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}


export function useSyncManager() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    localStorage.getItem('last_sync_time')
  );

  // تحديث عدد العناصر غير المتزامنة
  const refreshPendingCount = async () => {
    try {
      const count = await db.syncQueue.count();
      setPendingCount(count);
    } catch {
      // تجاهل الأخطاء العابرة
    }
  };

  // محاكاة المزامنة مع خادم الـ SaaS المركزي
  const triggerSync = async () => {
    if (!navigator.onLine || isSyncing) return;

    try {
      setIsSyncing(true);
      const queue = await db.syncQueue.toArray();

      if (queue.length > 0) {
        // محاكاة إرسال حزم البيانات عبر الـ API
        await new Promise((res) => setTimeout(res, 1200));

        // تحديث حالة السجلات المحلية
        for (const item of queue) {
          if (item.entity === 'payments') {
            await db.payments.update(item.entityId, { syncStatus: 'synced' });
          }
          await db.syncQueue.delete(item.id);
        }
      }

      const now = new Date().toLocaleTimeString('ar-IQ');
      setLastSyncTime(now);
      localStorage.setItem('last_sync_time', now);
      await refreshPendingCount();
    } catch (err) {
      console.error('فشل في المزامنة:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // التحقق الدوري كل 15 ثانية
    const interval = setInterval(() => {
      refreshPendingCount();
      if (navigator.onLine) {
        triggerSync();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncTime,
    triggerSync,
    refreshPendingCount,
  };
}
