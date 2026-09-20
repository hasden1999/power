import { useState, type FC } from 'react';
import { formatIQD } from '../services/billingService';
import type { BillingCycle, TenantSettings, UserAccount } from '../types';
import {
  Zap,
  TrendingDown,
  UserCheck,
  Percent,
  Sliders,
  Pencil,
  AlertTriangle,
  ShieldCheck,
  Flame,
  ArrowUpRight,
  Wallet
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
    <div className="space-y-3.5 mb-2">
      
      {/* 1. الشريط التشغيلي الفوري: تسعيرة الشهر وسعة المولدة والتحكم */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/90 rounded-3xl p-3 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* تسعيرة الشهر الحالية */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-inner">
            <Zap className="w-5 h-5 fill-amber-400 stroke-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-amber-400 tracking-wider">
                تسعيرة شهر {latestCycle ? `${latestCycle.month} / ${latestCycle.year}` : `${new Date().getMonth() + 1} / ${new Date().getFullYear()}`}
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">
                دورة نشطة ⚡
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-xl font-black text-white tracking-tight">
                {latestCycle ? formatIQD(latestCycle.pricePerAmpereNormal) : '12,000 د.ع'}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">للأمبير العادي</span>
              {latestCycle && latestCycle.pricePerAmpereGold > latestCycle.pricePerAmpereNormal && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs font-bold text-amber-300">
                    {formatIQD(latestCycle.pricePerAmpereGold)} (ذهبي)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* أزرار الإجراءات السريعة على التسعيرة */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {currentUser?.role !== 'collector' && (
            <button
              type="button"
              onClick={onOpenPriceModal}
              className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              title="تعديل سعر الأمبير لهذا الشهر وتحديث المشتركين فوراً"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل التسعيرة</span>
            </button>
          )}
        </div>

      </div>

      {/* 2. الركائز القيادية الأربع الكبرى (The 4 Executive Power Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* البطاقة 1: جدار الديون والمتأخرين (Debt Wall & Defaulters Radar) */}
        <div
          onClick={() => onFilterSelect('unpaid')}
          className={`group bg-gradient-to-b from-rose-950/40 via-slate-900/90 to-slate-950 border rounded-3xl p-4 sm:p-5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-rose-900/20 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'unpaid'
              ? 'border-rose-500 ring-2 ring-rose-500/30'
              : 'border-rose-500/30 hover:border-rose-500/60'
          }`}
        >
          {/* خلفية تزيينية خافتة */}
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-rose-300">المتأخرين والديون</span>
              </div>
              <span className="text-[11px] font-bold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30">
                {stats.unpaidSubscribersCount} مشترك مطلوب
              </span>
            </div>

            {/* الرقم المالي الضخم للديون */}
            <div className="mt-2 mb-1">
              <div className="text-2xl sm:text-3xl font-black text-rose-400 tracking-tight block">
                {formatIQD(stats.totalOutstandingDebt)}
              </div>
              <span className="text-[11px] text-slate-400 font-medium block">
                إجمالي المطلوب في السوق بذمة المتأخرين
              </span>
            </div>
          </div>

          {/* التفصيل المزدوج الحاسم: ديون سابقة vs استحقاق الشهر */}
          <div className="mt-3 pt-3 border-t border-rose-900/40 grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-rose-950/40 rounded-xl p-2 border border-rose-900/40">
              <span className="text-slate-400 block text-[10px]">⏮️ ديون سابقة مرحلة:</span>
              <span className="font-black text-amber-300 block truncate mt-0.5">
                {formatIQD(stats.previousRolloverDebtTotal)}
              </span>
            </div>
            <div className="bg-rose-950/40 rounded-xl p-2 border border-rose-900/40">
              <span className="text-slate-400 block text-[10px]">📅 استحقاق هذا الشهر:</span>
              <span className="font-black text-rose-300 block truncate mt-0.5">
                {formatIQD(stats.currentCycleDueTotal)}
              </span>
            </div>
          </div>

          <div className="mt-2 text-right">
            <span className="text-[10px] text-rose-400 group-hover:underline font-bold flex items-center gap-1 justify-end">
              <span>عرض المتأخرين فقط</span>
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* البطاقة 2: خزينة المقبوضات والمسددين (Cash Vault & Paid Subscribers) */}
        <div
          onClick={() => onFilterSelect('paid')}
          className={`group bg-gradient-to-b from-emerald-950/40 via-slate-900/90 to-slate-950 border rounded-3xl p-4 sm:p-5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-900/20 relative overflow-hidden flex flex-col justify-between ${
            activeFilter === 'paid'
              ? 'border-emerald-500 ring-2 ring-emerald-500/30'
              : 'border-emerald-500/30 hover:border-emerald-500/60'
          }`}
        >
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <UserCheck className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-emerald-300">المسددين والخزينة</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                {stats.paidSubscribersCount} مشترك خالص
              </span>
            </div>

            {/* الرقم المالي الضخم للمقبوضات */}
            <div className="mt-2 mb-1">
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight block">
                {formatIQD(stats.totalCollectedThisCycle)}
              </div>
              <span className="text-[11px] text-slate-400 font-medium block">
                إجمالي ما تم تحصيله فعلياً بالدورة
              </span>
            </div>
          </div>

          {/* تفاصيل مقبوضات اليوم السريعة */}
          <div className="mt-3 pt-3 border-t border-emerald-900/40 bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-900/40 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-emerald-300/80 block">⚡ مقبوضات اليوم الميدانية:</span>
              <span className="font-black text-emerald-400 text-sm block">
                {formatIQD(stats.totalCollectedToday)}
              </span>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-slate-400 block">عدد الوصولات:</span>
              <span className="font-bold text-white text-xs">{stats.todayReceiptsCount} وصل</span>
            </div>
          </div>

          <div className="mt-2 text-right">
            <span className="text-[10px] text-emerald-400 group-hover:underline font-bold flex items-center gap-1 justify-end">
              <span>عرض المسددين فقط</span>
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* البطاقة 3: عداد حمل المولد وسعة الأمبيرات (Power Grid Load & Capacity Meter) */}
        <div className="bg-gradient-to-b from-amber-950/30 via-slate-900/90 to-slate-950 border border-amber-500/30 rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Zap className="w-4 h-4 fill-amber-400" />
                </div>
                <span className="text-xs font-black text-amber-300">سعة وحمل المولدة</span>
              </div>
              
              {/* شارة أمان الحمل */}
              {isOverload ? (
                <span className="text-[10px] font-black text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/40 flex items-center gap-1 animate-pulse">
                  <Flame className="w-3 h-3" />
                  حمل زائد!
                </span>
              ) : isWarningLoad ? (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  ذروة الحمل
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  حمل آمن
                </span>
              )}
            </div>

            {/* إجمالي الأمبيرات المباعة */}
            <div className="mt-2 mb-1 flex items-baseline justify-between">
              <div>
                <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight block">
                  {stats.totalSubscribedAmperes}{' '}
                  <span className="text-sm font-bold text-slate-400">A</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium block">
                  أمبير موزع على {stats.totalSubscribersCount} مشترك
                </span>
              </div>

              {/* سعة المولدة مع زر تعديل سريع */}
              <div className="text-left">
                <span className="text-[10px] text-slate-400 block">السعة الكلية:</span>
                {isEditingCapacity ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      value={capacityInput}
                      onChange={(e) => setCapacityInput(e.target.value)}
                      className="w-16 bg-slate-950 border border-amber-500 text-amber-300 font-black px-1.5 py-0.5 text-xs rounded"
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
                    className="flex items-center gap-1 text-sm font-black text-white hover:text-amber-400 transition cursor-pointer"
                    title="انقر لتعديل سعة المولدة"
                  >
                    <span>{generatorCapacity} A</span>
                    <Sliders className="w-3 h-3 text-slate-500" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* شريط الحمل التفاعلي ومتبقي الأمبيرات */}
          <div className="mt-3 pt-3 border-t border-amber-950/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">نسبة التحميل:</span>
              <span
                className={`font-black ${
                  isOverload ? 'text-rose-400' : isWarningLoad ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {loadPercentage}%
              </span>
            </div>

            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverload
                    ? 'bg-rose-500'
                    : isWarningLoad
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, loadPercentage)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>المتاح للبيع بأمان:</span>
              <strong className="text-emerald-400 font-black">+{remainingSafeAmperes} أمبير</strong>
            </div>
          </div>

        </div>

        {/* البطاقة 4: مؤشر إنجاز وسرعة التحصيل (Collection Velocity & Target) */}
        <div className="bg-gradient-to-b from-cyan-950/30 via-slate-900/90 to-slate-950 border border-cyan-500/30 rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Percent className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-cyan-300">نسبة إنجاز الجباية</span>
              </div>
              <span className="text-[11px] font-black text-cyan-300 bg-cyan-500/15 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                {stats.collectionPercentage}% مكتمل
              </span>
            </div>

            {/* إجمالي المستهدف المالي بالدورة */}
            <div className="mt-2 mb-1">
              <span className="text-2xl sm:text-3xl font-black text-cyan-300 tracking-tight block">
                {formatIQD(stats.totalTargetBilling)}
              </span>
              <span className="text-[11px] text-slate-400 font-medium block">
                القيمة الكلية المتوقعة لفوترة الحي
              </span>
            </div>
          </div>

          {/* شريط الإنجاز المالي الكبير */}
          <div className="mt-3 pt-3 border-t border-cyan-950/60 space-y-2">
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800/80 p-0.5">
              <div
                className="bg-gradient-to-r from-amber-500 via-teal-400 to-emerald-500 h-full rounded-full transition-all duration-700 shadow"
                style={{ width: `${Math.min(100, stats.collectionPercentage)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span>محصل: <strong className="text-emerald-400">{formatIQD(stats.totalCollectedThisCycle)}</strong></span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                <span>باقي: <strong className="text-rose-400">{formatIQD(stats.totalOutstandingDebt)}</strong></span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
