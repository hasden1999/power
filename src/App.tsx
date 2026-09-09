import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialData } from './db/db';
import { useSyncManager } from './services/syncService';
import { Navbar } from './components/Navbar';
import { CollectionScreen } from './components/CollectionScreen';
import { SubscribersScreen } from './components/SubscribersScreen';
import { PricingScreen } from './components/PricingScreen';
import { ExpensesScreen } from './components/ExpensesScreen';
import { SaaSScreen } from './components/SaaSScreen';
import { AuthScreen } from './components/AuthScreen';
import { SuperAdminScreen } from './components/SuperAdminScreen';
import { InstallModal } from './components/InstallModal';
import { SubscriptionStatusScreen } from './components/SubscriptionStatusScreen';
import { MobileBottomNav } from './components/MobileBottomNav';
import { QuickActionHub } from './components/QuickActionHub';
import { supabase } from './services/supabaseClient';
import type { TenantSettings, UserAccount } from './types';

export function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [currentTenant, setCurrentTenant] = useState<TenantSettings | null>(null);
  
  // وضع المعاينة والدعم الفني للسوبر أدمن
  const [impersonatedTenant, setImpersonatedTenant] = useState<TenantSettings | null>(null);

  const [currentTab, setCurrentTab] = useState<'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas'>('collection');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // الاستماع لحدث توفر تحديث جديد لتنبيه المستخدم بسلاسة دون مقاطعة
  useEffect(() => {
    const onUpdateReady = () => setUpdateAvailable(true);
    window.addEventListener('app-update-ready', onUpdateReady);
    return () => window.removeEventListener('app-update-ready', onUpdateReady);
  }, []);

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
            let tenant = await db.settings.get(user.tenantId);

            // جلب أحدث بيانات المولدة وحالة الاشتراك من السحابة إذا كان أونلاين
            if (navigator.onLine) {
              try {
                const { data: cloudTenant } = await supabase
                  .from('tenants')
                  .select('*')
                  .eq('id', user.tenantId)
                  .maybeSingle();

                if (cloudTenant) {
                  tenant = {
                    id: cloudTenant.id,
                    generatorName: cloudTenant.generator_name,
                    ownerName: cloudTenant.owner_name,
                    phone: cloudTenant.phone || '',
                    address: cloudTenant.address || '',
                    plan: cloudTenant.plan || 'trial',
                    planPrice: Number(cloudTenant.plan_price) || 0,
                    subscriptionStatus: cloudTenant.subscription_status || 'trial',
                    isBlocked: Boolean(cloudTenant.is_blocked),
                    expiresAt: cloudTenant.expires_at,
                    autoSendWhatsapp: Boolean(cloudTenant.auto_send_whatsapp),
                    defaultPriceNormal: Number(cloudTenant.default_price_normal) || 0,
                    defaultPriceGold: Number(cloudTenant.default_price_gold) || 0,
                    createdAt: cloudTenant.created_at,
                  };
                  await db.settings.put(tenant);
                }
              } catch {
                // تجاهل خطأ الاتصال
              }
            }

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

  // 3. التحقق من صلاحية اشتراك المولدة (إذا كان منتهياً بعد 7 أيام أو محظوراً)
  const refreshTenantData = async () => {
    if (currentUser?.tenantId) {
      if (navigator.onLine) {
        try {
          const { data: cloudTenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', currentUser.tenantId)
            .maybeSingle();

          if (cloudTenant) {
            const appTenant: TenantSettings = {
              id: cloudTenant.id,
              generatorName: cloudTenant.generator_name,
              ownerName: cloudTenant.owner_name,
              phone: cloudTenant.phone || '',
              address: cloudTenant.address || '',
              plan: cloudTenant.plan || 'trial',
              planPrice: Number(cloudTenant.plan_price) || 0,
              subscriptionStatus: cloudTenant.subscription_status || 'trial',
              isBlocked: Boolean(cloudTenant.is_blocked),
              expiresAt: cloudTenant.expires_at,
              autoSendWhatsapp: Boolean(cloudTenant.auto_send_whatsapp),
              defaultPriceNormal: Number(cloudTenant.default_price_normal) || 0,
              defaultPriceGold: Number(cloudTenant.default_price_gold) || 0,
              createdAt: cloudTenant.created_at,
            };
            await db.settings.put(appTenant);
            setCurrentTenant(appTenant);
            return;
          }
        } catch {
          // تجاهل أي خطأ عابر
        }
      }

      const updated = await db.settings.get(currentUser.tenantId);
      if (updated) {
        setCurrentTenant(updated);
      }
    }
  };

  const isBlocked = Boolean(activeSettings?.isBlocked);
  const isExpired = Boolean(
    activeSettings?.expiresAt && new Date(activeSettings.expiresAt) <= new Date()
  );

  // القفل يتم فقط إذا كان الحساب محظوراً من قبل صاحب المنصة، أو إذا انتهت فترة الـ 7 أيام التجريبية / فترة الاشتراك
  const isLocked = !impersonatedTenant && (isBlocked || isExpired);

  if (isLocked && activeSettings && currentUser.role !== 'super_admin') {
    return (
      <SubscriptionStatusScreen
        tenant={activeSettings}
        user={currentUser}
        onLogout={handleLogout}
        onRefreshTenant={refreshTenantData}
      />
    );
  }

  // 4. شاشة تطبيق المولدة (المستأجر بعد التفعيل)
  const tenantId = activeSettings?.id || 'tenant-01';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* شريط تحديث المنظومة غير المتطفل عند توفر إصدار أحدث */}
      {updateAvailable && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white px-4 py-2.5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm font-bold z-50 border-b border-emerald-400 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-200 animate-pulse"></span>
            <span>⚡ يتوفر إصدار جديد ومحدث من المنظومة، يمكنك التحديث فور إنهاء عملك:</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-emerald-900 px-4 py-1.5 rounded-xl text-xs font-black shadow hover:bg-emerald-50 transition cursor-pointer flex-shrink-0"
          >
            تحديث المنظومة الآن 🔄
          </button>
        </div>
      )}

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

      {/* شريط تنبيه: إما فترة تجريبية مجانية (7 أيام) أو تنبيه قبل 5 أيام من انتهاء الاشتراك */}
      {!impersonatedTenant &&
        activeSettings?.expiresAt &&
        (() => {
          const daysLeft = Math.ceil((new Date(activeSettings.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const isTrial = activeSettings.subscriptionStatus === 'trial' || activeSettings.plan === 'trial';

          if (daysLeft <= 0) return null;

          if (isTrial) {
            return (
              <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 text-white px-4 py-2.5 shadow-lg border-b border-blue-400/40 flex flex-col sm:flex-row items-center justify-between gap-2 z-30">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>
                    🎁 أنت الآن في الفترة التجريبية المجانية: متبقي {daysLeft} {daysLeft === 1 ? 'يوم' : 'أيام'} (ينتهي العرض بتاريخ {new Date(activeSettings.expiresAt).toLocaleDateString('ar-IQ')}).
                  </span>
                </div>
                <button
                  onClick={() => setCurrentTab('saas')}
                  className="bg-slate-950 hover:bg-slate-900 text-amber-400 border border-amber-400/40 px-3.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex-shrink-0 shadow"
                >
                  تثبيت الاشتراك الدائم
                </button>
              </div>
            );
          }

          if (daysLeft <= 5 && activeSettings.subscriptionStatus === 'active') {
            return (
              <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-slate-950 px-4 py-2.5 shadow-lg border-b border-amber-400 flex flex-col sm:flex-row items-center justify-between gap-2 z-30">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                  <span>
                    ⚠️ تنبيه تجديد الاشتراك: ينتهي اشتراك مولدتكم بعد {daysLeft} أيام (بتاريخ {new Date(activeSettings.expiresAt).toLocaleDateString('ar-IQ')}). يرجى طلب التجديد عبر واتساب المطور.
                  </span>
                </div>
                <button
                  onClick={() => setCurrentTab('saas')}
                  className="bg-slate-950 hover:bg-slate-900 text-amber-400 border border-amber-400/40 px-3.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex-shrink-0 shadow"
                >
                  طلب التجديد الآن (واتساب)
                </button>
              </div>
            );
          }

          return null;
        })()}

      {/* نافذة تثبيت التطبيق وتجهيز قاعدة البيانات المحلية */}
      <InstallModal
        tenantId={tenantId}
        generatorName={activeSettings?.generatorName}
        isOpen={isInstallOpen ? true : undefined}
        onClose={() => setIsInstallOpen(false)}
      />

      {/* المحتوى الرئيسي للمولدة */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-28 md:pb-12">
        
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

        {currentTab === 'expenses' && (
          <ExpensesScreen
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

      {/* شريط التنقل السفلي السريع للهواتف (Thumb Zone) */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
      />

      {/* صفيحة الإجراءات السريعة الفورية */}
      <QuickActionHub
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        onNavigateTab={(tab) => {
          setCurrentTab(tab);
          setIsQuickActionOpen(false);
        }}
      />

      {/* تذييل الصفحة (مخفي في الهواتف لمنح الشاشة كامل المساحة) */}
      <footer className="hidden md:block py-3 border-t border-slate-800/80 text-center text-xs text-slate-500 bg-slate-950">
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
