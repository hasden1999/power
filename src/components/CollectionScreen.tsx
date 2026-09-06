import { useState, useMemo, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatIQD, recordPayment } from '../services/billingService';
import { ThermalReceiptModal } from './ThermalReceiptModal';
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
  X
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


  // قائمة الشوارع الفريدة للفلتر
  const streetsList = useMemo(() => {
    const streets = new Set<string>();
    subscribers.forEach((s) => {
      if (s.street) streets.add(s.street.trim());
    });
    return Array.from(streets);
  }, [subscribers]);

  // ربط الفواتير بالمشتركين
  const invoiceMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => {
      // نأخذ آخر فاتورة للمشترك
      map.set(inv.subscriberId, inv);
    });
    return map;
  }, [invoices]);

  // إحصائيات التحصيل لليوم
  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todayPayments = payments.filter(
      (p) => new Date(p.paymentDate).toDateString() === today
    );

    const totalCollectedToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
    const uniquePaidSubscribersToday = new Set(todayPayments.map((p) => p.subscriberId)).size;

    const totalDueAll = invoices.reduce((sum, inv) => sum + inv.totalDue, 0);
    const totalPaidAll = invoices.reduce((sum, inv) => sum + inv.totalPaid, 0);
    const remainingUnpaidTotal = Math.max(0, totalDueAll - totalPaidAll);

    return {
      totalCollectedToday,
      uniquePaidSubscribersToday,
      remainingUnpaidTotal,
    };
  }, [payments, invoices]);

  // تصفية المشتركين بناءً على البحث والشارع وحالة الدفع
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const inv = invoiceMap.get(sub.id);
      const status = inv ? inv.status : 'unpaid';

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
  }, [subscribers, invoiceMap, searchTerm, selectedStreet, statusFilter]);

  // فتح نافذة الدفع السريع لمشترك
  const openPaymentModal = (sub: Subscriber) => {
    const inv = invoiceMap.get(sub.id);
    const due = inv ? Math.max(0, inv.totalDue - inv.totalPaid) : sub.openingBalance;
    setPayingSub({ sub, invoice: inv });
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
      const tenantId = settings?.id || 'tenant-01';

      const payment = await recordPayment({
        tenantId,
        subscriberId: payingSub.sub.id,
        invoiceId: payingSub.invoice?.id,
        amount: amountNum,
        collectorName: collectorName || 'صاحب المولدة',
        notes: paymentNote || undefined,
      });

      // حساب المتبقي للوصل
      const currentDue = payingSub.invoice
        ? Math.max(0, payingSub.invoice.totalDue - (payingSub.invoice.totalPaid + amountNum))
        : 0;

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
    const inv = invoiceMap.get(sub.id);
    const due = inv ? Math.max(0, inv.totalDue - inv.totalPaid) : sub.openingBalance;
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

      onRefreshSync();

      // فتح نافذة الوصل مباشرة
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
    const inv = invoiceMap.get(sub.id);
    const due = inv ? Math.max(0, inv.totalDue - inv.totalPaid) : sub.openingBalance;
    const currentAmount = inv ? inv.currentAmount : 0;
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
      
      {/* 1. لوحة المؤشرات المالية اليومية (سريعة وواضحة للجابي) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-medium text-slate-400">مقبوضات اليوم (نقداً)</span>
            <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
              {formatIQD(todayStats.totalCollectedToday)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-medium text-slate-400">المسددين اليوم</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 flex items-baseline gap-1.5">
              <span>{todayStats.uniquePaidSubscribersToday}</span>
              <span className="text-xs font-normal text-slate-400">مشترك</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-medium text-slate-400">المتبقي بذمة المشتركين</span>
            <div className="text-xl sm:text-2xl font-black text-rose-400 mt-1">
              {formatIQD(todayStats.remainingUnpaidTotal)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <TrendingUp className="w-6 h-6" />
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
          <span>ترتيب القواطع والأزقة</span>
        </div>

        {filteredSubscribers.length === 0 ? (
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <p className="text-base font-semibold text-slate-300">لم يتم العثور على أي مشترك مطابق</p>
            <p className="text-xs text-slate-500 mt-1">تأكد من كتابة الاسم أو رقم القاطع بدقة أو قم بتغيير الفلتر</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSubscribers.map((sub) => {
              const inv = invoiceMap.get(sub.id);
              const totalDue = inv ? inv.totalDue : sub.openingBalance;
              const totalPaid = inv ? inv.totalPaid : 0;
              const remaining = Math.max(0, totalDue - totalPaid);
              const isPaid = remaining === 0;
              const isPartial = totalPaid > 0 && remaining > 0;

              return (
                <div
                  key={sub.id}
                  className={`bg-slate-800/90 border rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between gap-3 shadow-md hover:border-slate-600 ${
                    isPaid
                      ? 'border-emerald-500/30 hover:border-emerald-500/60'
                      : isPartial
                      ? 'border-amber-500/40 hover:border-amber-500/70'
                      : 'border-rose-500/40 hover:border-rose-500/70'
                  }`}
                >
                  {/* الرأس: الاسم ورقم القاطع */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base text-white hover:text-amber-400 cursor-pointer">
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
                    <div className="text-left bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-700/80">
                      <div className="text-xs font-black text-amber-400 tracking-wider">
                        {sub.breakerNumber}
                      </div>
                      <div className="text-[11px] text-slate-300 font-medium">
                        {sub.amperes} أمبير
                      </div>
                    </div>
                  </div>

                  {/* التفاصيل المالية */}
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-xs space-y-1.5">
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
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-bold">
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

      {/* نافذة تسجيل الدفعة السريعة (Quick Payment Modal) */}
      {payingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white">تسجيل سند قبض جديد</h3>
                <p className="text-xs text-amber-400 mt-0.5">{payingSub.sub.fullName} ({payingSub.sub.breakerNumber})</p>
              </div>
              <button
                onClick={() => setPayingSub(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                إلغاء
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* إجمالي المستحق للتذكير */}
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-xs flex justify-between items-center">
                <span className="text-slate-400">إجمالي المبلغ المطلوب:</span>
                <span className="text-base font-black text-amber-400">
                  {payingSub.invoice
                    ? formatIQD(payingSub.invoice.totalDue - payingSub.invoice.totalPaid)
                    : formatIQD(payingSub.sub.openingBalance)}
                </span>
              </div>

              {/* حقل إدخال المبلغ */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  المبلغ المستلم (دينار عراقي) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1000"
                    autoFocus
                    placeholder="مثال: 50000"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-lg font-black text-emerald-400 focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute left-3 top-3 text-xs text-slate-500 font-bold">د.ع</span>
                </div>
              </div>

              {/* اسم المحصل */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم المستلم / الجابي
                </label>
                <input
                  type="text"
                  value={collectorName}
                  onChange={(e) => setCollectorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* ملاحظات */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ملاحظة على السند (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: واصل من حسابه، سدد عند البيت..."
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex gap-2">
              <button
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-600/20 text-sm transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'جاري الحفظ...' : 'تأكيد وقبض المبلغ'}
              </button>
              <button
                onClick={() => setPayingSub(null)}
                className="px-4 py-2.5 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                تراجع
              </button>
            </div>

          </div>
        </div>
      )}

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
