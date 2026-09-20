import type { FC } from 'react';
import { Zap, Users, Plus, TrendingDown, Settings } from 'lucide-react';
import type { UserAccount } from '../types';

interface MobileBottomNavProps {
  currentTab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas';
  setCurrentTab: (tab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas') => void;
  onOpenQuickAction: () => void;
  unpaidCount?: number;
  uiMode?: 'simple' | 'advanced';
  currentUser?: UserAccount;
}

export const MobileBottomNav: FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenQuickAction,
  unpaidCount = 0,
  uiMode = 'simple',
  currentUser,
}) => {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden">
      {/* شريط زجاجي عائم في منطقة الإبهام المريحة */}
      <nav aria-label="شريط التنقل السفلي" className="relative bg-[#071330]/95 backdrop-blur-xl border-t border-blue-900/60 px-2 py-1.5 flex items-center justify-around shadow-2xl pb-safe">
        
        {/* تبويب الجباية الميدانية (الرئيسية) */}
        <button
          type="button"
          onClick={() => setCurrentTab('collection')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer relative ${
            currentTab === 'collection'
              ? 'text-cyan-400 font-black scale-105'
              : 'text-blue-300/70 hover:text-white font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'collection' ? 'bg-blue-600/20 border border-blue-400/40 shadow-sm' : ''
          }`}>
            <Zap className={`w-5 h-5 ${currentTab === 'collection' ? 'fill-cyan-400 text-cyan-400' : ''}`} />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">الجباية</span>
          {unpaidCount > 0 && currentTab !== 'collection' && (
            <span className="absolute top-1 right-3.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>

        {/* تبويب المشتركين */}
        <button
          type="button"
          onClick={() => setCurrentTab('subscribers')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
            currentTab === 'subscribers'
              ? 'text-cyan-400 font-black scale-105'
              : 'text-blue-300/70 hover:text-white font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'subscribers' ? 'bg-blue-600/20 border border-blue-400/40 shadow-sm' : ''
          }`}>
            <Users className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">المشتركون</span>
        </button>

        {/* زر الإجراء السريع المركزي البارز (Quick Action Hub FAB) */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-5">
          <button
            type="button"
            onClick={onOpenQuickAction}
            className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-xl shadow-blue-600/40 border-2 border-[#071330] active:scale-95 transition-all cursor-pointer group"
            aria-label="إجراء سريع فوري"
          >
            <Plus className="w-6 h-6 stroke-[3] group-hover:rotate-90 transition-transform duration-200" />
          </button>
          <span className="text-[9px] font-bold text-cyan-300 mt-1">سريع</span>
        </div>

        {/* تبويب المصاريف والأرباح (يظهر فقط في الوضع المتقدم) */}
        {uiMode === 'advanced' && (
          <button
            type="button"
            onClick={() => setCurrentTab('expenses')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              currentTab === 'expenses'
                ? 'text-cyan-400 font-black scale-105'
                : 'text-blue-300/70 hover:text-white font-medium'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${
              currentTab === 'expenses' ? 'bg-blue-600/20 border border-blue-400/40 shadow-sm' : ''
            }`}>
              <TrendingDown className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">المصاريف</span>
          </button>
        )}

        {/* تبويب اشتراك المولدة والإدارة */}
        {currentUser?.role !== 'collector' && (
          <button
            type="button"
            onClick={() => setCurrentTab('saas')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              currentTab === 'saas'
                ? 'text-cyan-400 font-black scale-105'
                : 'text-blue-300/70 hover:text-white font-medium'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${
              currentTab === 'saas' ? 'bg-blue-600/20 border border-blue-400/40 shadow-sm' : ''
            }`}>
              <Settings className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">
              {uiMode === 'simple' ? 'الاشتراك' : 'الإدارة'}
            </span>
          </button>
        )}

      </nav>
    </div>
  );
};
