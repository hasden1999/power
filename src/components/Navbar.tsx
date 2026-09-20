import type { FC } from 'react';
import { Zap, Wifi, WifiOff, RefreshCw, Users, DollarSign, Calendar, Settings, LogOut, ArrowRight, TrendingDown, Sun, SunMedium } from 'lucide-react';

import type { SyncStatusInfo } from '../services/syncService';
import type { UserAccount } from '../types';

interface NavbarProps {
  currentTab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas';
  setCurrentTab: (tab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas') => void;
  syncInfo: SyncStatusInfo;
  generatorName: string;
  currentUser: UserAccount;
  onLogout: () => void;
  onBackToAdmin?: () => void;
  isImpersonating?: boolean;
  onOpenInstall?: () => void;
  isSunlightMode?: boolean;
  onToggleSunlightMode?: () => void;
  uiMode?: 'simple' | 'advanced';
  onToggleUiMode?: () => void;
}

export const Navbar: FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  syncInfo,
  generatorName,
  currentUser,
  onLogout,
  onBackToAdmin,
  isImpersonating,
  onOpenInstall: _onOpenInstall,
  isSunlightMode,
  onToggleSunlightMode,
  uiMode = 'simple',
  onToggleUiMode: _onToggleUiMode,
}) => {
  return (
    <header className="bg-[#071330]/90 backdrop-blur-xl border-b border-blue-900/50 sticky top-0 z-40">
      
      {/* شريط تنبيه إذا كان السوبر أدمن يعاين مولدة كدعم فني */}
      {isImpersonating && (
        <div className="bg-purple-950 border-b border-purple-800 px-4 py-1.5 flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
            <span>أنت الآن في وضع المعاينة والدعم الفني لمولدة: <strong>{generatorName}</strong></span>
          </div>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="flex items-center gap-1 bg-purple-800 hover:bg-purple-700 text-white px-2.5 py-0.5 rounded-md font-bold transition-all"
            >
              <span>العودة للوحة صاحب المنصة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col md:flex-row items-center justify-between gap-2 sm:gap-4">
        
        {/* معلومات المولدة والشعار */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Zap className="w-6 h-6 fill-amber-400" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                {generatorName || 'منظومة المولدات الأهلية'}
              </h1>
              <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                نظام الجباية الذكي (Offline-Ready)
              </span>
            </div>
          </div>
        </div>

        {/* أزرار التنقل بين الشاشات (تظهر للشاشات الكبيرة، بينما تعتمد الهواتف على الشريط السفلي) */}
        <nav className="hidden md:flex items-center bg-[#0c1c44]/90 p-1 rounded-xl border border-blue-800/50 w-full md:w-auto justify-around sm:justify-start gap-1 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('collection')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              currentTab === 'collection'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-bold'
                : 'text-blue-200/80 hover:text-white hover:bg-blue-800/40'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            {uiMode === 'simple' ? 'الجباية والقبض' : 'شاشة التحصيل'}
          </button>

          <button
            onClick={() => setCurrentTab('subscribers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              currentTab === 'subscribers'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-bold'
                : 'text-blue-200/80 hover:text-white hover:bg-blue-800/40'
            }`}
          >
            <Users className="w-4 h-4" />
            المشتركين
          </button>

          {uiMode === 'advanced' && currentUser.role !== 'collector' && (
            <button
              onClick={() => setCurrentTab('pricing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                currentTab === 'pricing'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-bold'
                  : 'text-blue-200/80 hover:text-white hover:bg-blue-800/40'
              }`}
            >
              <Calendar className="w-4 h-4" />
              تسعيرة الشهر
            </button>
          )}

          {uiMode === 'advanced' && (
            <button
              onClick={() => setCurrentTab('expenses')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                currentTab === 'expenses'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-bold'
                  : 'text-blue-200/80 hover:text-white hover:bg-blue-800/40'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              المصاريف والأرباح
            </button>
          )}

          {currentUser.role !== 'collector' && (
            <button
              onClick={() => setCurrentTab('saas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                currentTab === 'saas'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 font-bold'
                  : 'text-blue-200/80 hover:text-white hover:bg-blue-800/40'
              }`}
            >
              <Settings className="w-4 h-4" />
              {uiMode === 'simple' ? 'اشتراك ودعم المولدة' : 'اشتراك النظام'}
            </button>
          )}
        </nav>

        {/* عناصر التحكم العلوية: فقط شارة الواي فاي وملاصق لها زر الثيم وزر الخروج */}
        <div className="flex items-center gap-2">
          {/* زر وشارة الواي فاي */}
          <SyncBadge syncInfo={syncInfo} />

          {/* زر الثيم (النهاري / الليلي) جنب زر الواي فاي مباشرة */}
          {onToggleSunlightMode && (
            <button
              onClick={onToggleSunlightMode}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isSunlightMode
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                  : 'bg-[#0c1c44] hover:bg-[#122659] text-amber-300 border border-blue-800/60'
              }`}
              title={isSunlightMode ? 'العودة للوضع الليلي' : 'تفعيل وضع النهار عالي التباين للشمس المباشرة'}
            >
              {isSunlightMode ? (
                <Sun className="w-3.5 h-3.5 fill-slate-950 stroke-[2.5]" />
              ) : (
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="text-[11px] hidden sm:inline">{isSunlightMode ? 'نهاري' : 'شمس'}</span>
            </button>
          )}

          {/* زر تسجيل الخروج فقط */}
          <div className="flex items-center gap-1.5 border-r border-blue-800/60 pr-2">
            <button
              onClick={onLogout}
              className="flex items-center gap-1 bg-[#0c1c44] hover:bg-[#122659] text-rose-400 border border-blue-800/60 p-1.5 sm:px-2.5 sm:py-1 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};

const SyncBadge: FC<{ syncInfo: SyncStatusInfo }> = ({ syncInfo }) => {
  return (
    <div className="flex items-center gap-2">
      {syncInfo.isOnline ? (
        <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg text-xs font-medium">
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">متصل</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-500/30 text-rose-400 px-2.5 py-1 rounded-lg text-xs font-medium">
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>أوفلاين</span>
        </div>
      )}

      <button
        onClick={syncInfo.triggerSync}
        disabled={!syncInfo.isOnline || syncInfo.isSyncing}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
          syncInfo.isSyncing
            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
            : syncInfo.pendingCount > 0
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            : 'bg-[#0c1c44]/90 border border-blue-800/50 text-blue-200 hover:text-emerald-400 hover:bg-[#122659]'
        }`}
        title="مزامنة سحابية لحظية مع خادم Supabase"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncInfo.isSyncing ? 'animate-spin text-amber-400' : ''}`} />
        <span>
          {syncInfo.isSyncing
            ? 'مزامنة...'
            : syncInfo.pendingCount > 0
            ? `${syncInfo.pendingCount} معلقة`
            : 'مزامنة سحابية'}
        </span>
      </button>
    </div>
  );
};
