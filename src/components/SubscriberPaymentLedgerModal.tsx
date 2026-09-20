import { useState, type FC } from 'react';
import type { Subscriber, Payment, Invoice, TenantSettings } from '../types';
import {
  formatIQD,
  updatePayment,
  deletePayment,
  isPaymentFromToday,
} from '../services/billingService';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import {
  X,
  Printer,
  History,
  Calendar,
  AlertCircle,
  User,
  Clock,
  Pencil,
  Trash2,
  Save,
  Lock,
} from 'lucide-react';

interface SubscriberPaymentLedgerModalProps {
  subscriber: Subscriber;
  onClose: () => void;
  payments: Payment[];
  invoices: Invoice[];
  settings?: TenantSettings;
}

export const SubscriberPaymentLedgerModal: FC<SubscriberPaymentLedgerModalProps> = ({
  subscriber,
  onClose,
  payments,
  invoices,
  settings,
}) => {
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(null);

  // حالة تعديل السند عند حدوث خطأ
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editCollector, setEditCollector] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleStartEdit = (p: Payment) => {
    if (!isPaymentFromToday(p.paymentDate)) {
      alert('لا يمكن تعديل هذا السند لأنه صادر في يوم سابق. التعديل مسموح فقط في نفس يوم استلام الجباية.');
      return;
    }
    setEditingPayment(p);
    setEditAmount(p.amount.toString());
    setEditCollector(p.collectorName || '');
    setEditNotes(p.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editingPayment) return;
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('يرجى كتابة مبلغ صحيح أكبر من الصفر');
      return;
    }
    const targetInvoice = editingPayment.invoiceId ? invoices.find((inv) => inv.id === editingPayment.invoiceId) : null;
    const maxAllowed = targetInvoice
      ? (targetInvoice.totalDue - (targetInvoice.totalPaid || 0)) + editingPayment.amount
      : undefined;

    if (maxAllowed !== undefined && amt > maxAllowed) {
      alert(`🚫 مرفوض: المبلغ الجديد (${formatIQD(amt)}) يتجاوز الذمة المطلوبة للفاتورة (${formatIQD(maxAllowed)}).\nلا يمكن تسديد أكثر من المطلوب.`);
      return;
    }

    try {
      setIsSavingEdit(true);
      await updatePayment({
        paymentId: editingPayment.id,
        newAmount: amt,
        collectorName: editCollector,
        notes: editNotes,
      });
      setEditingPayment(null);
      alert('تم تعديل السند وإعادة احتساب الرصيد بنجاح! ⚡');
    } catch (err: any) {
      console.error('خطأ في تعديل السند:', err);
      alert(err.message || 'حدث خطأ أثناء حفظ تعديل السند');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePayment = async (p: Payment) => {
    if (!isPaymentFromToday(p.paymentDate)) {
      alert('لا يمكن إلغاء السندات السابقة. الإلغاء مسموح فقط في نفس يوم استلام الجباية.');
      return;
    }

    const confirmMsg = `هل أنت متأكد من إلغاء وحذف السند رقم (#${p.receiptNumber || p.id}) بمبلغ ${formatIQD(p.amount)}؟\nسيتم استرجاع المبلغ إلى المتبقي بذمة المشترك فوراً.`;
    if (!confirm(confirmMsg)) return;

    try {
      await deletePayment({
        paymentId: p.id,
        reason: 'إلغاء سند مسجل بالخطأ في نفس اليوم',
      });
      alert('تم إلغاء السند وتحديث الرصيد فوراً.');
    } catch (err: any) {
      console.error('خطأ في حذف السند:', err);
      alert(err.message || 'حدث خطأ أثناء إلغاء السند');
    }
  };

  // فرز الدفعات من الأحدث إلى الأقدم زمنياً
  const sortedPayments = [...payments].sort((a, b) => {
    return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime();
  });

  // الحسابات المالية الإجمالية
  const totalBilled =
    invoices.length > 0
      ? invoices.reduce((sum, inv) => sum + inv.currentAmount, 0) +
        (subscriber.openingBalance || 0) -
        invoices.reduce((sum, inv) => sum + (inv.discount || 0), 0)
      : subscriber.openingBalance || 0;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalBilled - totalPaid);

  // تنسيق التاريخ والوقت بصيغة مبسطة ومريحة للقراءة
  const formatFullDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const datePart = d.toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      const timePart = d.toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return `${datePart} - ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  // طباعة حرارية فورية لسند معين
  const handlePrintSingleReceipt = async (payment: Payment) => {
    try {
      setPrintingPaymentId(payment.id);
      await bluetoothPrinter.printReceipt(subscriber, payment, remaining, settings);
    } catch (err: any) {
      console.error('خطأ في الطباعة الحرارية:', err);
      alert(err.message || 'تعذرت الطباعة عبر البلوتوث.');
    } finally {
      setPrintingPaymentId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* رأس النافذة الأنيق */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">سجل تسديدات المشترك</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  موثق بالتواريخ
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 font-bold mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-amber-400">{subscriber.fullName}</span>
                <span className="text-slate-500">•</span>
                <span>قاطع: {subscriber.breakerNumber}</span>
                <span className="text-slate-500">•</span>
                <span>{subscriber.amperes} أمبير</span>
                {subscriber.street && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">{subscriber.street}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* جسم النافذة القابل للتمرير */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* 1. ملخص الحساب المالي المزدوج */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 text-center">
              <span className="text-[11px] font-medium text-slate-400 block mb-0.5">إجمالي المطلوب</span>
              <span className="font-black text-sm sm:text-base text-slate-200 block truncate">
                {formatIQD(totalBilled)}
              </span>
            </div>

            <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-3 text-center">
              <span className="text-[11px] font-medium text-emerald-400/90 block mb-0.5">إجمالي الواصل</span>
              <span className="font-black text-sm sm:text-base text-emerald-400 block truncate">
                {formatIQD(totalPaid)}
              </span>
            </div>

            <div
              className={`bg-slate-950/80 border rounded-2xl p-3 text-center ${
                remaining > 0 ? 'border-rose-500/40' : 'border-emerald-500/30'
              }`}
            >
              <span
                className={`text-[11px] font-medium block mb-0.5 ${
                  remaining > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {remaining > 0 ? 'المتبقي للتسديد' : 'الحساب خالص'}
              </span>
              <span
                className={`font-black text-sm sm:text-base block truncate ${
                  remaining > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatIQD(remaining)}
              </span>
            </div>
          </div>

          {/* جدول وسجل عمليات التسديد المباشرة */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-xs sm:text-sm text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>حركات التسديد المسجلة ({sortedPayments.length})</span>
              </h4>
              <span className="text-[11px] text-slate-500">التعديل متاح فقط لسندات اليوم</span>
            </div>

            {sortedPayments.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-bold text-slate-300">لا توجد عمليات تسديد مسجلة لهذا المشترك حتى الآن</p>
                <p className="text-xs text-slate-500">سيتم توثيق كل سند قبض جديد باليوم والتاريخ والساعة فور تسجيله</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedPayments.map((p, index) => {
                  const fromToday = isPaymentFromToday(p.paymentDate);

                  return (
                    <div
                      key={p.id}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 transition-all shadow-md space-y-2.5"
                    >
                      {/* السطر العلوي: المبلغ ورقم الوصل وحالة السند */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                            وصل #{p.receiptNumber || sortedPayments.length - index}
                          </span>
                          <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span>{formatFullDateTime(p.paymentDate)}</span>
                          </span>
                        </div>

                        <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                          {formatIQD(p.amount)}
                        </span>
                      </div>

                      {/* تفاصيل المستلم والملاحظة */}
                      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-900 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span>المستلم: <strong className="text-slate-300">{p.collectorName || 'صاحب المولدة'}</strong></span>
                          {p.notes && <span className="text-amber-300/90 truncate">• {p.notes}</span>}
                        </div>

                        {/* الإجراءات: تعديل وإلغاء متاح فقط لسند اليوم، والسندات السابقة مقفلة */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {fromToday ? (
                            <>
                              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-bold">
                                اليوم
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                                title="تعديل هذا السند (متاح في نفس يوم الجباية فقط)"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeletePayment(p)}
                                className="flex items-center gap-1 bg-slate-900 hover:bg-rose-950/60 text-rose-400 border border-slate-800 hover:border-rose-500/40 p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                                title="إلغاء هذا السند (متاح في نفس يوم الجباية فقط)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-900 border border-slate-800/80 px-2.5 py-1 rounded-xl font-bold" title="السندات الصادرة في أيام سابقة مقفلة ولا يمكن تعديلها">
                              <Lock className="w-3 h-3 text-slate-500" />
                              <span>معتمد (سابق)</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handlePrintSingleReceipt(p)}
                            disabled={printingPaymentId === p.id}
                            className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="إعادة طباعة الوصل الحراري"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* تذييل النافذة */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            <span>عدد العمليات المسجلة: </span>
            <strong className="text-white">{sortedPayments.length}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* نافذة تعديل السند وتصحيح الخطأ */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl space-y-4 p-4 text-right">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-amber-400">
                <Pencil className="w-4 h-4" />
                <h4 className="font-bold text-sm text-white">
                  تعديل السند #{editingPayment.receiptNumber || editingPayment.id}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  المبلغ الجديد (د.ع) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pr-3 pl-12 py-2.5 text-base font-black text-emerald-400 focus:outline-none transition"
                    autoFocus
                  />
                  <span className="absolute left-3 top-3 text-[11px] text-slate-500 font-black">د.ع</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  المبلغ السابق المسجل: {formatIQD(editingPayment.amount)}
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">اسم الجابي / المستلم</label>
                <input
                  type="text"
                  value={editCollector}
                  onChange={(e) => setEditCollector(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ملاحظة التعديل (اختياري)</label>
                <input
                  type="text"
                  placeholder="سبب التعديل: تصحيح خطأ في المبلغ..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 px-4 py-2 rounded-xl text-xs font-black shadow-md shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingEdit ? 'جاري الحفظ...' : 'حفظ التعديل والاحتساب'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
