import { useState, useEffect, type FC } from 'react';
import { Download, Smartphone, Database, WifiOff, CheckCircle2, X, Share } from 'lucide-react';
import { syncAllWithCloud } from '../services/syncService';

interface InstallModalProps {
  tenantId?: string;
  generatorName?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export const InstallModal: FC<InstallModalProps> = ({
  tenantId,
  generatorName,
  isOpen: forcedOpen,
  onClose: forcedClose,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // 1. التحقق هل التطبيق مثبت مسبقاً ويعمل في وضع Standalone
    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(checkStandalone);

    // 2. التحقق من أجهزة iOS (آيفون وآيباد)
    const isIosDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIos(isIosDevice);

    // إذا كان التطبيق مثبتاً ويعمل كـ App، لا داعي للنافذة
    if (checkStandalone) return;

    // 3. التقاط حدث التثبيت لمتصفحات Chrome / Edge / Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // إذا لم يكن المستخدم قد أغلق النافذة مسبقاً في هذه الجلسة
      const dismissed = sessionStorage.getItem('pwa_prompt_dismissed');
      if (!dismissed) {
        setIsModalOpen(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // عند اكتمال التثبيت بنجاح
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstallSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
      }, 2500);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // للمستخدمين على أجهزة الهاتف أو لابتوب، فتح النافذة تلقائياً بعد ثانيتين إذا لم يكن مثبتاً
    const timer = setTimeout(() => {
      const dismissed = sessionStorage.getItem('pwa_prompt_dismissed');
      if (!checkStandalone && !dismissed) {
        setIsModalOpen(true);
      }
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleClose = () => {
    sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    setIsModalOpen(false);
    if (forcedClose) forcedClose();
  };

  const handleInstallClick = async () => {
    try {
      setIsInstalling(true);

      // تهيئة ومزامنة قاعدة البيانات المحلية في نفس اللحظة
      await syncAllWithCloud(tenantId);

      if (deferredPrompt) {
        // إظهار نافذة التثبيت الرسمية للمتصفح
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setInstallSuccess(true);
          setTimeout(() => {
            handleClose();
          }, 2000);
        }
        setDeferredPrompt(null);
      } else {
        // إذا كان المتصفح لا يدعم prompt مباشر (مثل لابتوب أو متصفحات معينة)
        setInstallSuccess(true);
        setTimeout(() => {
          handleClose();
        }, 2000);
      }
    } catch (err) {
      console.error('خطأ أثناء التثبيت:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  // التحكم بالفتح من props خارجية إن وجدت
  const open = forcedOpen !== undefined ? forcedOpen : isModalOpen;

  if (isStandalone || !open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        dir="rtl"
        className="relative w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl shadow-amber-500/10 text-slate-100 overflow-hidden"
      >
        {/* خلفية جمالية خفيفة */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* زر الإغلاق */}
        <button
          onClick={handleClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* الأيقونة والعنوان */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-13 h-13 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
            <Smartphone className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white">
              تثبيت نظام المولدة على جهازك ⚡
            </h3>
            <p className="text-xs text-amber-400 font-semibold">
              {generatorName || 'تطبيق الجباية وإدارة المشتركين'}
            </p>
          </div>
        </div>

        {/* بطاقات المميزات */}
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 flex-shrink-0 mt-0.5">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">
                إنشاء قاعدة بيانات محلية داخل جهازك
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                يتم حفظ جميع المشتركين والفواتير على هاتفك أو لابتوبك تلقائياً لسرعة فائقة.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 flex-shrink-0 mt-0.5">
              <WifiOff className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">
                يعمل أوفلاين بدون إنترنت (100%)
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                استمر في تسجيل دفعات المواطنين وطباعة الوصولات حتى لو انقطعت شبكة الإنترنت.
              </p>
            </div>
          </div>
        </div>

        {/* تعليمات خاصة بـ iPhone إن وجد */}
        {isIos && (
          <div className="mb-5 p-3 rounded-2xl bg-sky-950/40 border border-sky-600/30 text-[11px] text-sky-200 flex items-start gap-2.5">
            <Share className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>على أجهزة الآيفون:</strong> اضغط على زر المشاركة{' '}
              <strong>(Share)</strong> في أسفل المتصفح، ثم اختر{' '}
              <strong>"إضافة إلى الصفحة الرئيسية (Add to Home Screen)"</strong>.
            </span>
          </div>
        )}

        {/* حالة النجاح */}
        {installSuccess ? (
          <div className="flex items-center justify-center gap-2 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-5 h-5 animate-bounce" />
            <span>تم تجهيز قاعدة البيانات المحلية وتثبيت التطبيق بنجاح!</span>
          </div>
        ) : (
          /* أزرار الإجراء */
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 py-3 px-4 rounded-2xl text-xs sm:text-sm font-extrabold shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isInstalling ? 'جاري تجهيز النظام...' : 'تثبيت التطبيق وتجهيز البيانات'}
              </span>
            </button>

            <button
              onClick={handleClose}
              className="px-4 py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-2xl text-xs font-bold transition-all cursor-pointer"
            >
              المتابعة بالمتصفح
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
