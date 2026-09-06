import { useState, useMemo, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatIQD } from '../services/billingService';
import type { Expense, ExpenseCategory, TenantSettings } from '../types';
import {
  DollarSign,
  Fuel,
  Wrench,
  Users,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Calendar,
  X,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';

interface ExpensesScreenProps {
  tenantId: string;
  settings?: TenantSettings;
  onRefreshSync?: () => void;
}

const CATEGORY_LABELS: Record<ExpenseCategory, { label: string; color: string; icon: any }> = {
  fuel: { label: 'كاز / وقود', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Fuel },
  oil_maintenance: { label: 'دهن وفلاتر', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Wrench },
  repairs: { label: 'تصليح وأعطال', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: Wrench },
  salaries: { label: 'رواتب عمال وجباة', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: Users },
  rent: { label: 'كراء أرضية وموقع', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', icon: DollarSign },
  other: { label: 'مصاريف أخرى', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: DollarSign },
};

export const ExpensesScreen: FC<ExpensesScreenProps> = ({
  tenantId,
  settings,
  onRefreshSync,
}) => {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // نافذة إضافة مصروف جديد
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // جلب المصاريف والدفعات من Dexie
  const expenses = useLiveQuery(
    () => db.expenses.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];

  const payments = useLiveQuery(
    () => db.payments.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];

  // تصفية المصاريف حسب الشهر والسنة والتصنيف
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      const expDate = new Date(exp.date);
      const matchesMonth = expDate.getMonth() + 1 === selectedMonth;
      const matchesYear = expDate.getFullYear() === selectedYear;
      const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;
      return matchesMonth && matchesYear && matchesCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedMonth, selectedYear, categoryFilter]);

  // إجمالي المقبوضات للشهر المختار
  const monthlyRevenue = useMemo(() => {
    return payments
      .filter((p) => {
        const pDate = new Date(p.paymentDate);
        return pDate.getMonth() + 1 === selectedMonth && pDate.getFullYear() === selectedYear;
      })
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments, selectedMonth, selectedYear]);

  // إجمالي المصاريف للشهر المختار
  const totalMonthlyExpenses = useMemo(() => {
    return expenses
      .filter((exp) => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() + 1 === selectedMonth && expDate.getFullYear() === selectedYear;
      })
      .reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses, selectedMonth, selectedYear]);

  // صافي الربح الفعلي (المقبوضات - المصاريف)
  const netProfit = monthlyRevenue - totalMonthlyExpenses;

  // إحصائيات الكاز (الوقود) للشهر
  const fuelStats = useMemo(() => {
    const fuelExpenses = expenses.filter((exp) => {
      const expDate = new Date(exp.date);
      return (
        expDate.getMonth() + 1 === selectedMonth &&
        expDate.getFullYear() === selectedYear &&
        exp.category === 'fuel'
      );
    });

    const totalLiters = fuelExpenses.reduce((sum, exp) => sum + (exp.liters || 0), 0);
    const totalFuelCost = fuelExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const avgPricePerLiter = totalLiters > 0 ? Math.round(totalFuelCost / totalLiters) : 0;

    return { totalLiters, totalFuelCost, avgPricePerLiter };
  }, [expenses, selectedMonth, selectedYear]);

  // إضافة مصروف جديد
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) {
      alert('يرجى إدخال اسم المصروف ومبلغ صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      const newExpense: Expense = {
        id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        tenantId,
        category,
        title: title.trim(),
        amount: numAmount,
        liters: category === 'fuel' && liters ? parseFloat(liters) : undefined,
        date: expenseDate,
        notes: notes.trim() || undefined,
        createdByName: settings?.ownerName || 'صاحب المولدة',
        createdAt: new Date().toISOString(),
      };

      await db.expenses.add(newExpense);

      // إضافة لطابور المزامنة
      await db.syncQueue.add({
        id: 'sync-' + Date.now(),
        action: 'insert',
        entity: 'expenses',
        entityId: newExpense.id,
        payload: newExpense,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      if (onRefreshSync) onRefreshSync();

      // إعادة التعيين
      setTitle('');
      setAmount('');
      setLiters('');
      setNotes('');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error adding expense:', err);
      alert('حدث خطأ أثناء حفظ المصروف');
    } finally {
      setIsSubmitting(false);
    }
  };

  // حذف مصروف
  const handleDeleteExpense = async (id: string, expTitle: string) => {
    if (!confirm('هل أنت متأكد من حذف المصروف: ' + expTitle + '؟')) return;
    try {
      await db.expenses.delete(id);
      await db.syncQueue.add({
        id: 'sync-' + Date.now(),
        action: 'delete',
        entity: 'expenses',
        entityId: id,
        payload: { id },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
      if (onRefreshSync) onRefreshSync();
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  // تصدير كشف المصاريف بصيغة CSV المتوافقة مع Excel
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('لا توجد مصاريف لتصديرها لهذا الشهر');
      return;
    }

    const headers = ['التاريخ', 'اسم المصروف', 'التصنيف', 'المبلغ (د.ع)', 'اللترات', 'المسجل', 'ملاحظات'];
    const rows = filteredExpenses.map((exp) => [
      exp.date,
      `"${exp.title.replace(/"/g, '""')}"`,
      `"${CATEGORY_LABELS[exp.category]?.label || exp.category}"`,
      exp.amount,
      exp.liters || '',
      `"${exp.createdByName}"`,
      `"${(exp.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'مصاريف-مولدة-' + (settings?.generatorName || 'المولدة') + '-شهر-' + selectedMonth + '-' + selectedYear + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      
      {/* الشريط العلوي واختيار الشهر */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <span>سجل المصاريف وحساب الأرباح</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تتبع مشتريات الكاز، الصيانة، والرواتب مع احتساب صافي الأرباح بدقة
          </p>
        </div>

        {/* فلاتر الشهر والسنة وأزرار التحكم */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-200">
            <Calendar className="w-4 h-4 text-amber-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent border-none text-white focus:outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  شهر {m}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none text-white focus:outline-none cursor-pointer"
            >
              {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                <option key={y} value={y} className="bg-slate-900 text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
            title="تصدير كشف المصاريف إلى إكسل"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">تصدير إكسل</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>إضافة مصروف</span>
          </button>
        </div>
      </div>

      {/* لوحة المؤشرات المالية (مقبوضات - مصاريف = صافي أرباح) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        
        {/* إجمالي الواردات (المقبوضة) */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-3 sm:p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">إجمالي المقبوضات</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base sm:text-xl font-black text-emerald-400 tracking-tight">
            {formatIQD(monthlyRevenue)}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            واردات الجباية الفعلية لشهر {selectedMonth}
          </span>
        </div>

        {/* إجمالي المصاريف والوقود */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-3 sm:p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">إجمالي المصاريف</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base sm:text-xl font-black text-rose-400 tracking-tight">
            {formatIQD(totalMonthlyExpenses)}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            كاز، صيانة، رواتب لشهر {selectedMonth}
          </span>
        </div>

        {/* صافي الربح الفعلي */}
        <div className={`p-3 sm:p-4 rounded-2xl border relative overflow-hidden ${
          netProfit >= 0
            ? 'bg-emerald-950/30 border-emerald-500/40'
            : 'bg-rose-950/30 border-rose-500/40'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">صافي الربح الفعلي</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              netProfit >= 0
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}>
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className={`mt-2 text-base sm:text-xl font-black tracking-tight ${
            netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
          }`}>
            {formatIQD(netProfit)}
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            {netProfit >= 0 ? 'ربح تشغيلي صافي' : 'عجز تشغيلي (مصاريف أعلى من الوارد)'}
          </span>
        </div>

        {/* إحصائيات استهلاك الكاز */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-3 sm:p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">استهلاك الكاز (الديزل)</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base sm:text-xl font-black text-amber-400 tracking-tight">
            {fuelStats.totalLiters.toLocaleString('ar-IQ')} لتر
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            تكلفة الكاز: {formatIQD(fuelStats.totalFuelCost)}
          </span>
        </div>

      </div>

      {/* تصنيفات المصاريف السريعة (Filter Chips) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
            categoryFilter === 'all'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          كل المصاريف ({filteredExpenses.length})
        </button>

        {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((catKey) => {
          const count = expenses.filter((e) => {
            const d = new Date(e.date);
            return (
              d.getMonth() + 1 === selectedMonth &&
              d.getFullYear() === selectedYear &&
              e.category === catKey
            );
          }).length;

          return (
            <button
              key={catKey}
              onClick={() => setCategoryFilter(catKey)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === catKey
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>{CATEGORY_LABELS[catKey].label}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  categoryFilter === catKey ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* قائمة المصاريف (تصميم بطاقات واضحة ومناسبة للهواتف المحمولة) */}
      <div className="space-y-2">
        {filteredExpenses.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-300">لا توجد مصاريف مسجلة لهذا الشهر</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              اضغط على زر "إضافة مصروف" لتسجيل مشتريات الكاز، الصيانة أو رواتب العمال لاحتساب صافي الأرباح.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول مصروف الآن</span>
            </button>
          </div>
        ) : (
          filteredExpenses.map((exp) => {
            const catInfo = CATEGORY_LABELS[exp.category] || CATEGORY_LABELS.other;
            const CatIcon = catInfo.icon;

            return (
              <div
                key={exp.id}
                className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${catInfo.color}`}>
                    <CatIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-white">
                        {exp.title}
                      </h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${catInfo.color}`}>
                        {catInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>📅 {new Date(exp.date).toLocaleDateString('ar-IQ')}</span>
                      {exp.liters ? (
                        <span className="text-amber-400 font-semibold">
                          ⛽ {exp.liters} لتر كاز
                        </span>
                      ) : null}
                      <span className="text-slate-500 hidden sm:inline">
                        مسجل بواسطة: {exp.createdByName}
                      </span>
                    </div>

                    {exp.notes && (
                      <p className="text-xs text-slate-400 mt-1 italic bg-slate-950/60 px-2 py-1 rounded border border-slate-800 inline-block">
                        ملاحظة: {exp.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <span className="text-base sm:text-lg font-black text-rose-400 block tracking-tight">
                      - {formatIQD(exp.amount)}
                    </span>
                    {exp.liters ? (
                      <span className="text-[10px] text-slate-500">
                        (~{Math.round(exp.amount / exp.liters)} د.ع/لتر)
                      </span>
                    ) : null}
                  </div>

                  <button
                    onClick={() => handleDeleteExpense(exp.id, exp.title)}
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    title="حذف المصروف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* نافذة إضافة مصروف جديد (Modal) مهيأة للهواتف المحمولة */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* عنوان النافذة */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">تسجيل مصروف جديد</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* محتوى النموذج */}
            <form onSubmit={handleAddExpense} className="p-4 space-y-3.5 overflow-y-auto">
              
              {/* اختيار التصنيف */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  تصنيف المصروف <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((catKey) => {
                    const isSelected = category === catKey;
                    return (
                      <button
                        type="button"
                        key={catKey}
                        onClick={() => setCategory(catKey)}
                        className={`p-2 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800/80'
                        }`}
                      >
                        {CATEGORY_LABELS[catKey].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* اسم وتفاصيل المصروف */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  اسم المصروف أو البيان <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    category === 'fuel'
                      ? 'مثال: شراء صهريج كاز (وجبة صباحية)'
                      : category === 'oil_maintenance'
                      ? 'مثال: تبديل دهن ماكنة 20 لتر مع فلاتر'
                      : category === 'salaries'
                      ? 'مثال: راتب الجابي لشهر آذار'
                      : 'بيان المصروف...'
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition-all"
                />
              </div>

              {/* المبلغ بالدينار العراقي */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  المبلغ الإجمالي (د.ع) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="مثال: 450000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none transition-all"
                />
              </div>

              {/* حقل اللترات في حال كان التصنيف وقود */}
              {category === 'fuel' && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-amber-300">
                    كمية الوقود (باللتر) <span className="text-slate-400 font-normal">(اختياري لحساب تكلفة اللتر)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="مثال: 500 أو 1000 لتر"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  />
                  {amount && liters && parseFloat(liters) > 0 && (
                    <div className="text-xs text-amber-400 font-bold">
                      💡 تكلفة اللتر المحسوبة: {Math.round(parseInt(amount, 10) / parseFloat(liters))} دينار / لتر
                    </div>
                  )}
                </div>
              )}

              {/* التاريخ */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ المصروف</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none"
                />
              </div>

              {/* ملاحظات */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات إضافية (اختياري)</label>
                <input
                  type="text"
                  placeholder="رقم الوصل، اسم المحطة، اسم المصلح..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none"
                />
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ المصروف'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl text-sm transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
