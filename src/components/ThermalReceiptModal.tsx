import { useState, type FC } from 'react';
import { Printer, MessageCircle, X, CheckCircle2, Bluetooth, AlertCircle } from 'lucide-react';
import { formatIQD } from '../services/billingService';
import { buildWhatsAppLink } from '../services/receiptService';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import type { Subscriber, Payment, TenantSettings } from '../types';

interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriber: Subscriber;
  payment: Payment;
  remainingDebt: number;
  settings?: TenantSettings;
}

export const ThermalReceiptModal: FC<ThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  subscriber,
  payment,
  remainingDebt,
  settings,
}) => {
  if (!isOpen) return null;

  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const whatsappUrl = buildWhatsAppLink(subscriber, payment, remainingDebt, settings);

  // طباعة المتصفح القياسية (لأي طابعة USB أو شبكة أو بلوتوث معرفة)
  const handlePrint = () => {
    window.print();
  };

  // الطباعة المباشرة عبر البلوتوث (ESC/POS)
  const handleBluetoothPrint = async () => {
    try {
      setIsBluetoothPrinting(true);
      setPrintError(null);
      setPrintStatus('جاري الاتصال بالطابعة الحرارية عبر البلوتوث...');

      await bluetoothPrinter.printReceipt(subscriber, payment, remainingDebt, settings);
      setPrintStatus('تم إرسال أمر الطباعة إلى الطابعة الحرارية بنجاح!');
      setTimeout(() => setPrintStatus(null), 3500);
    } catch (err: any) {
      console.error('خطأ طباعة البلوتوث:', err);
      setPrintError(
        err.message || 'تعذر الاتصال بالطابعة عبر البلوتوث. يمكنك استخدام زر الطباعة العادي.'
      );
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  const handleWhatsApp = () => {
    window.open(whatsappUrl, '_blank');
  };

  const generatorName = settings?.generatorName || 'إدارة المولدة الأهلية';
  const ownerPhone = settings?.phone || '07700000000';
  const dateFormatted = new Date(payment.paymentDate).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* شريط العنوان العلوي */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">سند قبض جاهز للطباعة</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* إشعارات البلوتوث والطباعة */}
        {printStatus && (
          <div className="mx-4 mt-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{printStatus}</span>
          </div>
        )}

        {printError && (
          <div className="mx-4 mt-3 bg-rose-500/15 border border-rose-500/40 text-rose-300 p-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{printError}</span>
          </div>
        )}

        {/* عرض الوصل الحراري - مخصص للعرض ومطابق لما يطبع في الطابعة 58mm/80mm */}
        <div className="p-4 overflow-y-auto flex-1">
          <div
            id="thermal-receipt"
            className="bg-white text-slate-900 p-5 rounded-lg border border-slate-200 shadow-inner font-mono text-sm leading-relaxed"
          >
            <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
              <h4 className="font-extrabold text-base text-slate-950">{generatorName}</h4>
              <p className="text-xs text-slate-600 mt-0.5 font-sans">هاتف الشكاوى: {ownerPhone}</p>
              <div className="mt-1.5 inline-block bg-slate-100 text-slate-800 font-bold px-3 py-0.5 rounded text-xs">
                وصل قبض كهرباء أهلية
              </div>
            </div>

            <div className="py-3 space-y-1.5 text-xs border-b-2 border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">رقم السند:</span>
                <span className="font-bold">{payment.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">التاريخ والوقت:</span>
                <span>{dateFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">اسم المشترك:</span>
                <span className="font-bold text-slate-900">{subscriber.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">العنوان:</span>
                <span>{subscriber.street}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">رقم القاطع:</span>
                <span className="font-bold bg-slate-100 px-1 rounded">{subscriber.breakerNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">عدد الأمبيرات:</span>
                <span className="font-bold">{subscriber.amperes} أمبير</span>
              </div>
            </div>

            {/* الحساب المالي */}
            <div className="py-3 space-y-2 border-b-2 border-dashed border-slate-300">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold font-sans">المبلغ المدفوع:</span>
                <span className="font-black text-emerald-700 text-base">{formatIQD(payment.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-sans">المتبقي بذمته:</span>
                <span className={`font-bold ${remainingDebt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)'}
                </span>
              </div>
              {payment.notes && (
                <div className="text-xs text-slate-500 pt-1 font-sans">
                  ملاحظة: {payment.notes}
                </div>
              )}
            </div>

            <div className="pt-3 text-center text-[11px] text-slate-500 font-sans space-y-1">
              <p>المحصل: {payment.collectorName}</p>
              <p className="font-semibold text-slate-700">شكراً لالتزامكم بالتسديد شهرياً</p>
            </div>
          </div>
        </div>

        {/* أزرار العمليات السريعة للطباعة والواتساب */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 space-y-2">
          
          {/* خيارات الطباعة المباشرة */}
          <div className="grid grid-cols-2 gap-2">
            
            {/* زر طباعة البلوتوث المباشرة */}
            <button
              onClick={handleBluetoothPrint}
              disabled={isBluetoothPrinting}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-blue-600/20 text-xs transition-all cursor-pointer"
              title="الاتصال المباشر بطابعة البلوتوث المحمولة والطباعة الفورية"
            >
              <Bluetooth className={`w-4 h-4 ${isBluetoothPrinting ? 'animate-bounce' : ''}`} />
              <span>{isBluetoothPrinting ? 'جاري الإرسال...' : 'طباعة بلوتوث فورية'}</span>
            </button>

            {/* زر طباعة النظام (USB / واي فاي / المتصفح) */}
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-3 rounded-xl border border-slate-700 text-xs transition-all cursor-pointer"
              title="الطباعة عبر نافذة المتصفح لأي طابعة حرارية معرفة"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>طباعة النظام (حرارية)</span>
            </button>

          </div>

          {/* زر إرسال واتساب */}
          <button
            onClick={handleWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-md shadow-emerald-600/20 transition-all text-xs cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            إرسال السند بالواتساب للمشترك
          </button>

        </div>

      </div>
    </div>
  );
};
