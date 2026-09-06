import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialData } from './db/db';
import { useSyncManager } from './services/syncService';
import { Navbar } from './components/Navbar';
import { CollectionScreen } from './components/CollectionScreen';
import { SubscribersScreen } from './components/SubscribersScreen';
import { PricingScreen } from './components/PricingScreen';
import { SaaSScreen } from './components/SaaSScreen';
import { AuthScreen } from './components/AuthScreen';
import { SuperAdminScreen } from './components/SuperAdminScreen';
import { InstallModal } from './components/InstallModal';
import type { TenantSettings, UserAccount } from './types';

export function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [currentTenant, setCurrentTenant] = useState<TenantSettings | null>(null);
  
  // وضع المعاينة والدعم الفني للسوبر أدمن
  const [impersonatedTenant, setImpersonatedTenant] = useState<TenantSettings | null>(null);

  const [currentTab, setCurrentTab] = useState<'collection' | 'subscribers' | 'pricing' | 'saas'>('collection');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);

  // جلب إعدادات المولدة الحالية المسجل الدخول بها
  const activeTenantId = impersonatedTenant?.id || currentTenant?.id || '';

  // إدارة المزامنة وحالة الاتصال بالسحابة
  const syncInfo = useSyncManager(activeTenantId);
  const tenantFromDb = useLiveQuery(
    () => (activeTenantId ? db.settings.get(activeTenantId) : undefined),
    [activeTenantId]
  );
  const activeSettings = tenantFromDb || impersonatedTenant || currentTenant || undefined;

  // استعادة الجلسة الأولية وتهيئة البيانات
  useEffect(() => {
    seedInitialData().then(async () => {
      const savedUserId = localStorage.getItem('saas_user_id');
      if (savedUserId) {
        const user = await db.users.get(savedUserId);
        if (user) {
          setCurrentUser(user);
          if (user.tenantId) {
            const tenant = await db.settings.get(user.tenantId);
            if (tenant) setCurrentTenant(tenant);
          }
        }
      }
      setIsInitialized(true);
    });
  }, []);

  // معالجة نجاح تسجيل الدخول
  const handleLoginSuccess = (user: UserAccount, tenant?: TenantSettings) => {
    setCurrentUser(user);
    setCurrentTenant(tenant || null);
    setImpersonatedTenant(null);
    localStorage.setItem('saas_user_id', user.id);
  };

  // تسجيل الخروج
  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentTenant(null);
    setImpersonatedTenant(null);
    localStorage.removeItem('saas_user_id');
  };

  // دخول السوبر أدمن بحساب مولدة كدعم فني
  const handleSwitchToTenant = (tenant: TenantSettings) => {
    setImpersonatedTenant(tenant);
    setCurrentTab('collection');
  };

  // رجوع السوبر أدمن من وضع المعاينة
  const handleBackToAdmin = () => {
    setImpersonatedTenant(null);
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-300">جاري تهيئة منصة المولدات السحابية...</p>
      </div>
    );
  }

  // 1. إذا لم يكن هناك تسجيل دخول، تظهر شاشة المصادقة
  if (!currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. إذا كان المستخدم صاحب المنصة ولم يختر معاينة مولدة معينة
  if (currentUser.role === 'super_admin' && !impersonatedTenant) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-6">
          <SuperAdminScreen
            onSwitchToTenant={handleSwitchToTenant}
            onLogout={handleLogout}
          />
        </main>
      </div>
    );
  }

  // 3. شاشة تطبيق المولدة (المستأجر)
  const tenantId = activeSettings?.id || 'tenant-01';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* شريط التنقل العلوي */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        syncInfo={syncInfo}
        generatorName={activeSettings?.generatorName || 'مولدة الحي'}
        currentUser={currentUser}
        onLogout={handleLogout}
        onBackToAdmin={currentUser.role === 'super_admin' ? handleBackToAdmin : undefined}
        isImpersonating={Boolean(impersonatedTenant)}
        onOpenInstall={() => setIsInstallOpen(true)}
      />

      {/* نافذة تثبيت التطبيق وتجهيز قاعدة البيانات المحلية */}
      <InstallModal
        tenantId={tenantId}
        generatorName={activeSettings?.generatorName}
        isOpen={isInstallOpen ? true : undefined}
        onClose={() => setIsInstallOpen(false)}
      />

      {/* المحتوى الرئيسي للمولدة */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        
        {currentTab === 'collection' && (
          <CollectionScreen
            tenantId={tenantId}
            settings={activeSettings}
            onRefreshSync={syncInfo.refreshPendingCount}
          />
        )}

        {currentTab === 'subscribers' && (
          <SubscribersScreen tenantId={tenantId} />
        )}

        {currentTab === 'pricing' && (
          <PricingScreen
            tenantId={tenantId}
            settings={activeSettings}
            onRefreshSync={syncInfo.refreshPendingCount}
          />
        )}

        {currentTab === 'saas' && (
          <SaaSScreen
            settings={activeSettings}
            onUpdateSettings={() => syncInfo.refreshPendingCount()}
          />
        )}

      </main>

      {/* تذييل الصفحة */}
      <footer className="py-3 border-t border-slate-800/80 text-center text-xs text-slate-500 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            منصة ساس المولدات الأهلية العراقية © {new Date().getFullYear()} - مرخصة لمولدة: {activeSettings?.generatorName}
          </span>
          <span className="text-slate-400">
            العملة المعتمدة: الدينار العراقي (IQD)
          </span>
        </div>
      </footer>

    </div>
  );
}

export default App;
