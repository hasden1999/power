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
      <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-md border border-blue-400/20 rounded-2xl px-3.5 py-2.5 text-xs shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 flex-shrink-0 shadow-sm">
            <Zap className="w-4 h-4 fill-amber-300" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap truncate">
            <span className="text-xs text-blue-200/80 font-medium whitespace-nowrap">
              تسعيرة شهر {latestCycle ? `${latestCycle.month}/${latestCycle.year}` : `${new Date().getMonth() + 1}/${new Date().getFullYear()}`}:
            </span>
            <span className="font-black text-amber-300 text-sm whitespace-nowrap font-mono">
              {latestCycle ? formatIQD(latestCycle.pricePerAmpereNormal) : '12,000 د.ع'}
            </span>
            <span className="text-[10px] text-blue-200/60 hidden xs:inline">/ أمبير</span>
            {latestCycle && latestCycle.pricePerAmpereGold > latestCycle.pricePerAmpereNormal && (
              <span className="text-[11px] text-amber-300/90 font-mono hidden sm:inline">
                (الذهبي: {formatIQD(latestCycle.pricePerAmpereGold)})
              </span>
            )}
          </div>
        </div>

        {currentUser?.role !== 'collector' && (
          <button
            type="button"
            onClick={onOpenPriceModal}
            className="flex items-center gap-1 bg-blue-600/80 hover:bg-blue-500 active:scale-95 text-white border border-blue-400/40 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-md flex-shrink-0"
            title="تعديل سعر الأمبير لهذا الشهر وتحديث الفواتير تلقائياً"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>تعديل</span>
          </button>
        )}
      </div>

      {/* 2. الأقسام الرئيسية على شكل شبكة 2×2 (مربعين ثم اسفلهما مربعين = 4 مربعات مضغوطة تقضي على السكرول) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        
        {/* المربع 1: المتأخرين والديون (Top Right) */}
        <div
          onClick={() => onFilterSelect(activeFilter === 'unpaid' ? 'all' : 'unpaid')}
          className={`group bg-gradient-to-br from-rose-600 via-rose-700 to-red-800 text-white border rounded-2xl p-3 sm:p-4 transition-all duration-200 cursor-pointer shadow-xl shadow-rose-950/40 hover:shadow-rose-600/40 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'unpaid'
              ? 'border-white ring-2 ring-white/70 scale-[1.02]'
              : 'border-rose-400/40 hover:border-rose-300'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <TrendingDown className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-white truncate">الديون المستحقة</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full border border-white/30 flex-shrink-0">
                {stats.unpaidSubscribersCount} مطلوب
              </span>
            </div>

            {/* رقم الديون المالي الضخم */}
            <div className="my-1.5">
              <div className="text-base sm:text-2xl font-black text-white tracking-tight block truncate font-mono drop-shadow-sm">
                {formatIQD(stats.totalOutstandingDebt)}
              </div>
              <span className="text-[10px] text-rose-100/90 font-medium block truncate">
                إجمالي ديون المشتركين
              </span>
            </div>
          </div>

          {/* التفصيل المضغوط: ديون سابقة vs استحقاق الشهر */}
          <div className="pt-2 border-t border-rose-500/50 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between text-rose-100">
              <span className="truncate">سابقة مرحلة:</span>
              <strong className="font-bold text-white whitespace-nowrap font-mono">{formatIQD(stats.previousRolloverDebtTotal)}</strong>
            </div>
            <div className="flex items-center justify-between text-rose-100">
              <span className="truncate">هذا الشهر:</span>
              <strong className="font-bold text-white whitespace-nowrap font-mono">{formatIQD(stats.currentCycleDueTotal)}</strong>
            </div>
          </div>
        </div>

        {/* المربع 2: المسددين والخزينة (Top Left) */}
        <div
          onClick={() => onFilterSelect(activeFilter === 'paid' ? 'all' : 'paid')}
          className={`group bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white border rounded-2xl p-3 sm:p-4 transition-all duration-200 cursor-pointer shadow-xl shadow-emerald-950/40 hover:shadow-emerald-600/40 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'paid'
              ? 'border-white ring-2 ring-white/70 scale-[1.02]'
              : 'border-emerald-400/40 hover:border-emerald-300'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-white truncate">المبالغ المحصلة</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full border border-white/30 flex-shrink-0">
                {stats.paidSubscribersCount} خالص
              </span>
            </div>

            {/* رقم المقبوضات المالي الضخم */}
            <div className="my-1.5">
              <div className="text-base sm:text-2xl font-black text-white tracking-tight block truncate font-mono drop-shadow-sm">
                {formatIQD(stats.totalCollectedThisCycle)}
              </div>
              <span className="text-[10px] text-emerald-100/90 font-medium block truncate">
                إجمالي المقبوضات
              </span>
            </div>
          </div>

          {/* تفاصيل مقبوضات اليوم السريعة */}
          <div className="pt-2 border-t border-emerald-500/50 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between text-emerald-100">
              <span className="truncate">مقبوض اليوم:</span>
              <strong className="font-bold text-white whitespace-nowrap font-mono">{formatIQD(stats.totalCollectedToday)}</strong>
            </div>
            <div className="flex items-center justify-between text-emerald-100">
              <span className="truncate">عدد الوصولات:</span>
              <strong className="font-bold text-white whitespace-nowrap">{stats.todayReceiptsCount} وصل</strong>
            </div>
          </div>
        </div>

        {/* المربع 3: سعة وحمل المولدة (Bottom Right) */}
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 text-white border border-amber-300/40 rounded-2xl p-3 sm:p-4 shadow-xl shadow-amber-950/40 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <Zap className="w-3.5 h-3.5 fill-white" />
                </div>
                <span className="text-xs font-black text-white truncate">الحمل الحالي</span>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border flex-shrink-0 ${
                isOverload
                  ? 'bg-rose-950/70 text-white border-rose-300 animate-pulse'
                  : isWarningLoad
                  ? 'bg-amber-900/60 text-white border-amber-300'
                  : 'bg-white/20 text-white border-white/30'
              }`}>
                {loadPercentage}%
              </span>
            </div>

            <div className="my-1.5 flex items-baseline justify-between">
              <div>
                <span className="text-base sm:text-2xl font-black text-white tracking-tight block font-mono drop-shadow-sm">
                  {stats.totalSubscribedAmperes} <span className="text-xs font-bold text-amber-100">أمبير</span>
                </span>
                <span className="text-[10px] text-amber-100/90 font-medium block">
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
                      className="w-14 bg-amber-900/80 border border-white text-white font-bold px-1 py-0.5 text-xs rounded"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveCapacity}
                      className="bg-white text-amber-900 font-black text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
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
                    className="flex items-center gap-1 text-xs font-bold text-white hover:text-amber-100 transition cursor-pointer bg-white/15 px-2 py-0.5 rounded-lg border border-white/20"
                    title="انقر لتعديل سعة المولدة"
                  >
                    <span>{generatorCapacity} A</span>
                    <Sliders className="w-2.5 h-2.5 text-amber-100" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-400/50 space-y-1">
            <div className="w-full bg-amber-950/40 h-1.5 rounded-full overflow-hidden border border-white/20">
              <div
                className="h-full rounded-full transition-all duration-500 bg-white"
                style={{ width: `${Math.min(100, loadPercentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-amber-100">
              <span>المتاح بأمان:</span>
              <strong className="text-white font-black">+{remainingSafeAmperes} أمبير</strong>
            </div>
          </div>
        </div>

        {/* المربع 4: نسبة التحصيل والهدف (Bottom Left) */}
        <div className="bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 text-white border border-cyan-300/40 rounded-2xl p-3 sm:p-4 shadow-xl shadow-blue-950/40 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <Percent className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black text-white truncate">نسبة التحصيل</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full border border-white/30 flex-shrink-0">
                {stats.collectionPercentage}%
              </span>
            </div>

            <div className="my-1.5">
              <span className="text-base sm:text-2xl font-black text-white tracking-tight block truncate font-mono drop-shadow-sm">
                {formatIQD(stats.totalTargetBilling)}
              </span>
              <span className="text-[10px] text-cyan-100/90 font-medium block truncate">
                إجمالي هدف الجباية
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-cyan-400/50 space-y-1">
            <div className="w-full bg-cyan-950/40 h-1.5 rounded-full overflow-hidden border border-white/20">
              <div
                className="bg-white h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, stats.collectionPercentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-cyan-100">
              <span className="truncate">محصل: <strong className="text-white font-bold font-mono">{formatIQD(stats.totalCollectedThisCycle)}</strong></span>
              <span className="truncate">باقي: <strong className="text-rose-200 font-bold font-mono">{formatIQD(stats.totalOutstandingDebt)}</strong></span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
