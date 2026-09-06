import type { FC } from 'react';
import { Zap, Users, Plus, TrendingDown, Settings } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas';
  setCurrentTab: (tab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas') => void;
  onOpenQuickAction: () => void;
  unpaidCount?: number;
}

export const MobileBottomNav: FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenQuickAction,
  unpaidCount = 0,
}) => {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden">
      {/* شريط زجاجي عائم في منطقة الإبهام المريحة */}
      <nav aria-label="شريط التنقل السفلي" className="relative bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/90 px-2 py-1.5 flex items-center justify-around shadow-2xl pb-safe">
        
        {/* تبويب الجباية الميدانية (الرئيسية) */}
        <button
          type="button"
          onClick={() => setCurrentTab('collection')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer relative ${
            currentTab === 'collection'
              ? 'text-amber-400 font-black scale-105'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'collection' ? 'bg-amber-500/15 border border-amber-500/30 shadow-sm' : ''
          }`}>
            <Zap className={`w-5 h-5 ${currentTab === 'collection' ? 'fill-amber-400' : ''}`} />
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
              ? 'text-amber-400 font-black scale-105'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'subscribers' ? 'bg-amber-500/15 border border-amber-500/30 shadow-sm' : ''
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
            className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-xl shadow-amber-500/30 border-2 border-slate-900 active:scale-95 transition-all cursor-pointer group"
            aria-label="إجراء سريع فوري"
          >
            <Plus className="w-6 h-6 stroke-[3] group-hover:rotate-90 transition-transform duration-200" />
          </button>
          <span className="text-[9px] font-bold text-amber-300 mt-1">سريع</span>
        </div>

        {/* تبويب المصاريف والأرباح */}
        <button
          type="button"
          onClick={() => setCurrentTab('expenses')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
            currentTab === 'expenses'
              ? 'text-amber-400 font-black scale-105'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'expenses' ? 'bg-amber-500/15 border border-amber-500/30 shadow-sm' : ''
          }`}>
            <TrendingDown className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">المصاريف</span>
        </button>

        {/* تبويب الإدارة والإعدادات */}
        <button
          type="button"
          onClick={() => setCurrentTab('saas')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
            currentTab === 'saas'
              ? 'text-amber-400 font-black scale-105'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${
            currentTab === 'saas' ? 'bg-amber-500/15 border border-amber-500/30 shadow-sm' : ''
          }`}>
            <Settings className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">الإدارة</span>
        </button>

      </nav>
    </div>
  );
};
