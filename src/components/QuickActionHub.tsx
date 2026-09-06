import type { FC } from 'react';
import { BottomSheet } from './BottomSheet';
import { Zap, UserPlus, Fuel, Download, RefreshCw, Calendar } from 'lucide-react';
import { forceReloadAndClearCache, APP_VERSION } from '../services/appUpdater';

interface QuickActionHubProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: 'collection' | 'subscribers' | 'pricing' | 'expenses' | 'saas') => void;
  onOpenAddSubscriber?: () => void;
  onOpenAddExpense?: () => void;
  onExportBackup?: () => void;
}

export const QuickActionHub: FC<QuickActionHubProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenAddSubscriber,
  onOpenAddExpense,
  onExportBackup,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="إجراء سريع فوري"
      icon={<Zap className="w-5 h-5" />}
      subtitle="اختصارات سريعة لإنجاز العمليات بلمسة واحدة"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 py-1">
        
        {/* قبض اشتراك سريع */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigateTab('collection');
          }}
          className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 hover:from-amber-500/30 border border-amber-500/30 p-3.5 rounded-2xl flex flex-col items-center text-center gap-2 text-white active:scale-95 transition-all cursor-pointer shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20">
            <Zap className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <span className="text-xs font-black block text-amber-400">قبض ميداني سريع</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">فتح قائمة الجباية والديون</span>
          </div>
        </button>

        {/* إضافة مشترك جديد */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigateTab('subscribers');
            if (onOpenAddSubscriber) onOpenAddSubscriber();
          }}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700 p-3.5 rounded-2xl flex flex-col items-center text-center gap-2 text-white active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold block text-white">إضافة مشترك</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">تسجيل قاطع وأمبيرات جديدة</span>
          </div>
        </button>

        {/* تسجيل وجبة كاز / مصروف */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigateTab('expenses');
            if (onOpenAddExpense) onOpenAddExpense();
          }}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700 p-3.5 rounded-2xl flex flex-col items-center text-center gap-2 text-white active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold block text-white">تسجيل كاز / صيانة</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">إضافة مصروف لاحتساب الربح</span>
          </div>
        </button>

        {/* تسعيرة الشهر الحالي */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigateTab('pricing');
          }}
          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700 p-3.5 rounded-2xl flex flex-col items-center text-center gap-2 text-white active:scale-95 transition-all cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold block text-white">تسعيرة الشهر</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">تحديد سعر الأمبير العادي والذهبي</span>
          </div>
        </button>

      </div>

      {/* شريط أدوات الصيانة السريعة */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
        {onExportBackup && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onExportBackup();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-300 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>نسخة احتياطية</span>
          </button>
        )}

        <button
          type="button"
          onClick={forceReloadAndClearCache}
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 py-2.5 px-3 rounded-xl text-xs font-bold text-slate-300 transition-all cursor-pointer"
          title="تحديث التطبيق ومسح الذاكرة المؤقتة"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>تحديث المنظومة ({APP_VERSION})</span>
        </button>
      </div>

    </BottomSheet>
  );
};
