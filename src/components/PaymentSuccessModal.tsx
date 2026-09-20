import { useState, type FC } from 'react';
import {
  CheckCircle2,
  Printer,
  MessageCircle,
  X,
  Bluetooth,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatIQD } from '../services/billingService';
import { buildWhatsAppLink } from '../services/receiptService';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import type { Subscriber, Payment, TenantSettings } from '../types';

interface PaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriber: Subscriber;
  payment: Payment;
  remainingDebt: number;
  settings?: TenantSettings;
}

export const PaymentSuccessModal: FC<PaymentSuccessModalProps> = ({
  isOpen,
  onClose,
  subscriber,
  payment,
  remainingDebt,
  settings,
}) => {
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);

  if (!isOpen) return null;

  const whatsappUrl = buildWhatsAppLink(subscriber, payment, remainingDebt, settings);
  const generatorName = settings?.generatorName || 'إدارة المولدة الأهلية';
  const ownerPhone = settings?.phone || '07700000000';

  const dateFormatted = new Date(payment.paymentDate).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // طباعة المتصفح القياسية (لأي طابعة USB أو شبكة أو AirPrint أو حفظ PDF)
  const handlePrint = () => {
    window.print();
  };

  // الطباعة المباشرة عبر البلوتوث (ESC/POS)
  const handleBluetoothPrint = async () => {
    try {
      setIsBluetoothPrinting(true);
      setPrintError(null);
      setPrintStatus('جاري الاتصال بالطابعة الحرارية...');

      await bluetoothPrinter.printReceipt(subscriber, payment, remainingDebt, settings);
      setPrintStatus('تم إرسال أمر الطباعة بنجاح!');
      setTimeout(() => setPrintStatus(null), 3500);
    } catch (err: any) {
      console.error('خطأ طباعة البلوتوث:', err);
      setPrintError(
        err.message || 'تعذر الاتصال بالطابعة عبر البلوتوث. يمكنك استخدام زر طباعة النظام.'
      );
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  const handleWhatsApp = () => {
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* شريط الإغلاق العلوي */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-800/80 bg-slate-950/70">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>توثيق عملية جباية</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="إغلاق ومتابعة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* محتوى الشاشة القابل للتمرير */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* رأسية النجاح والتأكيد */}
          <div className="text-center space-y-2 py-1">
            <div className="w-16 h-16 bg-emerald-500/15 border-2 border-emerald-500/40 rounded-3xl mx-auto flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                تم قبض <span className="text-emerald-400 font-mono">{formatIQD(payment.amount)}</span>
              </h2>
              <p className="text-sm font-bold text-slate-300 mt-1">
                من المشترك: <span className="text-amber-300 font-black">{subscriber.fullName}</span>
              </p>
              <div className="inline-flex items-center gap-1.5 mt-2 bg-slate-800/80 border border-slate-700/60 text-slate-300 px-3 py-1 rounded-full text-xs font-mono">
                <span>سند رقم: #{payment.receiptNumber}</span>
                <span>•</span>
                <span>{dateFormatted}</span>
              </div>
            </div>
          </div>

          {/* إشعارات وأخطاء الطباعة إن حدثت */}
          {printStatus && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{printStatus}</span>
            </div>
          )}
          {printError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-2.5 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{printError}</span>
            </div>
          )}

          {/* بطاقة التفاصيل الشاملة للعملية */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow-inner text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">المبلغ المستلم:</span>
              <span className="text-base font-black text-emerald-400 font-mono">{formatIQD(payment.amount)}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">المتبقي بذمته:</span>
              <span className={`font-bold font-mono text-xs ${remainingDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص بالكامل ✨)'}
              </span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">القاطع والأمبيرات:</span>
              <span className="font-bold text-white">قاطع {subscriber.breakerNumber} ({subscriber.amperes} أمبير)</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">العنوان والشارع:</span>
              <span className="font-medium text-slate-200">{subscriber.street}</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-slate-400">المحصل / المستلم:</span>
              <span className="font-semibold text-slate-300">{payment.collectorName}</span>
            </div>

            {payment.notes && (
              <div className="pt-1 text-slate-400">
                <span className="text-slate-500 block text-[11px]">الملاحظات:</span>
                <span className="font-medium text-amber-200/90">{payment.notes}</span>
              </div>
            )}
          </div>

          {/* قسم الخيارات الإضافية (الطباعة والواتساب كخيار اختياري) */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-bold text-slate-400 px-1 flex items-center justify-between">
              <span>خيارات إضافية (اختيارية):</span>
              <button
                type="button"
                onClick={() => setShowReceiptPreview(!showReceiptPreview)}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showReceiptPreview ? 'إخفاء ورقة الوصل' : 'معاينة ورقة الوصل'}</span>
                {showReceiptPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* زر طباعة الوصل (اختياري) */}
              <button
                type="button"
                onClick={() => setShowPrintOptions(!showPrintOptions)}
                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-amber-300 font-bold py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>طباعة الوصل</span>
                {showPrintOptions ? <ChevronUp className="w-3.5 h-3.5 mr-auto text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 mr-auto text-slate-400" />}
              </button>

              {/* زر إرسال الواتساب (اختياري) */}
              <button
                type="button"
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 active:scale-95 border border-emerald-700/60 text-emerald-300 font-bold py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>إرسال واتساب</span>
              </button>
            </div>

            {/* خيارات الطباعة المنسدلة عند طلبها */}
            {showPrintOptions && (
              <div className="bg-slate-950 border border-amber-500/30 p-3 rounded-2xl space-y-2 animate-in fade-in slide-in-from-top-1">
                <p className="text-[11px] text-slate-400">اختر طريقة الطباعة المطلوبة:</p>
                <div className="grid grid-cols-2 gap-2">
                  {bluetoothPrinter.isSupported() && (
                    <button
                      type="button"
                      onClick={handleBluetoothPrint}
                      disabled={isBluetoothPrinting}
                      className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Bluetooth className={`w-3.5 h-3.5 ${isBluetoothPrinting ? 'animate-bounce' : ''}`} />
                      <span>{isBluetoothPrinting ? 'جاري الإرسال...' : 'طابعة بلوتوث'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-3 rounded-xl border border-slate-700 text-xs transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>طباعة النظام / PDF</span>
                  </button>
                </div>
              </div>
            )}

            {/* معاينة ورقة الوصل الحراري إن طلبها المستخدم */}
            {showReceiptPreview && (
              <div
                id="thermal-receipt"
                className="bg-white text-slate-900 p-4 rounded-xl border border-slate-300 shadow-inner font-mono text-xs leading-relaxed mt-2 animate-in fade-in"
              >
                <div className="text-center pb-2 border-b-2 border-dashed border-slate-300">
                  <h4 className="font-extrabold text-sm text-slate-950">{generatorName}</h4>
                  <p className="text-[10px] text-slate-600 font-sans">هاتف الشكاوى: {ownerPhone}</p>
                  <div className="mt-1 inline-block bg-slate-100 text-slate-800 font-bold px-2.5 py-0.5 rounded text-[11px]">
                    وصل قبض كهرباء أهلية
                  </div>
                </div>

                <div className="py-2.5 space-y-1 text-[11px] border-b-2 border-dashed border-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">رقم السند:</span>
                    <span className="font-bold">{payment.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">التاريخ:</span>
                    <span>{dateFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">المشترك:</span>
                    <span className="font-bold text-slate-900">{subscriber.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">العنوان:</span>
                    <span>{subscriber.street}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">القاطع:</span>
                    <span className="font-bold bg-slate-100 px-1 rounded">{subscriber.breakerNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">الأمبيرات:</span>
                    <span className="font-bold">{subscriber.amperes} أمبير</span>
                  </div>
                </div>

                <div className="py-2.5 space-y-1.5 border-b-2 border-dashed border-slate-300">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold font-sans">المبلغ المقبوض:</span>
                    <span className="font-black text-emerald-700 text-sm">{formatIQD(payment.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-600 font-sans">المتبقي بذمته:</span>
                    <span className={`font-bold ${remainingDebt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)'}
                    </span>
                  </div>
                  {payment.notes && (
                    <div className="text-[10px] text-slate-500 pt-0.5 font-sans">
                      ملاحظة: {payment.notes}
                    </div>
                  )}
                </div>

                <div className="pt-2 text-center text-[10px] text-slate-500 font-sans">
                  <p>المحصل: {payment.collectorName}</p>
                  <p className="font-semibold text-slate-700 mt-0.5">شكراً لالتزامكم بالتسديد شهرياً</p>
                </div>
              </div>
            )}

            {/* عنصر غير مرئي في الصفحة لكن متاح لأمر window.print() في حال عدم فتح المعاينة */}
            {!showReceiptPreview && (
              <div id="thermal-receipt" className="hidden">
                <div className="text-center pb-2">
                  <h4>{generatorName}</h4>
                  <p>هاتف: {ownerPhone}</p>
                  <p>وصل قبض كهرباء أهلية</p>
                </div>
                <div>
                  <p>رقم السند: {payment.receiptNumber}</p>
                  <p>التاريخ: {dateFormatted}</p>
                  <p>المشترك: {subscriber.fullName}</p>
                  <p>العنوان: {subscriber.street}</p>
                  <p>القاطع: {subscriber.breakerNumber} ({subscriber.amperes}A)</p>
                  <p>المبلغ المقبوض: {formatIQD(payment.amount)}</p>
                  <p>المتبقي: {remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)'}</p>
                  <p>المحصل: {payment.collectorName}</p>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* شريط الإجراء الرئيسي في الأسفل: زر متابعة الجباية السريع */}
        <div className="p-3.5 bg-slate-950/95 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-emerald-600/20 text-sm transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>متابعة الجباية (تم)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
