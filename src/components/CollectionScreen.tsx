import { useState, useMemo, useEffect, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  formatIQD,
  recordPayment,
  roundIQD,
  calculateUnitPrice,
  syncSubscriberInvoiceForCurrentCycle,
  syncAllMissingInvoices
} from '../services/billingService';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { BottomSheet } from './BottomSheet';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import type { Subscriber, Invoice, Payment, TenantSettings } from '../types';
import {
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  SlidersHorizontal,
  DollarSign,
  TrendingUp,
  CreditCard,
  UserCheck,
  Zap,
  MessageSquare,
  X,
  LayoutGrid,
  List,
  Percent
} from 'lucide-react';

interface CollectionScreenProps {
  tenantId: string;
  settings?: TenantSettings;
  onRefreshSync: () => void;
}

export const CollectionScreen: FC<CollectionScreenProps> = ({
  tenantId,
  settings,
  onRefreshSync,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>(() => {
    return (localStorage.getItem('collection_view_mode') as 'cards' | 'compact') || 'cards';
  });

  const handleToggleViewMode = (mode: 'cards' | 'compact') => {
    setViewMode(mode);
    localStorage.setItem('collection_view_mode', mode);
  };

  // نوافذ الدفع والتأكيد
  const [payingSub, setPayingSub] = useState<{ sub: Subscriber; invoice?: Invoice } | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [collectorName, setCollectorName] = useState<string>(settings?.ownerName || 'الجابي الميداني');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // نافذة الوصل المطبوع والواتساب بعد الدفع
  const [lastPaymentReceipt, setLastPaymentReceipt] = useState<{
    subscriber: Subscriber;
    payment: Payment;
    remaining: number;
  } | null>(null);

  // جلب البيانات من IndexedDB محلياً بعزل كامل للمستأجر (Tenant Data Isolation)
  const subscribers = useLiveQuery(
    () => db.subscribers.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const invoices = useLiveQuery(
    () => db.invoices.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const payments = useLiveQuery(
    () => db.payments.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const cycles = useLiveQuery(
    () => db.billingCycles.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];

  // أحدث دورة تسعيرة نشطة
  const latestCycle = useMemo(() => {
    if (!cycles || cycles.length === 0) return undefined;
    const sorted = [...cycles].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
    return sorted.find((c) => !c.isClosed) || sorted[0];
  }, [cycles]);

  // فحص ذاتي وتوليد فوري للفواتير المفقودة لأي مشترك جديد أو من تم تعديل أمبيراته
  useEffect(() => {
    if (tenantId) {
      syncAllMissingInvoices(tenantId).catch((err) => {
        console.warn('فحص الفواتير المفقودة التلقائي:', err);
      });
    }
  }, [tenantId, subscribers.length]);

  // قائمة الشوارع الفريدة للفلتر
  const streetsList = useMemo(() => {
    const streets = new Set<string>();
    subscribers.forEach((s) => {
      if (s.street) streets.add(s.street.trim());
    });
    return Array.from(streets);
  }, [subscribers]);

  // ربط الفواتير بالمشتركين - اعتماد أحدث فاتورة للمشترك دائماً
  const invoiceMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    const sortedInvoices = [...invoices].sort((a, b) => {
      const orderA = (a.year || 0) * 100 + (a.month || 0);
      const orderB = (b.year || 0) * 100 + (b.month || 0);
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
    sortedInvoices.forEach((inv) => {
      map.set(inv.subscriberId, inv);
    });
    return map;
  }, [invoices]);

  // دالة موحدة ودقيقة لاحتساب رصيد واستحقاق المشترك بشكل فوري
  const getSubscriberBalance = (sub: Subscriber) => {
    const inv = invoiceMap.get(sub.id);
    if (inv) {
      const totalDue = inv.totalDue;
      const totalPaid = inv.totalPaid || 0;
      const remaining = Math.max(0, totalDue - totalPaid);
      return {
        invoice: inv,
        totalDue,
        totalPaid,
        remaining,
        isPaid: remaining === 0,
        isPartial: totalPaid > 0 && remaining > 0,
        status: inv.status,
      };
    }

    // إذا لم تكن الفاتورة محفوظة بعد في جدول الفواتير ولكن توجد دورة تسعيرة نشطة
    if (latestCycle && sub.isActive) {
      const unitPrice = calculateUnitPrice(sub, latestCycle);
      const currentAmount =
        sub.subscriptionType === 'fixed'
          ? (sub.fixedPrice || 0)
          : roundIQD(sub.amperes * unitPrice);
      const totalDue = currentAmount + (sub.openingBalance || 0);
      const totalPaid = 0;
      const remaining = totalDue;
      return {
        invoice: undefined,
        totalDue,
        totalPaid,
        remaining,
        isPaid: remaining === 0,
        isPartial: false,
        status: (remaining === 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
      };
    }

    const totalDue = sub.openingBalance || 0;
    const totalPaid = 0;
    const remaining = totalDue;
    return {
      invoice: undefined,
      totalDue,
      totalPaid,
      remaining,
      isPaid: remaining === 0,
      isPartial: false,
      status: (remaining === 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
    };
  };

  // إحصائيات التحصيل لليوم
  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todayPayments = payments.filter(
      (p) => new Date(p.paymentDate).toDateString() === today
    );

    const totalCollectedToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    const uniquePaidSubscribersToday = new Set(todayPayments.map((p) => p.subscriberId)).size;

    let totalDueAll = 0;
    let totalPaidAll = 0;

    subscribers.forEach((sub) => {
      const balance = getSubscriberBalance(sub);
      totalDueAll += balance.totalDue;
      totalPaidAll += balance.totalPaid;
    });

    const remainingUnpaidTotal = Math.max(0, totalDueAll - totalPaidAll);
    const collectionPercentage = totalDueAll > 0 ? Math.round((totalPaidAll / totalDueAll) * 100) : 0;

    return {
      totalCollectedToday,
      uniquePaidSubscribersToday,
      remainingUnpaidTotal,
      totalDueAll,
      totalPaidAll,
      collectionPercentage,
    };
  }, [payments, subscribers, invoiceMap, latestCycle]);

  // تصفية المشتركين بناءً على البحث والشارع وحالة الدفع
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const balance = getSubscriberBalance(sub);
      const status = balance.status;

      // مطابقة البحث
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        sub.fullName.toLowerCase().includes(term) ||
        sub.phone.includes(term) ||
        sub.breakerNumber.toLowerCase().includes(term) ||
        sub.street.toLowerCase().includes(term);

      // مطابقة الشارع
      const matchesStreet = selectedStreet === 'all' || sub.street === selectedStreet;

      // مطابقة حالة الدفع
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesStreet && matchesStatus;
    });
  }, [subscribers, invoiceMap, latestCycle, searchTerm, selectedStreet, statusFilter]);

  // فتح نافذة الدفع السريع لمشترك
  const openPaymentModal = async (sub: Subscriber) => {
    let inv = invoiceMap.get(sub.id);
    if (!inv && sub.isActive) {
      try {
        const synced = await syncSubscriberInvoiceForCurrentCycle(sub, latestCycle);
        if (synced) inv = synced;
      } catch (err) {
        console.warn('توليد الفاتورة الاحتياطي:', err);
      }
    }
    const balance = getSubscriberBalance(sub);
    const due = balance.remaining;
    setPayingSub({ sub, invoice: inv || balance.invoice });
    setCustomAmount(due > 0 ? due.toString() : '');
    setPaymentNote('');
  };

  // تأكيد تسجيل الدفعة
  const handleConfirmPayment = async () => {
    if (!payingSub) return;
    const amountNum = parseFloat(customAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('يرجى إدخال مبلغ صحيح بالدينار العراقي');
      return;
    }

    try {
      setIsSubmitting(true);
      const currentTenantId = settings?.id || tenantId || 'tenant-01';

      // التأكد من وجود فاتورة مسجلة للمشترك لربط السند بها
      let targetInvoice = payingSub.invoice;
      let invoiceId = targetInvoice?.id;
      if (!invoiceId && payingSub.sub.isActive) {
        const synced = await syncSubscriberInvoiceForCurrentCycle(payingSub.sub, latestCycle);
        if (synced) {
          invoiceId = synced.id;
          targetInvoice = synced;
        }
      }

      const payment = await recordPayment({
        tenantId: currentTenantId,
        subscriberId: payingSub.sub.id,
        invoiceId,
        amount: amountNum,
        collectorName: collectorName || 'صاحب المولدة',
        notes: paymentNote || undefined,
      });

      // حساب المتبقي للوصل
      const currentDue = targetInvoice
        ? Math.max(0, targetInvoice.totalDue - ((targetInvoice.totalPaid || 0) + amountNum))
        : Math.max(0, payingSub.sub.openingBalance - amountNum);

      onRefreshSync();
      setPayingSub(null);

      // فتح نافذة الوصل للمشاركة والطباعة
      setLastPaymentReceipt({
        subscriber: payingSub.sub,
        payment,
        remaining: currentDue,
      });
    } catch (err) {
      console.error('خطأ أثناء تسجيل الدفعة:', err);
      alert('حدث خطأ أثناء حفظ السند.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // قبض كامل بلمسة واحدة (1-Click Full Payment ⚡)
  const handleQuickFullPayment = async (sub: Subscriber) => {
    let inv = invoiceMap.get(sub.id);
    if (!inv && sub.isActive) {
      try {
        const synced = await syncSubscriberInvoiceForCurrentCycle(sub, latestCycle);
        if (synced) inv = synced;
      } catch (err) {
        console.warn('توليد الفاتورة التلقائي عند القبض السريع:', err);
      }
    }

    const balance = getSubscriberBalance(sub);
    const due = balance.remaining;
    if (due <= 0) return;

    try {
      setIsSubmitting(true);
      const currentTenantId = settings?.id || tenantId || 'tenant-01';

      const payment = await recordPayment({
        tenantId: currentTenantId,
        subscriberId: sub.id,
        invoiceId: inv?.id,
        amount: due,
        collectorName: collectorName || settings?.ownerName || 'الجابي الميداني',
        notes: 'قبض كامل سريع ⚡',
      });

      // اهتزاز لمسي خفيف لتأكيد الإنجاز الفوري بالجوال
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(45); } catch (_) {}
      }

      onRefreshSync();

      // طباعة حرارية تلقائية صامتة إذا كانت الطابعة متصلة
      if (bluetoothPrinter.isSupported()) {
        try {
          bluetoothPrinter.printReceipt(sub, payment, 0, settings).catch(() => {});
        } catch (_) {}
      }

      // فتح نافذة الوصل للمعاينة أو المشاركة
      setLastPaymentReceipt({
        subscriber: sub,
        payment,
        remaining: 0,
      });
    } catch (err) {
      console.error('خطأ أثناء القبض السريع:', err);
      alert('حدث خطأ أثناء حفظ السند السريع');
    } finally {
      setIsSubmitting(false);
    }
  };

  // إرسال تذكير بالدين عبر واتساب (WhatsApp Debt Reminder)
  const handleSendDebtReminder = (sub: Subscriber) => {
    const balance = getSubscriberBalance(sub);
    const due = balance.remaining;
    const inv = balance.invoice;
    const currentAmount = inv
      ? inv.currentAmount
      : latestCycle && sub.isActive
      ? sub.subscriptionType === 'fixed'
        ? sub.fixedPrice || 0
        : roundIQD(sub.amperes * calculateUnitPrice(sub, latestCycle))
      : 0;
    const prevDebt = inv ? inv.previousDebt : sub.openingBalance;
    const generatorName = settings?.generatorName || 'المولدة الأهلية';
    const paymentPhone = settings?.phone || '';

    let cleanPhone = (sub.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '964' + cleanPhone.substring(1);
    }

    const message = `السلام عليكم أخي المشترك (${sub.fullName}) المحترم 🌹\n` +
      `نود تذكيركم بوجود مستحقات اشتراك لدى: ${generatorName}\n` +
      `⚡ عدد الأمبيرات: ${sub.amperes} أمبير (${sub.breakerNumber})\n` +
      (currentAmount > 0 ? `📅 اشتراك الشهر الحالي: ${formatIQD(currentAmount)}\n` : '') +
      (prevDebt > 0 ? `⏮️ ديون سابقة مرحلة: ${formatIQD(prevDebt)}\n` : '') +
      `💰 إجمالي المطلوب بذمتكم: ${formatIQD(due)}\n\n` +
      `يرجى التفضل بالسداد عند مرور الجابي أو التحويل عبر زين كاش / كي كارد على الرقم: ${paymentPhone || 'رقم إدارة المولدة'}.\n` +
      `شاكرين حسن تعاونكم معنا.`;

    const encoded = encodeURIComponent(message);
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  return (
    <div className="space-y-4 pb-12">
      
      {/* 1. لوحة المؤشرات المالية المدمجة (Fintech Summary Bar) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-lg backdrop-blur-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          
          {/* مقبوضات اليوم */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block truncate">مقبوضات اليوم</span>
              <span className="text-sm sm:text-base font-black text-amber-400 block truncate">
                {formatIQD(todayStats.totalCollectedToday)}
              </span>
            </div>
          </div>

          {/* المسددين اليوم */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block truncate">المسددين اليوم</span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm sm:text-base font-black text-emerald-400">
                  {todayStats.uniquePaidSubscribersToday}
                </span>
                <span className="text-[10px] text-slate-400">مشترك</span>
              </div>
            </div>
          </div>

          {/* المتبقي المطلوب */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 block truncate">المتبقي المطلوب</span>
              <span className="text-sm sm:text-base font-black text-rose-400 block truncate">
                {formatIQD(todayStats.remainingUnpaidTotal)}
              </span>
            </div>
          </div>

          {/* نسبة إنجاز التحصيل */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <Percent className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 mb-1">
                <span>نسبة التحصيل</span>
                <span className="font-bold text-cyan-300">{todayStats.collectionPercentage}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 sm:h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, todayStats.collectionPercentage)}%` }}
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 2. شريط البحث السريع والفلترة بالأزقة (مخصص للعمل الميداني) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg">
        
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* حقل البحث البارز بالاسم أو القاطع أو الهاتف */}
          <div className="relative flex-1 flex items-center">
            <Search className="absolute right-3.5 w-5 h-5 text-amber-400 pointer-events-none" />
            <input
              type="text"
              placeholder="🔍 ابحث باسم المشترك، رقم القاطع (الفيز)، الهاتف، أو الزقاق..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pr-11 pl-10 py-3 text-sm text-white placeholder-slate-400 focus:outline-none transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 p-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* نمط العرض: بطاقات / قائمة سريعة للأزقة */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleToggleViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="نمط البطاقات الأنيقة"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">بطاقات</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('compact')}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="قائمة سريعة ومضغوطة للأزقة (8-10 مشتركين بالشاشة)"
            >
              <List className="w-3.5 h-3.5" />
              <span>سريع للأزقة</span>
            </button>
          </div>

          {/* فلتر حالة التسديد بأزرار واضحة وسهلة اللمس */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({subscribers.length})
            </button>
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'unpaid'
                  ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              غير مسدد
            </button>
            <button
              onClick={() => setStatusFilter('partial')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'partial'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              جزئي
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'paid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              خالص
            </button>
          </div>
        </div>

        {/* فلاتر سريعة للأزقة والشوارع (أزرار أفقية سهلة الضغط) */}
        {streetsList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-medium whitespace-nowrap ml-1">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              الشارع:
            </span>
            <button
              onClick={() => setSelectedStreet('all')}
              className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
                selectedStreet === 'all'
                  ? 'bg-slate-700 text-amber-300 font-bold border border-slate-600'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              كل الأزقة
            </button>
            {streetsList.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStreet(st)}
                className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap ${
                  selectedStreet === st
                    ? 'bg-slate-700 text-amber-300 font-bold border border-slate-600'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* 3. قائمة بطاقات المشتركين والتحصيل السريع */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
          <span>نتائج المشتركين: ({filteredSubscribers.length}) مشترك</span>
          
          {/* زر تبديل نمط العرض: بطاقات مفصلة أو قائمة ميدانية سريعة للأزقة */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => handleToggleViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="عرض البطاقات الأنيقة"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">بطاقات</span>
            </button>
            <button
              onClick={() => handleToggleViewMode('compact')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="عرض القائمة الميدانية فائقة السرعة للأزقة"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">قائمة سريعة</span>
            </button>
          </div>
        </div>

        {filteredSubscribers.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <p className="text-base font-semibold text-slate-300">لم يتم العثور على أي مشترك مطابق</p>
            <p className="text-xs text-slate-500 mt-1">تأكد من كتابة الاسم أو رقم القاطع بدقة أو قم بتغيير الفلتر</p>
          </div>
        ) : viewMode === 'compact' ? (
          /* وضع القائمة الميدانية فائقة السرعة (Street Fast List - 8-10 مشتركين في الشاشة) */
          <div className="space-y-1.5">
            {filteredSubscribers.map((sub) => {
              const balance = getSubscriberBalance(sub);
              const { remaining, isPaid, isPartial } = balance;

              return (
                <div
                  key={sub.id}
                  className={`bg-slate-900/90 border rounded-xl p-2.5 flex items-center justify-between gap-2.5 transition-all fintech-card-shadow ${
                    isPaid
                      ? 'border-emerald-500/25 opacity-75'
                      : isPartial
                      ? 'border-amber-500/40 hover:border-amber-500'
                      : 'border-rose-500/40 hover:border-rose-500'
                  }`}
                >
                  {/* نقطة الحالة والمعلومات الأساسية */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        isPaid ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="font-bold text-sm text-white truncate hover:text-amber-400 cursor-pointer"
                          onClick={() => openPaymentModal(sub)}
                          title="انقر لتفاصيل السند أو الدفع المخصص"
                        >
                          {sub.fullName}
                        </span>
                        {isPaid && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded">
                            خالص
                          </span>
                        )}
                        {isPartial && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded">
                            جزئي
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 truncate mt-0.5">
                        <span className="text-amber-400 font-semibold">{sub.breakerNumber}</span>
                        <span>•</span>
                        <span>{sub.amperes}A</span>
                        {sub.street && (
                          <>
                            <span>•</span>
                            <span className="truncate">{sub.street}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* المبلغ وزر الإجراء السريع بلمسة واحدة */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-left">
                      <span
                        className={`text-sm font-black block tracking-tight ${
                          isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {isPaid ? 'خالص' : formatIQD(remaining)}
                      </span>
                    </div>

                    {isPaid ? (
                      <button
                        onClick={() => openPaymentModal(sub)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                        title="تفاصيل السند"
                      >
                        سند
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleQuickFullPayment(sub)}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs shadow-sm transition cursor-pointer flex items-center gap-1"
                          title="قبض كامل بلمسة واحدة"
                        >
                          <Zap className="w-3.5 h-3.5 fill-slate-950" />
                          <span>قبض</span>
                        </button>
                        <button
                          onClick={() => handleSendDebtReminder(sub)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs transition cursor-pointer"
                          title="تذكير واتساب"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openPaymentModal(sub)}
                          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 bg-slate-950 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                          title="دفع مخصص / جزئي"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          /* نمط البطاقات الأنيقة (Cards View) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSubscribers.map((sub) => {
              const balance = getSubscriberBalance(sub);
              const { totalDue, totalPaid, remaining, isPaid, isPartial } = balance;

              return (
                <div
                  key={sub.id}
                  className={`bg-slate-900/90 border rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between gap-3 shadow-md hover:border-slate-600 ${
                    isPaid
                      ? 'border-emerald-500/30 hover:border-emerald-500/60'
                      : isPartial
                      ? 'border-amber-500/40 hover:border-amber-500/70'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* الرأس: الاسم ورقم القاطع */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4
                          onClick={() => openPaymentModal(sub)}
                          className="font-bold text-base text-white hover:text-amber-400 cursor-pointer"
                        >
                          {sub.fullName}
                        </h4>
                        {isPaid && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle className="w-3 h-3" />
                            خالص
                          </span>
                        )}
                        {isPartial && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            جزئي
                          </span>
                        )}
                        {!isPaid && !isPartial && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            مطلوب
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <span>📍 {sub.street}</span>
                      </p>
                    </div>

                    {/* وسم رقم القاطع والأمبيرات */}
                    <div className="text-left bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                      <div className="text-xs font-black text-amber-400 tracking-wider">
                        {sub.breakerNumber || 'قاطع'}
                      </div>
                      <div className="text-[11px] text-slate-300 font-medium">
                        {sub.amperes} أمبير
                      </div>
                    </div>
                  </div>

                  {/* التفاصيل المالية */}
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>المبلغ المستحق:</span>
                      <span className="font-bold text-slate-200">{formatIQD(totalDue)}</span>
                    </div>
                    {totalPaid > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>الواصل:</span>
                        <span className="font-semibold">{formatIQD(totalPaid)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 font-bold">
                      <span className={remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        {remaining > 0 ? 'المتبقي للتسديد:' : 'الرصيد خالص:'}
                      </span>
                      <span className={`text-sm ${remaining > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}`}>
                        {remaining > 0 ? formatIQD(remaining) : '0 د.ع'}
                      </span>
                    </div>
                  </div>

                  {/* أزرار التحصيل الميداني السريع */}
                  <div className="pt-1 space-y-1.5">
                    {isPaid ? (
                      <button
                        onClick={() => openPaymentModal(sub)}
                        className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-3 rounded-xl border border-slate-700 text-xs transition-colors cursor-pointer"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        قبض إضافي أو دفع مقدم
                      </button>
                    ) : (
                      <>
                        {/* زر القبض الكامل الفوري بلمسة واحدة */}
                        <button
                          onClick={() => handleQuickFullPayment(sub)}
                          disabled={isSubmitting}
                          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-2.5 px-3 rounded-xl shadow-lg shadow-amber-500/20 text-xs sm:text-sm transition-all cursor-pointer"
                          title="قبض المبلغ المتبقي كاملاً فوراً"
                        >
                          <Zap className="w-4 h-4 fill-slate-950 stroke-[2.5]" />
                          <span>⚡ قبض كامل ({formatIQD(remaining)})</span>
                        </button>

                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          {/* زر تذكير واتساب بالدين */}
                          <button
                            onClick={() => handleSendDebtReminder(sub)}
                            className="flex items-center justify-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-2 rounded-xl transition-all cursor-pointer"
                            title="إرسال رسالة تذكير بالدين للمشترك عبر واتساب"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>تذكير واتساب</span>
                          </button>

                          {/* زر قبض جزئي أو مخصص */}
                          <button
                            onClick={() => openPaymentModal(sub)}
                            className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold py-2 px-2 rounded-xl transition-all cursor-pointer"
                            title="دفع مبلغ جزئي أو مخصص"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>دفع جزئي</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* صفيحة تسجيل الدفعة السريعة (Quick Payment Bottom Sheet) */}
      <BottomSheet
        isOpen={Boolean(payingSub)}
        onClose={() => setPayingSub(null)}
        title={payingSub ? `تسجيل سند: ${payingSub.sub.fullName}` : 'تسجيل سند قبض'}
        subtitle={payingSub ? `القاطع: ${payingSub.sub.breakerNumber} (${payingSub.sub.amperes} أمبير) - ${payingSub.sub.street}` : ''}
        icon={<CreditCard className="w-5 h-5 text-amber-400" />}
        footer={
          <div className="flex gap-2">
            <button
              onClick={handleConfirmPayment}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/20 text-sm transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'تأكيد وقبض المبلغ'}</span>
            </button>
            <button
              onClick={() => setPayingSub(null)}
              className="px-4 py-3 text-xs font-bold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        }
      >
        {payingSub && (
          <div className="space-y-3.5">
            {/* إجمالي المستحق للتذكير */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-400">إجمالي المبلغ المطلوب بذمته:</span>
              <span className="text-base font-black text-amber-400">
                {payingSub.invoice
                  ? formatIQD(payingSub.invoice.totalDue - payingSub.invoice.totalPaid)
                  : formatIQD(payingSub.sub.openingBalance)}
              </span>
            </div>

            {/* أزرار النقد العراقي السريع (Quick Iraqi Cash Chips) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                مبالغ سريعة بنقرة واحدة:
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[5000, 10000, 15000, 20000, 25000, 50000].map((quickVal) => (
                  <button
                    key={quickVal}
                    type="button"
                    onClick={() => setCustomAmount(quickVal.toString())}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-amber-300 py-2 px-1 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer text-center"
                  >
                    {quickVal >= 1000 ? `${quickVal / 1000} ألف` : quickVal}
                  </button>
                ))}
              </div>
            </div>

            {/* حقل إدخال المبلغ */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300">
                  المبلغ المقبوض (د.ع) <span className="text-rose-400">*</span>
                </label>
                {payingSub.invoice && (
                  <button
                    type="button"
                    onClick={() => setCustomAmount((payingSub.invoice!.totalDue - payingSub.invoice!.totalPaid).toString())}
                    className="text-[11px] text-amber-400 hover:underline font-bold cursor-pointer"
                  >
                    تسديد كامل المتبقي
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  placeholder="مثال: 50000"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pr-3 pl-12 py-3 text-lg font-black text-emerald-400 focus:outline-none transition-all"
                />
                <span className="absolute left-3 top-3.5 text-xs text-slate-500 font-black">د.ع</span>
              </div>
            </div>

            {/* اسم المحصل */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                اسم المستلم / الجابي
              </label>
              <input
                type="text"
                value={collectorName}
                onChange={(e) => setCollectorName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none transition-all"
              />
            </div>

            {/* ملاحظات */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                ملاحظة على السند (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: واصل من حسابه، سدد عند البيت..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none transition-all"
              />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* نافذة الوصل الحراري وسند الواتساب بعد التسديد */}
      {lastPaymentReceipt && (
        <ThermalReceiptModal
          isOpen={true}
          onClose={() => setLastPaymentReceipt(null)}
          subscriber={lastPaymentReceipt.subscriber}
          payment={lastPaymentReceipt.payment}
          remainingDebt={lastPaymentReceipt.remaining}
          settings={settings}
        />
      )}

    </div>
  );
};
