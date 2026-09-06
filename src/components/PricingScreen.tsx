import { useState, useEffect, useMemo, type FC } from 'react';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatIQD, generateInvoicesForCycle } from '../services/billingService';
import type { BillingCycle, TenantSettings } from '../types';
import {
  Calendar,
  Zap,
  Calculator,
  CheckCircle,
  Clock,
  Sparkles,
  FileCheck2
} from 'lucide-react';

interface PricingScreenProps {
  tenantId: string;
  settings?: TenantSettings;
  onRefreshSync: () => void;
}

export const PricingScreen: FC<PricingScreenProps> = ({

  tenantId,
  settings,
  onRefreshSync,
}) => {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());

  // أسعار الأمبير للشهر المختار
  const [priceNormal, setPriceNormal] = useState<string>('12000');
  const [priceGold, setPriceGold] = useState<string>('20000');
  const [priceNight, setPriceNight] = useState<string>('8000');
  const [cycleNotes, setCycleNotes] = useState<string>('');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // جلب الدورات والفواتير والمشتركين من IndexedDB بعزل كامل للمولدة
  const cycles = useLiveQuery(
    () => db.billingCycles.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const subscribers = useLiveQuery(
    () => db.subscribers.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const invoices = useLiveQuery(
    () => db.invoices.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];


  // البحث عن الدورة المسجلة لهذا الشهر إن وجدت
  const activeCycle = useMemo(() => {
    return cycles.find((c) => c.month === selectedMonth && c.year === selectedYear);
  }, [cycles, selectedMonth, selectedYear]);

  // تحديث الحقول عند اختيار شهر أو سنة مختلفة
  useEffect(() => {
    if (activeCycle) {
      setPriceNormal(activeCycle.pricePerAmpereNormal.toString());
      setPriceGold(activeCycle.pricePerAmpereGold.toString());
      setPriceNight(activeCycle.pricePerAmpereNight.toString());
      setCycleNotes(activeCycle.notes || '');
    } else {
      setPriceNormal(settings?.defaultPriceNormal?.toString() || '12000');
      setPriceGold(settings?.defaultPriceGold?.toString() || '20000');
      setPriceNight('8000');
      setCycleNotes(`تسعيرة شهر ${selectedMonth} - ${selectedYear}`);
    }
    setSuccessMessage(null);
  }, [activeCycle, selectedMonth, selectedYear, settings]);

  // فواتير الدورة المختارة
  const currentCycleInvoices = useMemo(() => {
    if (!activeCycle) return [];
    return invoices.filter((inv) => inv.cycleId === activeCycle.id);
  }, [invoices, activeCycle]);

  // إحصائيات الشهر
  const monthStats = useMemo(() => {
    const totalDue = currentCycleInvoices.reduce((sum, inv) => sum + inv.totalDue, 0);
    const totalCollected = currentCycleInvoices.reduce((sum, inv) => sum + inv.totalPaid, 0);
    const activeSubsCount = subscribers.filter((s) => s.isActive).length;
    const totalAmperes = subscribers
      .filter((s) => s.isActive)
      .reduce((sum, s) => sum + s.amperes, 0);

    return {
      totalDue,
      totalCollected,
      activeSubsCount,
      totalAmperes,
      invoicesGenerated: currentCycleInvoices.length,
    };
  }, [currentCycleInvoices, subscribers]);

  // توليد واحتساب الفواتير للدورة
  const handleSaveAndGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const pNormal = parseFloat(priceNormal);
    const pGold = parseFloat(priceGold);
    const pNight = parseFloat(priceNight);

    if (isNaN(pNormal) || pNormal < 0) {
      alert('يرجى تحديد سعر صحيح للأمبير');
      return;
    }

    try {
      setIsGenerating(true);
      setSuccessMessage(null);

      const cycleId = activeCycle?.id || `cycle-${selectedYear}-${selectedMonth}`;
      const cycleData: BillingCycle = {
        id: cycleId,
        tenantId,
        month: selectedMonth,
        year: selectedYear,
        pricePerAmpereNormal: pNormal,
        pricePerAmpereGold: pGold || pNormal,
        pricePerAmpereNight: pNight || pNormal,
        issueDate: new Date().toISOString(),
        notes: cycleNotes,
        isClosed: false,
        createdAt: activeCycle?.createdAt || new Date().toISOString(),
      };

      await db.billingCycles.put(cycleData);

      // توليد الفواتير لجميع المشتركين
      const count = await generateInvoicesForCycle(cycleData);

      onRefreshSync();
      setSuccessMessage(
        `تم حفظ تسعيرة شهر (${selectedMonth}/${selectedYear}) واحتساب ${count} فاتورة جديدة بنجاح وترحيل الديون السابقة!`
      );
    } catch (err) {
      console.error('خطأ في توليد فواتير الشهر:', err);
      alert('حدث خطأ أثناء توليد الفواتير.');
    } finally {
      setIsGenerating(false);
    }
  };

  const monthNames = [
    'كانون الثاني (1)',
    'شباط (2)',
    'آذار (3)',
    'نيسان (4)',
    'أيار (5)',
    'حزيران (6)',
    'تموز (7)',
    'آب (8)',
    'أيلول (9)',
    'تشرين الأول (10)',
    'تشرين الثاني (11)',
    'كانون الأول (12)',
  ];

  return (
    <div className="space-y-4 pb-12">
      
      {/* رأس الصفحة */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-400" />
              <span>شاشة تسعيرة الأمبير الشهرية وتوليد المطالبات</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تحديد سعر الأمبير لكل شهر، وبناءً عليه يقوم النظام آلياً باحتساب المبالغ المطلوبة من كل مشترك مع الديون السابقة
            </p>
          </div>

          {/* اختيار الشهر والسنة */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-1.5 rounded-xl">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-transparent text-xs text-amber-400 font-bold focus:outline-none cursor-pointer"
            >
              {monthNames.map((m, idx) => (
                <option key={idx + 1} value={idx + 1} className="bg-slate-900 text-white">
                  {m}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-xs text-white font-bold focus:outline-none border-r border-slate-700 pr-2 cursor-pointer"
            >
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y} className="bg-slate-900 text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* نموذج إدخال التسعيرة وتوليد المطالبات */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* بطاقة تحديد الأسعار */}
        <div className="lg:col-span-2 bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <form onSubmit={handleSaveAndGenerate} className="space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                تسعيرة شهر: {monthNames[selectedMonth - 1]} لسنة {selectedYear}
              </h3>
              {activeCycle ? (
                <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1 font-semibold">
                  <CheckCircle className="w-3 h-3" />
                  تسعيرة معتمدة ومفعلة
                </span>
              ) : (
                <span className="text-[11px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1 font-semibold">
                  <Clock className="w-3 h-3" />
                  تسعيرة جديدة لم تُعتمد بعد
                </span>
              )}
            </div>

            {/* الحقول المالية لسعر الأمبير */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* الأمبير العادي */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  سعر الأمبير العادي (د.ع) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="500"
                    required
                    value={priceNormal}
                    onChange={(e) => setPriceNormal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-3 pl-8 py-2 text-base font-black text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-500 font-bold">د.ع</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">التشغيل النهاري + المسائي المعتاد</span>
              </div>

              {/* الأمبير الذهبي */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  سعر الأمبير الذهبي (24 ساعة)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="500"
                    value={priceGold}
                    onChange={(e) => setPriceGold(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-3 pl-8 py-2 text-base font-black text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-500 font-bold">د.ع</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">تشغيل مستمر بدون انقطاع</span>
              </div>

              {/* الأمبير المسائي */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  سعر الأمبير المسائي فقط
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="500"
                    value={priceNight}
                    onChange={(e) => setPriceNight(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-3 pl-8 py-2 text-base font-black text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-500 font-bold">د.ع</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">من الساعة 1 ظهراً حتى 1 ليلاً</span>
              </div>

            </div>

            {/* ملاحظات أو كتاب المحافظة */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                بيان التسعيرة / تفاصيل التشغيل
              </label>
              <input
                type="text"
                placeholder="مثال: تسعيرة رسمية استناداً لقرار قائمقامية القضاء بمعدل 12 ساعة تشغيل"
                value={cycleNotes}
                onChange={(e) => setCycleNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* رسالة النجاح */}
            {successMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* زر الاعتماد والاحتساب الفوري */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-6 rounded-xl shadow-xl shadow-amber-500/20 text-sm transition-all cursor-pointer transform active:scale-98"
              >
                <Sparkles className="w-5 h-5" />
                <span>
                  {isGenerating
                    ? 'جاري احتساب الفواتير وترحيل الديون...'
                    : 'اعتماد التسعيرة وتوليد فواتير الشهر لكل المشتركين'}
                </span>
              </button>
            </div>

          </form>
        </div>

        {/* بطاقة إحصائيات الشهر التقديرية */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-sm text-white mb-3 border-b border-slate-700/80 pb-2">
              مؤشرات هذا الشهر ({monthNames[selectedMonth - 1]})
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">إجمالي حمل المولدة النشط:</span>
                <span className="font-black text-amber-400 text-sm">
                  {monthStats.totalAmperes} أمبير
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">المشتركين النشطين:</span>
                <span className="font-bold text-slate-200">
                  {monthStats.activeSubsCount} مشترك
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">الفواتير المتولدة:</span>
                <span className="font-bold text-slate-200">
                  {monthStats.invoicesGenerated} فاتورة
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">المبلغ الإجمالي المتوقع:</span>
                <span className="font-black text-emerald-400 text-sm">
                  {formatIQD(monthStats.totalDue)}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400">المحصل الفعلي حتى الآن:</span>
                <span className="font-black text-white text-sm">
                  {formatIQD(monthStats.totalCollected)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-[11px] text-amber-300 leading-relaxed">
            💡 <strong>تنبيه ذكي:</strong> عند الضغط على توليد الفواتير، يقوم النظام بضرب عدد أمبيرات كل مشترك في سعر هذا الشهر، ويضيف تلقائياً أي مبالغ سابقة لم يتم تسديدها في الأشهر الماضية دون أي خطأ حسابي.
          </div>
        </div>

      </div>

      {/* سجل تسعيرات الأشهر السابقة */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 shadow-lg space-y-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>أرشيف وسجل تسعيرات الأشهر السابقة</span>
        </h3>

        {cycles.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">لا توجد تسعيرات مسجلة سابقة</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {cycles.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedMonth(c.month);
                  setSelectedYear(c.year);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  c.month === selectedMonth && c.year === selectedYear
                    ? 'bg-amber-500/15 border-amber-500 text-white'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex justify-between items-center text-xs font-bold mb-1">
                  <span>شهر {c.month} / {c.year}</span>
                  <span className="text-amber-400">{formatIQD(c.pricePerAmpereNormal)}/أمبير</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{c.notes || 'تسعيرة معتمدة'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
