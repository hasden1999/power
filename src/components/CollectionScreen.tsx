import { useState, useMemo, useEffect, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  formatIQD,
  recordPayment,
  roundIQD,
  calculateUnitPrice,
  syncSubscriberInvoiceForCurrentCycle,
  syncAllMissingInvoices,
  generateInvoicesForCycle
} from '../services/billingService';
import { logAuditAction } from '../services/auditService';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { BottomSheet } from './BottomSheet';
import { ExecutiveCockpit, type CockpitStats } from './ExecutiveCockpit';
import { SubscriberPaymentLedgerModal } from './SubscriberPaymentLedgerModal';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import type { Subscriber, Invoice, Payment, TenantSettings, BillingCycle, UserAccount } from '../types';
import {
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  SlidersHorizontal,
  DollarSign,
  CreditCard,
  Zap,
  MessageSquare,
  X,
  LayoutGrid,
  List,
  History
} from 'lucide-react';

interface CollectionScreenProps {
  tenantId: string;
  settings?: TenantSettings;
  onRefreshSync: () => void;
  currentUser?: UserAccount;
}

export const CollectionScreen: FC<CollectionScreenProps> = ({
  tenantId,
  settings,
  onRefreshSync,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid' | 'debt'>('all');
  const [selectedLedgerSub, setSelectedLedgerSub] = useState<Subscriber | null>(null);
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
  const [collectorName, setCollectorName] = useState<string>(
    currentUser?.fullName || currentUser?.username || settings?.ownerName || 'الجابي الميداني'
  );
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

  // نافذة تعديل سعر الأمبير السريعة من شاشة التحصيل المباشرة
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [inputPriceNormal, setInputPriceNormal] = useState<string>('12000');
  const [inputPriceGold, setInputPriceGold] = useState<string>('20000');
  const [inputPriceNight, setInputPriceNight] = useState<string>('8000');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  useEffect(() => {
    if (latestCycle) {
      setInputPriceNormal(latestCycle.pricePerAmpereNormal.toString());
      setInputPriceGold(latestCycle.pricePerAmpereGold.toString());
      setInputPriceNight(latestCycle.pricePerAmpereNight.toString());
    } else if (settings) {
      setInputPriceNormal(settings.defaultPriceNormal?.toString() || '12000');
      setInputPriceGold(settings.defaultPriceGold?.toString() || '20000');
      setInputPriceNight('8000');
    }
  }, [latestCycle, settings]);

  const handleSaveQuickPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role === 'collector') {
      alert('عذراً، تعديل التسعيرة من صلاحيات صاحب المولدة فقط.');
      return;
    }

    const pNormal = parseFloat(inputPriceNormal);
    const pGold = parseFloat(inputPriceGold) || pNormal;
    const pNight = parseFloat(inputPriceNight) || pNormal;

    if (isNaN(pNormal) || pNormal < 0) {
      alert('يرجى كتابة سعر صحيح للأمبير');
      return;
    }

    try {
      setIsSavingPrice(true);
      const currentDate = new Date();
      const currentMonth = latestCycle?.month || currentDate.getMonth() + 1;
      const currentYear = latestCycle?.year || currentDate.getFullYear();
      const cycleId = latestCycle?.id || `cycle-${currentYear}-${currentMonth}`;

      const cycleData: BillingCycle = {
        id: cycleId,
        tenantId,
        month: currentMonth,
        year: currentYear,
        pricePerAmpereNormal: pNormal,
        pricePerAmpereGold: pGold,
        pricePerAmpereNight: pNight,
        issueDate: new Date().toISOString(),
        notes: `تسعيرة شهر ${currentMonth} - ${currentYear}`,
        isClosed: false,
        createdAt: latestCycle?.createdAt || new Date().toISOString(),
      };

      await db.billingCycles.put(cycleData);
      await generateInvoicesForCycle(cycleData);

      // تسجيل تغيير السعر في سجل التدقيق
      await logAuditAction({
        tenantId,
        userId: currentUser?.id,
        userName: currentUser?.fullName || settings?.ownerName || 'صاحب المولدة',
        userRole: currentUser?.role || 'tenant_owner',
        action: 'price_changed',
        entityType: 'billing_cycle',
        entityId: cycleId,
        details: {
          month: currentMonth,
          year: currentYear,
          priceNormal: pNormal,
          priceGold: pGold,
          priceNight: pNight,
        },
      });

      onRefreshSync();
      setIsPriceModalOpen(false);
      alert(`تم تحديث سعر الأمبير لشهر (${currentMonth}/${currentYear}) واحتساب كافة المشتركين فوراً! ⚡`);
    } catch (err) {
      console.error('خطأ في حفظ التسعيرة:', err);
      alert('حدث خطأ أثناء حفظ التسعيرة.');
    } finally {
      setIsSavingPrice(false);
    }
  };

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

  // قائمة الشوارع الفريدة للفلتر مع عداد المشتركين
  const streetsList = useMemo(() => {
    const map = new Map<string, { count: number; unpaidCount: number }>();
    subscribers.forEach((s) => {
      const st = (s.street || '').trim();
      if (!st) return;
      const cur = map.get(st) || { count: 0, unpaidCount: 0 };
      cur.count += 1;
      const inv = invoiceMap.get(s.id);
      const isUnpaid = inv ? (inv.totalDue - (inv.totalPaid || 0)) > 0 : (s.openingBalance || 0) > 0;
      if (isUnpaid) cur.unpaidCount += 1;
      map.set(st, cur);
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));
  }, [subscribers, invoiceMap]);

  // دالة موحدة ودقيقة لاحتساب رصيد واستحقاق المشترك مع الفصل الصريح للديون السابقة
  const getSubscriberBalance = (sub: Subscriber) => {
    const inv = invoiceMap.get(sub.id);
    if (inv) {
      const totalDue = inv.totalDue;
      const totalPaid = inv.totalPaid || 0;
      const remaining = Math.max(0, totalDue - totalPaid);
      const currentAmount = inv.currentAmount || 0;
      const previousDebt = inv.previousDebt || 0;

      // أولوية السداد الرياضية (Waterfall): تطفئ الديون السابقة المرحلة أولاً
      const remainingPreviousDebt = Math.max(0, previousDebt - totalPaid);
      const paidTowardsCurrent = Math.max(0, totalPaid - previousDebt);
      const remainingCurrentAmount = Math.max(0, currentAmount - paidTowardsCurrent);

      return {
        invoice: inv,
        totalDue,
        totalPaid,
        remaining,
        currentAmount,
        previousDebt,
        remainingPreviousDebt,
        remainingCurrentAmount,
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
      const previousDebt = sub.openingBalance || 0;
      const totalDue = currentAmount + previousDebt;
      const totalPaid = 0;
      const remaining = totalDue;
      return {
        invoice: undefined,
        totalDue,
        totalPaid,
        remaining,
        currentAmount,
        previousDebt,
        remainingPreviousDebt: previousDebt,
        remainingCurrentAmount: currentAmount,
        isPaid: remaining === 0,
        isPartial: false,
        status: (remaining === 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
      };
    }

    const previousDebt = sub.openingBalance || 0;
    const totalDue = previousDebt;
    const totalPaid = 0;
    const remaining = totalDue;
    return {
      invoice: undefined,
      totalDue,
      totalPaid,
      remaining,
      currentAmount: 0,
      previousDebt,
      remainingPreviousDebt: previousDebt,
      remainingCurrentAmount: 0,
      isPaid: remaining === 0,
      isPartial: false,
      status: (remaining === 0 ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
    };
  };

  // إحصائيات شاشة القيادة التنفيذية الذكية (Executive Cockpit Stats)
  const cockpitStats = useMemo<CockpitStats>(() => {
    const today = new Date().toDateString();
    const todayPayments = payments.filter(
      (p) => new Date(p.paymentDate).toDateString() === today
    );

    const totalCollectedToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    const todayReceiptsCount = todayPayments.length;

    let totalOutstandingDebt = 0;
    let previousRolloverDebtTotal = 0;
    let currentCycleDueTotal = 0;
    let unpaidSubscribersCount = 0;
    let partialSubscribersCount = 0;
    let paidSubscribersCount = 0;
    let totalCollectedThisCycle = 0;
    let totalSubscribedAmperes = 0;

    subscribers.forEach((sub) => {
      if (sub.isActive) {
        totalSubscribedAmperes += sub.amperes || 0;
      }
      const balance = getSubscriberBalance(sub);
      totalOutstandingDebt += balance.remaining;
      previousRolloverDebtTotal += balance.remainingPreviousDebt;
      currentCycleDueTotal += balance.remainingCurrentAmount;
      totalCollectedThisCycle += balance.totalPaid;

      if (balance.isPaid) {
        paidSubscribersCount++;
      } else if (balance.isPartial) {
        partialSubscribersCount++;
        unpaidSubscribersCount++;
      } else {
        unpaidSubscribersCount++;
      }
    });

    const totalTargetBilling = totalCollectedThisCycle + totalOutstandingDebt;
    const collectionPercentage =
      totalTargetBilling > 0
        ? Math.round((totalCollectedThisCycle / totalTargetBilling) * 100)
        : 0;

    return {
      totalOutstandingDebt,
      previousRolloverDebtTotal,
      currentCycleDueTotal,
      unpaidSubscribersCount,
      partialSubscribersCount,
      paidSubscribersCount,
      totalSubscribersCount: subscribers.length,
      totalCollectedThisCycle,
      totalCollectedToday,
      todayReceiptsCount,
      totalSubscribedAmperes: Math.round(totalSubscribedAmperes * 10) / 10,
      totalTargetBilling,
      collectionPercentage,
    };
  }, [payments, subscribers, invoiceMap, latestCycle]);

  // تصفية المشتركين بناءً على البحث والشارع وحالة الدفع وجدار الديون
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const balance = getSubscriberBalance(sub);

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

      // مطابقة حالة الدفع وفلتر الديون السابقة
      let matchesStatus = true;
      if (statusFilter === 'unpaid') {
        matchesStatus = !balance.isPaid;
      } else if (statusFilter === 'partial') {
        matchesStatus = balance.isPartial;
      } else if (statusFilter === 'paid') {
        matchesStatus = balance.isPaid;
      } else if (statusFilter === 'debt') {
        matchesStatus = balance.remainingPreviousDebt > 0;
      }

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
        userId: currentUser?.id,
        userRole: currentUser?.role,
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
      
      {/* 1. شاشة القيادة التنفيذية الذكية للمولدة وجدار الديون والأمبيرات */}
      <ExecutiveCockpit
        stats={cockpitStats}
        latestCycle={latestCycle}
        settings={settings}
        currentUser={currentUser}
        activeFilter={statusFilter}
        onFilterSelect={(filter) => setStatusFilter(filter)}
        onOpenPriceModal={() => setIsPriceModalOpen(true)}
      />

      {/* 2. شريط البحث السريع والفلترة بالأزقة والديون الميدانية */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-4 space-y-3 shadow-lg">
        
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* حقل البحث البارز بالاسم أو القاطع أو الهاتف */}
          <div className="relative flex-1 flex items-center">
            <Search className="absolute right-3.5 w-5 h-5 text-amber-400 pointer-events-none" />
            <input
              type="text"
              placeholder="🔍 ابحث باسم المشترك، رقم القاطع (الفيز)، الهاتف، أو الزقاق..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl pr-11 pl-10 py-3 text-sm text-white placeholder-slate-400 focus:outline-none transition-all shadow-inner font-bold"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 p-1 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* نمط العرض: بطاقات / قائمة سريعة للأزقة */}
          <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleToggleViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
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
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="قائمة سريعة ومضغوطة للأزقة (8-10 مشتركين بالشاشة)"
            >
              <List className="w-3.5 h-3.5" />
              <span>سريع للأزقة</span>
            </button>
          </div>

          {/* فلتر حالة التسديد بأزرار تفاعلية واضحة مع الأعداد */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({subscribers.length})
            </button>
            <button
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'unpaid'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              🔴 المتأخرون ({cockpitStats.unpaidSubscribersCount})
            </button>
            <button
              onClick={() => setStatusFilter('debt')}
              className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'debt'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
              title="مشتركون بذمتهم ديون مرحلة من أشهر سابقة"
            >
              ⚠️ ديون سابقة ({subscribers.filter((s) => getSubscriberBalance(s).remainingPreviousDebt > 0).length})
            </button>
            <button
              onClick={() => setStatusFilter('partial')}
              className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'partial'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              جزئي ({cockpitStats.partialSubscribersCount})
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === 'paid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              🟢 خالص ({cockpitStats.paidSubscribersCount})
            </button>
          </div>
        </div>

        {/* فلاتر سريعة للأزقة والشوارع (أزرار أفقية مع عدد المشتركين) */}
        {streetsList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-bold whitespace-nowrap ml-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              الشارع:
            </span>
            <button
              onClick={() => setSelectedStreet('all')}
              className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap font-bold cursor-pointer ${
                selectedStreet === 'all'
                  ? 'bg-slate-700 text-amber-300 border border-slate-600 shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              كل الأزقة ({subscribers.length})
            </button>
            {streetsList.map((st) => (
              <button
                key={st.name}
                onClick={() => setSelectedStreet(st.name)}
                className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap font-bold flex items-center gap-1.5 cursor-pointer ${
                  selectedStreet === st.name
                    ? 'bg-slate-700 text-amber-300 border border-slate-600 shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>{st.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    st.unpaidCount > 0
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {st.count}
                </span>
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
                  className={`bg-slate-900/90 border rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2.5 transition-all fintech-card-shadow ${
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
                          className="font-black text-sm text-white truncate hover:text-amber-400 cursor-pointer"
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
                        {balance.remainingPreviousDebt > 0 && (
                          <span className="text-[10px] font-black text-rose-300 bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.2 rounded">
                            سابق: {formatIQD(balance.remainingPreviousDebt)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 truncate mt-0.5">
                        <span className="text-amber-400 font-black">{sub.breakerNumber}</span>
                        <span>•</span>
                        <span>{sub.amperes}A</span>
                        {sub.street && (
                          <>
                            <span>•</span>
                            <span className="truncate text-slate-400">{sub.street}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* المبلغ وزر الإجراء السريع بلمسة واحدة */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-left">
                      <span
                        className={`text-sm sm:text-base font-black block tracking-tight ${
                          isPaid ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-rose-400'
                        }`}
                      >
                        {isPaid ? 'خالص' : formatIQD(remaining)}
                      </span>
                    </div>

                    {isPaid ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedLedgerSub(sub)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                          title="سجل التسديدات الموثق بالتواريخ"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPaymentModal(sub)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                          title="سند جديد"
                        >
                          سند
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleQuickFullPayment(sub)}
                          disabled={isSubmitting}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs shadow-sm transition cursor-pointer flex items-center gap-1"
                          title="قبض كامل بلمسة واحدة"
                        >
                          <Zap className="w-3.5 h-3.5 fill-slate-950" />
                          <span>قبض</span>
                        </button>
                        <button
                          onClick={() => setSelectedLedgerSub(sub)}
                          className="p-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-400 border border-slate-800 text-xs transition cursor-pointer"
                          title="سجل التسديدات الموثق بالتواريخ والأوقات"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSendDebtReminder(sub)}
                          className="p-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs transition cursor-pointer"
                          title="تذكير واتساب"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openPaymentModal(sub)}
                          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
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
              const { totalPaid, remaining, isPaid, isPartial } = balance;

              return (
                <div
                  key={sub.id}
                  className={`bg-slate-900/90 border rounded-3xl p-4 transition-all duration-200 flex flex-col justify-between gap-3.5 shadow-md hover:border-slate-600 ${
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4
                          onClick={() => openPaymentModal(sub)}
                          className="font-black text-base text-white hover:text-amber-400 cursor-pointer"
                        >
                          {sub.fullName}
                        </h4>
                        {isPaid && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle className="w-3 h-3" />
                            خالص
                          </span>
                        )}
                        {isPartial && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            جزئي
                          </span>
                        )}
                        {!isPaid && !isPartial && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            مطلوب
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <span>📍 {sub.street || 'بدون زقاق'}</span>
                      </p>
                    </div>

                    {/* وسم رقم القاطع والأمبيرات */}
                    <div className="text-left bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800 flex-shrink-0">
                      <div className="text-xs font-black text-amber-400 tracking-wider">
                        {sub.breakerNumber || 'قاطع'}
                      </div>
                      <div className="text-[11px] text-slate-300 font-bold">
                        {sub.amperes} أمبير
                      </div>
                    </div>
                  </div>

                  {/* التفاصيل المالية المزدوجة المفصلة بدقة */}
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 text-xs space-y-1.5">
                    {/* ديون سابقة مرحلة إن وجدت */}
                    {balance.remainingPreviousDebt > 0 && (
                      <div className="flex justify-between items-center bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-xl px-2.5 py-1.5 font-bold">
                        <span>⏮️ ديون سابقة مرحلة:</span>
                        <strong className="font-black text-rose-400">{formatIQD(balance.remainingPreviousDebt)}</strong>
                      </div>
                    )}

                    {/* استحقاق الشهر الحالي */}
                    <div className="flex justify-between text-slate-400">
                      <span>📅 اشتراك الشهر الحالي:</span>
                      <span className="font-bold text-slate-200">{formatIQD(balance.remainingCurrentAmount)}</span>
                    </div>

                    {totalPaid > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>الواصل حتى الآن:</span>
                        <span className="font-semibold">{formatIQD(totalPaid)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 font-bold">
                      <span className={remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        {remaining > 0 ? 'إجمالي المطلوب للتسديد:' : 'الحساب خالص بالكامل:'}
                      </span>
                      <span className={`text-base font-black ${remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {remaining > 0 ? formatIQD(remaining) : '0 د.ع'}
                      </span>
                    </div>
                  </div>

                  {/* أزرار التحصيل الميداني السريع */}
                  <div className="pt-1 space-y-2">
                    {isPaid ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedLedgerSub(sub)}
                          className="flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-amber-500/30 font-bold py-2.5 px-2 rounded-xl text-xs transition cursor-pointer"
                          title="عرض سجل تسديدات المشترك الموثق بالتواريخ"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>سجل التسديد</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPaymentModal(sub)}
                          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-2 rounded-xl border border-slate-700 text-xs transition cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>سند جديد</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* زر القبض الكامل الفوري بلمسة واحدة */}
                        <button
                          onClick={() => handleQuickFullPayment(sub)}
                          disabled={isSubmitting}
                          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-2.5 px-3 rounded-2xl shadow-lg shadow-amber-500/20 text-xs sm:text-sm transition-all cursor-pointer"
                          title="قبض المبلغ المتبقي كاملاً فوراً"
                        >
                          <Zap className="w-4 h-4 fill-slate-950 stroke-[2.5]" />
                          <span>⚡ قبض كامل ({formatIQD(remaining)})</span>
                        </button>

                        <div className="grid grid-cols-3 gap-1.5 text-xs">
                          {/* زر سجل تسديدات المشترك الموثق بالتواريخ */}
                          <button
                            type="button"
                            onClick={() => setSelectedLedgerSub(sub)}
                            className="flex items-center justify-center gap-1 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-amber-500/30 font-bold py-2 px-1 rounded-xl transition cursor-pointer"
                            title="سجل حركات التسديد الموثقة بالتواريخ"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>السجل</span>
                          </button>

                          {/* زر تذكير واتساب بالدين */}
                          <button
                            type="button"
                            onClick={() => handleSendDebtReminder(sub)}
                            className="flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-1 rounded-xl transition cursor-pointer"
                            title="إرسال رسالة تذكير بالدين للمشترك عبر واتساب"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>واتساب</span>
                          </button>

                          {/* زر قبض جزئي أو مخصص */}
                          <button
                            type="button"
                            onClick={() => openPaymentModal(sub)}
                            className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold py-2 px-1 rounded-xl transition cursor-pointer"
                            title="دفع مبلغ جزئي أو مخصص"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>جزئي</span>
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

      {/* نافذة سجل تسديدات المشترك الموثق بالتواريخ والأوقات */}
      {selectedLedgerSub && (
        <SubscriberPaymentLedgerModal
          subscriber={selectedLedgerSub}
          onClose={() => setSelectedLedgerSub(null)}
          payments={payments.filter((p) => p.subscriberId === selectedLedgerSub.id)}
          invoices={invoices.filter((inv) => inv.subscriberId === selectedLedgerSub.id)}
          settings={settings}
        />
      )}

      {/* نافذة تعديل تسعيرة الأمبير المباشرة والسريعة */}
      {isPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                <h3 className="font-bold text-base text-white">
                  تحديد سعر الأمبير (شهر {latestCycle ? `${latestCycle.month} / ${latestCycle.year}` : `${new Date().getMonth() + 1} / ${new Date().getFullYear()}`})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPriceModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPricing} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  سعر الأمبير العادي (د.ع) *
                </label>
                <input
                  type="number"
                  step="500"
                  required
                  value={inputPriceNormal}
                  onChange={(e) => setInputPriceNormal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-base text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  placeholder="12000"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    سعر الخط الذهبي (24 ساعة)
                  </label>
                  <input
                    type="number"
                    step="500"
                    value={inputPriceGold}
                    onChange={(e) => setInputPriceGold(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                    placeholder="20000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    سعر الخط المسائي
                  </label>
                  <input
                    type="number"
                    step="500"
                    value={inputPriceNight}
                    onChange={(e) => setInputPriceNight(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                    placeholder="8000"
                  />
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-200/90 leading-relaxed">
                ⚡ بمجرد الضغط على حفظ، سيتم إعادة احتساب تكلفة الاشتراك وتحديث فواتير جميع المشتركين تلقائياً وبشكل فوري في شاشة الجباية.
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingPrice}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  {isSavingPrice ? 'جاري الاحتساب والتحديث...' : 'حفظ واحتساب الفواتير فوراً ⚡'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="px-4 py-2.5 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
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
