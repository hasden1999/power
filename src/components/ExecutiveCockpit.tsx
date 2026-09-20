import { useState, type FC } from 'react';
import { formatIQD } from '../services/billingService';
import type { BillingCycle, TenantSettings, UserAccount } from '../types';
import {
  Zap,
  TrendingDown,
  UserCheck,
  Percent,
  Sliders,
  Pencil
} from 'lucide-react';

export interface CockpitStats {
  // الديون والمتأخرين
  totalOutstandingDebt: number; // إجمالي الديون المعلقة
  previousRolloverDebtTotal: number; // ديون سابقة مرحلة
  currentCycleDueTotal: number; // استحقاق الشهر الحالي غير المسدد
  unpaidSubscribersCount: number; // عدد المتأخرين
  partialSubscribersCount: number; // عدد المسددين جزئياً

  // المقبوضات والمسددين
  totalCollectedThisCycle: number; // إجمالي ما تم تحصيله بالدورة
  totalCollectedToday: number; // مقبوضات اليوم
  todayReceiptsCount: number; // عدد وصولات اليوم
  paidSubscribersCount: number; // عدد الخالصين
  totalSubscribersCount: number; // إجمالي المشتركين

  // الأمبيرات وشبكة الكهرباء
  totalSubscribedAmperes: number; // مجموع الأمبيرات الموزعة
  totalTargetBilling: number; // إجمالي الفوترة المستهدفة
  collectionPercentage: number; // نسبة التحصيل المئوية
}

interface ExecutiveCockpitProps {
  stats: CockpitStats;
  latestCycle?: BillingCycle;
  settings?: TenantSettings;
  currentUser?: UserAccount;
  onFilterSelect: (filter: 'all' | 'unpaid' | 'partial' | 'paid' | 'debt') => void;
  activeFilter: string;
  onOpenPriceModal: () => void;
}

