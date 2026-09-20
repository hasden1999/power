import { useState, type FC } from 'react';
import type { Subscriber, Payment, Invoice, TenantSettings } from '../types';
import { formatIQD, updatePayment, deletePayment } from '../services/billingService';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import {
  X,
  Printer,
  MessageSquare,
  History,
  Share2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Clock,
  Pencil,
  Trash2,
  Save
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

    try {
      setIsSavingEdit(true);
      await updatePayment({
        paymentId: editingPayment.id,
        newAmount: amt,
        collectorName: editCollector,
        notes: editNotes,
      });
      setEditingPayment(null);
      alert('تم تعديل السند وإعادة احتساب الفاتورة والرصيد بنجاح! ⚡');
    } catch (err: any) {
      console.error('خطأ في تعديل السند:', err);
      alert(err.message || 'حدث خطأ أثناء حفظ تعديل السند');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeletePayment = async (p: Payment) => {
    const confirmMsg = `هل أنت متأكد من إلغاء وحذف السند رقم (${p.receiptNumber || p.id}) بمبلغ ${formatIQD(p.amount)}؟\nسيتم استرجاع رصيد الفاتورة وإضافة المبلغ إلى المتبقي بذمة المشترك فوراً.`;
    if (!confirm(confirmMsg)) return;

    try {
      await deletePayment({
        paymentId: p.id,
        reason: 'إلغاء سند مسجل بالخطأ من كشف الحساب',
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

  // تنسيق التاريخ والوقت العراقي بالكامل
  const formatFullDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-IQ', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
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
      alert(err.message || 'تعذرت الطباعة عبر البلوتوث. تأكد من تشغيل الطابعة واقترانها.');
    } finally {
      setPrintingPaymentId(null);
    }
  };

  // إرسال تفاصيل السند عبر واتساب
  const handleShareReceiptWhatsApp = (payment: Payment) => {
    const generatorName = settings?.generatorName || 'المولدة الأهلية';
    const cleanPhone = (subscriber.phone || '').replace(/[^0-9]/g, '');
    let targetPhone = cleanPhone;
    if (targetPhone.startsWith('07')) {
      targetPhone = '964' + targetPhone.substring(1);
    }

    const dateStr = formatFullDateTime(payment.paymentDate);
    const message =
      `📄 *سند قبض رسمي - ${generatorName}*\n` +
      `-----------------------------\n` +
      `👤 *المشترك:* ${subscriber.fullName}\n` +
      `⚡ *القاطع:* ${subscriber.breakerNumber} (${subscriber.amperes} أمبير)\n` +
      `🧾 *رقم الوصل:* ${payment.receiptNumber || 'بدون رقم'}\n` +
      `📅 *التاريخ والوقت:* ${dateStr}\n` +
      `💵 *المبلغ المقبوض:* ${formatIQD(payment.amount)}\n` +
      `👤 *المحصل / المستلم:* ${payment.collectorName || 'إدارة المولدة'}\n` +
      (payment.notes ? `📝 *ملاحظة:* ${payment.notes}\n` : '') +
      `💰 *المتبقي بذمتكم حالياً:* ${formatIQD(remaining)}\n` +
      `-----------------------------\n` +
      `شكراً لالتزامكم بالسداد في الوقت المحدد. 🌹`;

    const url = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // إرسال كشف حساب كامل لكافة التسديدات والديون عبر واتساب
  const handleShareFullStatementWhatsApp = () => {
    const generatorName = settings?.generatorName || 'المولدة الأهلية';
    const cleanPhone = (subscriber.phone || '').replace(/[^0-9]/g, '');
    let targetPhone = cleanPhone;
    if (targetPhone.startsWith('07')) {
      targetPhone = '964' + targetPhone.substring(1);
    }

    let paymentsText = '';
    if (sortedPayments.length === 0) {
      paymentsText = 'لا توجد دفعات مسجلة سابقاً.\n';
    } else {
      sortedPayments.forEach((p, idx) => {
        const d = new Date(p.paymentDate).toLocaleDateString('ar-IQ', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        });
        paymentsText += `${idx + 1}. ${d} | واصل: ${formatIQD(p.amount)} (وصل #${p.receiptNumber || '-'}) بواسطة: ${p.collectorName}\n`;
      });
    }

    const message =
      `📋 *كشف حساب واشتراكات موثق بالتواريخ*\n` +
      `🏛️ *${generatorName}*\n` +
      `-----------------------------\n` +
      `👤 *المشترك:* ${subscriber.fullName}\n` +
      `⚡ *الاشتراك:* ${subscriber.amperes} أمبير | قاطع: ${subscriber.breakerNumber}\n` +
      `📍 *العنوان:* ${subscriber.street || 'غير محدد'}\n` +
      `-----------------------------\n` +
      `📊 *الملخص المالي العام:*\n` +
      `• إجمالي المفوتر تاريخياً: ${formatIQD(totalBilled)}\n` +
      `• إجمالي المسدد الفعلي: ${formatIQD(totalPaid)}\n` +
      `• 🔴 *المتبقي بذمتكم الآن:* ${formatIQD(remaining)}\n` +
      `-----------------------------\n` +
      `📜 *سجل عمليات التسديد السابقة:*\n` +
      `${paymentsText}\n` +
      `-----------------------------\n` +
      `تاريخ إصدار الكشف: ${new Date().toLocaleDateString('ar-IQ')}\n` +
      `هذا الكشف صادر آلياً من منظومة إدارة المولدات.`;

    const url = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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

          {/* زر مشاركة كشف الحساب الكامل عبر واتساب */}
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-white block">مشاركة كشف الحساب والتواريخ</span>
                <span className="text-[11px] text-slate-400">إرسال تقرير شامل بالدفعات للمشترك عبر واتساب</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleShareFullStatementWhatsApp}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex-shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>مشاركة واتساب</span>
            </button>
          </div>

          {/* 2. جدول وسجل عمليات التسديد الموثقة بالتواريخ */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-xs sm:text-sm text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>حركات التسديد المسجلة ({sortedPayments.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400">مرتبة من الأحدث للأقدم</span>
            </div>

            {sortedPayments.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-bold text-slate-300">لا توجد عمليات تسديد مسجلة لهذا المشترك حتى الآن</p>
                <p className="text-xs text-slate-500">سيتم توثيق كل سند قبض جديد باليوم والتاريخ والساعة فور تسجيله</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedPayments.map((p, index) => (
                  <div
                    key={p.id}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 sm:p-4 transition-all shadow-md space-y-3"
                  >
                    {/* السطر العلوي: المبلغ ورقم الوصل وشارة الحالة */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-black">
                          #{sortedPayments.length - index}
                        </div>
                        <div>
                          <span className="text-base sm:text-lg font-black text-emerald-400 block tracking-tight">
                            {formatIQD(p.amount)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            وصل رقم: <strong className="text-amber-400">{p.receiptNumber || 'بدون رقم'}</strong>
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>واصل وموثق</span>
                      </span>
                    </div>

                    {/* تفاصيل التوثيق الزمني واسم الجابي */}
                    <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800/80 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="font-bold text-white">{formatFullDateTime(p.paymentDate)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        <User className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span>الجابي / المستلم: <strong className="text-slate-200">{p.collectorName || 'صاحب المولدة'}</strong></span>
                      </div>

                      {p.notes && (
                        <div className="text-[11px] text-amber-300/90 pt-1 border-t border-slate-800">
                          📝 ملاحظة: {p.notes}
                        </div>
                      )}
                    </div>

                    {/* إجراءات سريعة على السند: تعديل السند، إعادة الطباعة الحرارية والمشاركة عبر واتساب */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {/* زر تعديل السند عند حدوث خطأ */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(p)}
                          className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                          title="تعديل مبلغ أو تفاصيل السند إذا حدث خطأ أثناء القبض"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>

                        {/* زر حذف أو إلغاء السند المسجل بالخطأ */}
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p)}
                          className="flex items-center gap-1 bg-slate-900 hover:bg-rose-950/60 text-rose-400 border border-slate-800 hover:border-rose-500/40 p-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                          title="إلغاء هذا السند وإعادة المبلغ لذمة المشترك"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleShareReceiptWhatsApp(p)}
                          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                          title="مشاركة تفاصيل هذا الوصل عبر واتساب"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>سند واتساب</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintSingleReceipt(p)}
                          disabled={printingPaymentId === p.id}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black shadow-md shadow-amber-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          title="إعادة طباعة الوصل الحراري"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{printingPaymentId === p.id ? 'جاري الطباعة...' : 'طباعة الوصل'}</span>
                        </button>
                      </div>
                    </div>

                  </div>
                ))}
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
