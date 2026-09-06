import { useState, type FC } from 'react';
import { db } from '../db/db';
import { supabase } from '../services/supabaseClient';
import { bluetoothPrinter } from '../services/bluetoothPrinter';
import type { TenantSettings } from '../types';
import {
  ShieldCheck,
  CreditCard,
  Building,
  Save,
  CheckCircle2,
  Download,
  Printer,
  Bluetooth,
  Wifi,
  Copy,
  Check,
  AlertCircle,
  MessageCircle,
  Clock,
  Upload,
  Database,
  RefreshCw
} from 'lucide-react';
import { APP_VERSION, forceReloadAndClearCache } from '../services/appUpdater';


interface SaaSScreenProps {
  settings?: TenantSettings;
  onUpdateSettings: (newSettings: TenantSettings) => void;
}

export const SaaSScreen: FC<SaaSScreenProps> = ({ settings, onUpdateSettings }) => {

  const [generatorName, setGeneratorName] = useState(settings?.generatorName || 'مولدة القدس الأهلية');
  const [ownerName, setOwnerName] = useState(settings?.ownerName || 'أبو كرار');
  const [phone, setPhone] = useState(settings?.phone || '07701234567');
  const [address, setAddress] = useState(settings?.address || 'بغداد - المنصور');
  const [autoSendWhatsapp, setAutoSendWhatsapp] = useState(settings?.autoSendWhatsapp ?? true);
  
  const [isSaved, setIsSaved] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');

  // حالة النسخ الاحتياطي والأمان
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // إعدادات الطابعة الحرارية والشبكة
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState<string | null>(null);
  const [testPrintError, setTestPrintError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const localIpUrl = 'https://192.168.0.112:5173/';


  const handleTestBluetoothPrint = async () => {
    try {
      setIsTestPrinting(true);
      setTestPrintError(null);
      setTestPrintStatus('جاري الاتصال بالطابعة الحرارية عبر البلوتوث...');
      await bluetoothPrinter.printTestPage(generatorName);
      setTestPrintStatus('تم إرسال صفحة الفحص التجريبي إلى الطابعة الحرارية بنجاح!');
      setTimeout(() => setTestPrintStatus(null), 3500);
    } catch (err: any) {
      setTestPrintError(err.message || 'تعذر الاتصال بالطابعة عبر البلوتوث.');
    } finally {
      setIsTestPrinting(false);
    }
  };

  const handleCopyIp = () => {
    navigator.clipboard.writeText(localIpUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleSaveInfo = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!settings) return;

    const updated: TenantSettings = {
      ...settings,
      generatorName,
      ownerName,
      phone,
      address,
      autoSendWhatsapp,
    };

    await db.settings.put(updated);
    if (navigator.onLine) {
      await supabase.from('tenants').update({
        generator_name: generatorName,
        owner_name: ownerName,
        phone,
        address,
        auto_send_whatsapp: autoSendWhatsapp,
      }).eq('id', settings.id);
    }
    onUpdateSettings(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  // تصدير نسخة احتياطية شاملة لجميع بيانات المولدة
  const handleExportFullBackup = async () => {
    if (!settings) return;
    try {
      setIsBackingUp(true);
      setBackupError(null);
      const tenantId = settings.id;

      const [tenantSettings, subscribers, cycles, invoices, payments, expenses] = await Promise.all([
        db.settings.get(tenantId),
        db.subscribers.where('tenantId').equals(tenantId).toArray(),
        db.billingCycles.where('tenantId').equals(tenantId).toArray(),
        db.invoices.where('tenantId').equals(tenantId).toArray(),
        db.payments.where('tenantId').equals(tenantId).toArray(),
        db.expenses.where('tenantId').equals(tenantId).toArray(),
      ]);

      const backupData = {
        version: 1,
        appName: 'AlMowallada-SaaS',
        exportDate: new Date().toISOString(),
        tenantId,
        generatorName: settings.generatorName,
        data: {
          settings: tenantSettings,
          subscribers,
          cycles,
          invoices,
          payments,
          expenses,
        },
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `نسخة-احتياطية-${(settings.generatorName || 'مولدة').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupMessage('تم تنزيل النسخة الاحتياطية بنجاح على جهازك!');
      setTimeout(() => setBackupMessage(null), 4000);
    } catch (err: any) {
      console.error('Backup error:', err);
      setBackupError('حدث خطأ أثناء تصدير النسخة الاحتياطية: ' + (err.message || ''));
    } finally {
      setIsBackingUp(false);
    }
  };

  // استعادة نسخة احتياطية من ملف JSON
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupError(null);
    setBackupMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsRestoring(true);
        const text = event.target?.result as string;
        const backup = JSON.parse(text);

        if (!backup.data || !backup.appName) {
          throw new Error('الملف غير صالح أو ليس ملف نسخة احتياطية معتمد للمنظومة.');
        }

        const subCount = backup.data.subscribers?.length || 0;
        const payCount = backup.data.payments?.length || 0;
        const expCount = backup.data.expenses?.length || 0;

        const confirmMsg = `تحتوي هذه النسخة الاحتياطية على:\n` +
          `- ${subCount} مشترك\n` +
          `- ${payCount} سند قبض\n` +
          `- ${expCount} مصروف مسجل\n\n` +
          `هل أنت متأكد من استعادة هذه البيانات؟ سيتم دمج وتحديث السجلات في قاعدة البيانات المحلية.`;

        if (!window.confirm(confirmMsg)) {
          setIsRestoring(false);
          return;
        }

        if (backup.data.settings) {
          await db.settings.put(backup.data.settings);
          onUpdateSettings(backup.data.settings);
        }

        if (backup.data.subscribers) {
          for (const s of backup.data.subscribers) {
            await db.subscribers.put(s);
          }
        }

        if (backup.data.cycles) {
          for (const c of backup.data.cycles) {
            await db.billingCycles.put(c);
          }
        }

        if (backup.data.invoices) {
          for (const inv of backup.data.invoices) {
            await db.invoices.put(inv);
          }
        }

        if (backup.data.payments) {
          for (const p of backup.data.payments) {
            await db.payments.put(p);
          }
        }

        if (backup.data.expenses) {
          for (const exp of backup.data.expenses) {
            await db.expenses.put(exp);
          }
        }

        setBackupMessage(`تمت استعادة النسخة الاحتياطية بنجاح (${subCount} مشترك و ${payCount} سند قبض)!`);
        setTimeout(() => setBackupMessage(null), 5000);
      } catch (err: any) {
        console.error('Restore error:', err);
        setBackupError('تعذر استعادة البيانات: ' + (err.message || 'الملف تالف'));
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const isTrial = settings?.subscriptionStatus === 'trial' || settings?.plan === 'trial';

  // طلب تجديد أو تفعيل الاشتراك عبر واتساب مطور المنصة
  const handleRequestRenewalWhatsApp = () => {
    const devPhone = '9647764271130';
    const planStr = selectedPlan === 'yearly' ? 'السنوي (150,000 د.ع - خصم شهرين)' : 'الشهري (15,000 د.ع)';
    const expiryDateStr = settings?.expiresAt
      ? new Date(settings.expiresAt).toLocaleDateString('ar-IQ')
      : 'غير محدد';
    const statusNote = isTrial
      ? `(فترة تجريبية مجانية 7 أيام - متبقي ${daysRemaining} يوماً)`
      : `(متبقي ${daysRemaining} يوماً)`;
    const subject = isTrial
      ? 'تثبيت وتفعيل اشتراك منظومة المولدات بعد التجربة'
      : 'تجديد اشتراك منظومة المولدات الأهلية';

    const message = `السلام عليكم ورحمة الله،
أود ${subject}:
📌 اسم المولدة: ${generatorName}
👤 اسم صاحب المولدة: ${ownerName}
📞 رقم الهاتف المسجل: ${phone}
📍 المحافظة والمنطقة: ${address}
⏳ تاريخ انتهاء الصلاحية الحالي: ${expiryDateStr} ${statusNote}
⚡ نوع الاشتراك المطلوب: ${planStr}

يرجى تزويدي برقم محفظة زين كاش أو كي كارد لتسديد المبلغ وتفعيل الاشتراك. شكراً جزيلاً!`;

    window.open(`https://wa.me/${devPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // تصدير نسخة احتياطية من قاعدة البيانات أوفلاين
  const handleExportBackup = async () => {
    const subs = await db.subscribers.toArray();
    const invs = await db.invoices.toArray();
    const pays = await db.payments.toArray();
    const data = {
      settings,
      subscribers: subs,
      invoices: invs,
      payments: pays,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_المولدة_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const daysRemaining = settings?.expiresAt
    ? Math.max(0, Math.ceil((new Date(settings.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 30;

  return (
    <div className="space-y-4 pb-12">
      
      {/* رأس شاشة الـ SaaS */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span>إدارة اشتراك نظام الـ SaaS وإعدادات المولدة</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تخصيص بيانات المولدة الظاهرة في الوصولات، وتجديد اشتراك السحابة والمزامنة
          </p>
        </div>

        {isTrial ? (
          <div className="bg-blue-500/15 border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>فترة تجريبية مجانية (7 أيام): متبقي {daysRemaining} يوماً</span>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>الاشتراك ساري: متبقي {daysRemaining} يوماً</span>
          </div>
        )}
      </div>

      {/* تنبيه انتهاء الاشتراك أو التجربة قبل 5 أيام */}
      {daysRemaining <= 5 && (
        <div className="bg-gradient-to-r from-amber-950/80 to-slate-900 border-2 border-amber-500 rounded-2xl p-4 text-amber-300 flex items-start gap-3 shadow-xl animate-pulse">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-black text-sm text-white flex items-center gap-2">
              <span>⚠️ تنبيه مهم جداً: {isTrial ? 'تنتهي الفترة التجريبية' : 'ينتهي اشتراك المنظومة'} بعد {daysRemaining} {daysRemaining === 1 ? 'يوم واحد' : 'أيام'}!</span>
            </h4>
            <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
              تاريخ الانتهاء هو <strong>{settings?.expiresAt ? new Date(settings.expiresAt).toLocaleDateString('ar-IQ') : ''}</strong>. يرجى إرسال طلب الاشتراك للمطور لتفادي إيقاف المنظومة والمزامنة السحابية.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* نموذج بيانات المولدة */}
        <div className="lg:col-span-2 bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg">
          <h3 className="font-bold text-sm text-white mb-4 flex items-center gap-2 border-b border-slate-700/80 pb-2.5">
            <Building className="w-4 h-4 text-amber-400" />
            بيانات وهوية المولدة في السندات
          </h3>

          <form onSubmit={handleSaveInfo} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                اسم المولدة (يظهر أعلى الوصل الحراري ورسالة الواتساب) *
              </label>
              <input
                type="text"
                required
                value={generatorName}
                onChange={(e) => setGeneratorName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم صاحب المولدة / المدير
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  رقم هاتف الشكاوى والاتصال
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                المحافظة والمنطقة
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoWhatsapp"
                checked={autoSendWhatsapp}
                onChange={(e) => setAutoSendWhatsapp(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700"
              />
              <label htmlFor="autoWhatsapp" className="text-xs text-slate-300 font-medium cursor-pointer">
                تفعيل زر إرسال سند القبض عبر الواتساب تلقائياً بعد كل دفعة
              </label>
            </div>

            {isSaved && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم حفظ بيانات المولدة وتحديثها بنجاح</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-5 rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                حفظ الإعدادات
              </button>
            </div>
          </form>
        </div>

        {/* خطط اشتراك الـ SaaS والدفع العراقي */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-sm text-white mb-2 flex items-center gap-2 border-b border-slate-700/80 pb-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              تجديد اشتراك منصة الـ SaaS
            </h3>

            <p className="text-xs text-slate-400 mb-3">
              اختر خطة الاشتراك المناسبة لمولدتك لتفعيل المزامنة السحابية غير المحدودة والنسخ التلقائي
            </p>

            {/* بطاقات اختيار الخطة */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div
                onClick={() => setSelectedPlan('monthly')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedPlan === 'monthly'
                    ? 'bg-amber-500/15 border-amber-500 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400'
                }`}
              >
                <span className="text-xs font-bold block">اشتراك شهري</span>
                <span className="text-sm font-black text-amber-400 block mt-1">15,000 د.ع</span>
                <span className="text-[10px] text-slate-400 block">لكل شهر</span>
              </div>

              <div
                onClick={() => setSelectedPlan('yearly')}
                className={`p-3 rounded-xl border cursor-pointer transition-all relative overflow-hidden ${
                  selectedPlan === 'yearly'
                    ? 'bg-amber-500/15 border-amber-500 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400'
                }`}
              >
                <div className="absolute top-0 left-0 bg-emerald-600 text-[9px] text-white px-2 py-0.5 rounded-br font-bold">
                  خصم شهرين (توفير 30,000 د.ع)
                </div>
                <span className="text-xs font-bold block mt-1">اشتراك سنوي</span>
                <span className="text-sm font-black text-amber-400 block mt-1">150,000 د.ع</span>
                <span className="text-[10px] text-slate-400 block">لسنة كاملة</span>
              </div>
            </div>

            {/* وسائل الدفع المعتمدة وطريقة التفعيل */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-amber-400 block">
                طريقة التفعيل وتجديد الاشتراك:
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                يتم استلام مبالغ الاشتراك وتفعيل المنظومة يدوياً عبر التواصل مع إدارة المنصة (المطور). وسائل التحويل المعتمدة:
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg text-slate-200 font-bold">زين كاش (ZainCash)</span>
                <span className="bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg text-slate-200 font-bold">كي كارد (Qi Card)</span>
                <span className="bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg text-slate-200 font-bold">نقداً</span>
              </div>
            </div>

            {/* زر التواصل مع المطور للتفعيل والتجديد */}
            <button
              onClick={handleRequestRenewalWhatsApp}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black p-3 rounded-xl transition-all text-xs cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>إرسال طلب التجديد عبر واتساب المطور (07764271130)</span>
            </button>
          </div>

          {/* زر النسخ الاحتياطي اليدوي للأمان */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-950 border border-slate-700 text-slate-300 font-bold py-2 px-3 rounded-xl text-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              تنزيل نسخة احتياطية من البيانات (JSON)
            </button>
          </div>
        </div>

      </div>

      {/* قسم إعدادات الطابعة الحرارية وتوصيل الهاتف عبر الشبكة */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        
        {/* بطاقة الطابعة الحرارية */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-400" />
              <span>فحص الطابعة الحرارية المحمولة (ESC/POS)</span>
            </h3>
            <span className="text-[11px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
              58mm / 80mm
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            يدعم النظام الطباعة المباشرة على طابعات البلوتوث الحرارية المحمولة التي يحملها الجباة، أو طابعات الـ USB والشبكة بدون أي برامج وسيطة.
          </p>

          {testPrintStatus && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-2.5 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{testPrintStatus}</span>
            </div>
          )}

          {testPrintError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-2.5 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{testPrintError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleTestBluetoothPrint}
              disabled={isTestPrinting}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-blue-600/20 text-xs transition-all cursor-pointer"
            >
              <Bluetooth className={`w-4 h-4 ${isTestPrinting ? 'animate-bounce' : ''}`} />
              <span>{isTestPrinting ? 'جاري الفحص...' : 'فحص طباعة البلوتوث المباشرة'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-3 rounded-xl border border-slate-600 text-xs transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>فحص طباعة النظام (معاينة)</span>
            </button>
          </div>
        </div>

        {/* بطاقة الاتصال عبر الشبكة المحلية (WiFi) */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span>تشغيل النظام عبر الشبكة وتجربة الطباعة من الهاتف</span>
            </h3>
            <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
              WiFi LAN
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            لتجربة الطباعة الميدانية من هاتفك المحمول المتصل بطابعة البلوتوث، تأكد من اتصال الهاتف بنفس شبكة الواي فاي وافتح الرابط التالي:
          </p>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-mono font-bold text-emerald-400 select-all">
                {localIpUrl}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyIp}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex-shrink-0"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            💡 <strong>ملاحظة هامة:</strong> عند فتح هذا الرابط من متصفح Chrome أو Edge على هاتفك، سيتصل بنظام الجباية مباشرة، ويمكنك اقتران طابعة البلوتوث المحمولة بهاتفك والطباعة فورياً أثناء التجوال.
          </div>
        </div>

        {/* بطاقة الأمان والنسخ الاحتياطي المحلي الشامل */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>النسخ الاحتياطي والأمان المحلي لبيانات المولدة</span>
            </h3>
            <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
              أمان وخصوصية 100%
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            يمكنك حفظ نسخة احتياطية كاملة من بيانات المشتركين، سندات القبض، الفواتير، وسجل المصاريف بملف على هاتفك أو جهازك، واستعادتها في أي وقت لضمان راحة بالك التامة.
          </p>

          {/* تنبيهات النجاح أو الخطأ في النسخ الاحتياطي */}
          {backupMessage && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{backupMessage}</span>
            </div>
          )}

          {backupError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            
            {/* زر تصدير النسخة الاحتياطية */}
            <button
              type="button"
              onClick={handleExportFullBackup}
              disabled={isBackingUp}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-xs sm:text-sm transition-all cursor-pointer"
            >
              <Download className={`w-4 h-4 ${isBackingUp ? 'animate-bounce' : ''}`} />
              <span>{isBackingUp ? 'جاري تجهيز النسخة...' : 'تنزيل نسخة احتياطية شاملة (.json)'}</span>
            </button>

            {/* زر استعادة النسخة الاحتياطية */}
            <label className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white font-bold py-3 px-4 rounded-xl border border-slate-600 text-xs sm:text-sm transition-all cursor-pointer text-center">
              <Upload className={`w-4 h-4 text-blue-400 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>{isRestoring ? 'جاري استعادة البيانات...' : 'استعادة نسخة احتياطية من ملف'}</span>
              <input
                type="file"
                accept=".json, application/json"
                onChange={handleRestoreBackup}
                className="hidden"
                disabled={isRestoring}
              />
            </label>

          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
            🔒 <strong>تلميح أمني:</strong> يُنصح بتنزيل نسخة احتياطية أسبوعياً أو عند نهاية كل دورة جباية شهرية والاحتفاظ بها على هاتفك أو إرسالها لبريدك الإلكتروني الشخصي.
          </div>
        </div>

        {/* بطاقة تحديث النظام وتفريغ الذاكرة المؤقتة (PWA Cache Buster) */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>تحديث المنظومة وتفريغ الذاكرة المؤقتة (الإصدار {APP_VERSION})</span>
            </h3>
            <span className="text-[11px] bg-slate-900 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
              {APP_VERSION}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            إذا قمت بفتح المنظومة ولم تظهر لك أحدث الميزات المضافة، اضغط على الزر أدناه لتفريغ ذاكرة المتصفح وتنزيل أحدث ملفات النظام فوراً.
          </p>

          <button
            type="button"
            onClick={forceReloadAndClearCache}
            className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-amber-400 border border-amber-500/30 font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <span>تحديث المنظومة الآن ومسح الكاش</span>
          </button>
        </div>

      </div>

    </div>
  );
};