export const ExecutiveCockpit: FC<ExecutiveCockpitProps> = ({
  stats,
  latestCycle,
  settings,
  currentUser,
  onFilterSelect,
  activeFilter,
  onOpenPriceModal,
}) => {
  // سعة المولدة المقدرة بالأمبير (يمكن حفظها في localStorage أو إعدادات المولدة)
  const [generatorCapacity, setGeneratorCapacity] = useState<number>(() => {
    const saved = localStorage.getItem(`gen_capacity_${settings?.id || 'default'}`);
    if (saved) return Number(saved);
    // تقدير ذكي تلقائي: مجموع الأمبيرات + 25% احتياطي تقريبي مقرب لأقرب 50 أمبير
    const base = Math.max(100, Math.ceil((stats.totalSubscribedAmperes * 1.25) / 50) * 50);
    return base || 400;
  });

  const [isEditingCapacity, setIsEditingCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState<string>(generatorCapacity.toString());

  const handleSaveCapacity = () => {
    const val = parseFloat(capacityInput);
    if (!isNaN(val) && val > 0) {
      setGeneratorCapacity(val);
      localStorage.setItem(`gen_capacity_${settings?.id || 'default'}`, val.toString());
    }
    setIsEditingCapacity(false);
  };

  // حسابات حمل المولدة
  const loadPercentage = generatorCapacity > 0
    ? Math.min(100, Math.round((stats.totalSubscribedAmperes / generatorCapacity) * 100))
    : 0;

  const remainingSafeAmperes = Math.max(0, generatorCapacity - stats.totalSubscribedAmperes);

  // حالة أمان الحمل
  const isOverload = loadPercentage > 95;
  const isWarningLoad = loadPercentage >= 85 && !isOverload;

  return (
    <div className="space-y-2.5 mb-1">
      
      {/* 1. تسعيرة الشهر تظهر بشكل هادئ وأقل بروزاً لتوفير المساحة ومنع التشتيت */}
      <div className="flex items-center justify-between bg-slate-900/70 border border-slate-800/80 rounded-2xl px-3 py-2 text-xs shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Zap className="w-3.5 h-3.5 fill-amber-400" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap truncate">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
              تسعيرة شهر {latestCycle ? `${latestCycle.month}/${latestCycle.year}` : `${new Date().getMonth() + 1}/${new Date().getFullYear()}`}:
            </span>
            <span className="font-black text-amber-300 text-xs sm:text-sm whitespace-nowrap">
              {latestCycle ? formatIQD(latestCycle.pricePerAmpereNormal) : '12,000 د.ع'}
            </span>
            <span className="text-[10px] text-slate-500 hidden xs:inline">/ أمبير</span>
            {latestCycle && latestCycle.pricePerAmpereGold > latestCycle.pricePerAmpereNormal && (
              <span className="text-[10px] text-amber-400/80 hidden sm:inline">
                (الذهبي: {formatIQD(latestCycle.pricePerAmpereGold)})
              </span>
            )}
          </div>
        </div>

        {currentUser?.role !== 'collector' && (
          <button
            type="button"
            onClick={onOpenPriceModal}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-400 border border-slate-700 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer shadow-sm flex-shrink-0"
            title="تعديل سعر الأمبير لهذا الشهر وتحديث الفواتير تلقائياً"
          >
            <Pencil className="w-3 h-3" />
            <span>تعديل</span>
          </button>
        )}
      </div>

      {/* 2. الأقسام الرئيسية على شكل شبكة 2×2 (مربعين ثم اسفلهما مربعين = 4 مربعات مضغوطة تقضي على السكرول) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        
        {/* المربع 1: المتأخرين والديون (Top Right) */}
        <div
          onClick={() => onFilterSelect(activeFilter === 'unpaid' ? 'all' : 'unpaid')}
          className={`group bg-gradient-to-b from-rose-950/50 via-slate-900/90 to-slate-950 border rounded-2xl p-2.5 sm:p-3.5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-rose-900/20 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'unpaid'
              ? 'border-rose-500 ring-2 ring-rose-500/40'
              : 'border-rose-500/30 hover:border-rose-500/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 flex-shrink-0">
                  <TrendingDown className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-rose-300 truncate">المتأخرين</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded-full border border-rose-500/30 flex-shrink-0">
                {stats.unpaidSubscribersCount} مطلوب
              </span>
            </div>

            {/* رقم الديون المالي الضخم */}
            <div className="my-1">
              <div className="text-base sm:text-2xl font-black text-rose-400 tracking-tight block truncate">
                {formatIQD(stats.totalOutstandingDebt)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block truncate">
                إجمالي ديون المشتركين
              </span>
            </div>
          </div>

          {/* التفصيل المضغوط: ديون سابقة vs استحقاق الشهر */}
          <div className="pt-2 border-t border-rose-900/40 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between text-slate-400">
              <span className="truncate">سابقة مرحلة:</span>
              <strong className="font-bold text-amber-300 whitespace-nowrap">{formatIQD(stats.previousRolloverDebtTotal)}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="truncate">هذا الشهر:</span>
              <strong className="font-bold text-rose-300 whitespace-nowrap">{formatIQD(stats.currentCycleDueTotal)}</strong>
            </div>
          </div>
        </div>

        {/* المربع 2: المسددين والخزينة (Top Left) */}
        <div
          onClick={() => onFilterSelect(activeFilter === 'paid' ? 'all' : 'paid')}
          className={`group bg-gradient-to-b from-emerald-950/50 via-slate-900/90 to-slate-950 border rounded-2xl p-2.5 sm:p-3.5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-emerald-900/20 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'paid'
              ? 'border-emerald-500 ring-2 ring-emerald-500/40'
              : 'border-emerald-500/30 hover:border-emerald-500/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-emerald-300 truncate">المسددين</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-full border border-emerald-500/30 flex-shrink-0">
                {stats.paidSubscribersCount} خالص
              </span>
            </div>

            {/* رقم المقبوضات المالي الضخم */}
            <div className="my-1">
              <div className="text-base sm:text-2xl font-black text-emerald-400 tracking-tight block truncate">
                {formatIQD(stats.totalCollectedThisCycle)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium block truncate">
                إجمالي المقبوضات
              </span>
            </div>
          </div>

          {/* تفاصيل مقبوضات اليوم السريعة */}
          <div className="pt-2 border-t border-emerald-900/40 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between text-slate-400">
              <span className="truncate">مقبوض اليوم:</span>
              <strong className="font-bold text-emerald-400 whitespace-nowrap">{formatIQD(stats.totalCollectedToday)}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="truncate">عدد الوصولات:</span>
              <strong className="font-bold text-white whitespace-nowrap">{stats.todayReceiptsCount} وصل</strong>
            </div>
          </div>
        </div>

        {/* المربع 3: سعة وحمل المولدة (Bottom Right) */}
        <div className="bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 border border-amber-500/30 rounded-2xl p-2.5 sm:p-3.5 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Zap className="w-3.5 h-3.5 fill-amber-400" />
                </div>
                <span className="text-xs font-black text-amber-300 truncate">سعة المولد</span>
              </div>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                isOverload ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                isWarningLoad ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {loadPercentage}%
              </span>
            </div>

            <div className="my-1 flex items-baseline justify-between">
              <div>
                <span className="text-base sm:text-2xl font-black text-amber-400 tracking-tight block">
                  {stats.totalSubscribedAmperes} <span className="text-xs font-bold text-slate-400">A</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">
                  {stats.totalSubscribersCount} مشترك
                </span>
              </div>

              {/* سعة المولدة مع تعديل سريع */}
              <div className="text-left">
                {isEditingCapacity ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={capacityInput}
                      onChange={(e) => setCapacityInput(e.target.value)}
                      className="w-14 bg-slate-950 border border-amber-500 text-amber-300 font-bold px-1 py-0.5 text-xs rounded"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveCapacity}
                      className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCapacityInput(generatorCapacity.toString());
                      setIsEditingCapacity(true);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-white hover:text-amber-400 transition cursor-pointer"
                    title="انقر لتعديل سعة المولدة"
                  >
                    <span>{generatorCapacity} A</span>
                    <Sliders className="w-2.5 h-2.5 text-slate-500" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-950/60 space-y-1">
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverload ? 'bg-rose-500' : isWarningLoad ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, loadPercentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>المتاح بأمان:</span>
              <strong className="text-emerald-400 font-black">+{remainingSafeAmperes} A</strong>
            </div>
          </div>
        </div>

        {/* المربع 4: نسبة التحصيل والهدف (Bottom Left) */}
        <div className="bg-gradient-to-b from-cyan-950/40 via-slate-900/90 to-slate-950 border border-cyan-500/30 rounded-2xl p-2.5 sm:p-3.5 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <Percent className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-cyan-300 truncate">نسبة التحصيل</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded-full border border-cyan-500/30 flex-shrink-0">
                {stats.collectionPercentage}%
              </span>
            </div>

            <div className="my-1">
              <span className="text-base sm:text-2xl font-black text-cyan-300 tracking-tight block truncate">
                {formatIQD(stats.totalTargetBilling)}
              </span>
              <span className="text-[10px] text-slate-400 font-medium block truncate">
                إجمالي هدف الجباية
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-cyan-950/60 space-y-1">
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, stats.collectionPercentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="truncate">محصل: <strong className="text-emerald-400 font-bold">{formatIQD(stats.totalCollectedThisCycle)}</strong></span>
              <span className="truncate">باقي: <strong className="text-rose-400 font-bold">{formatIQD(stats.totalOutstandingDebt)}</strong></span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
