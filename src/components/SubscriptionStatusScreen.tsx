import { useState, type FC } from 'react';
import { ShieldAlert, Clock, Ban, RefreshCw, LogOut, MessageCircle, CheckCircle2 } from 'lucide-react';
import { syncAllWithCloud } from '../services/syncService';
import type { TenantSettings, UserAccount } from '../types';

interface SubscriptionStatusScreenProps {
  tenant: TenantSettings;
  user: UserAccount;
  onLogout: () => void;
  onRefreshTenant: () => Promise<void>;
  adminPhone?: string;
}

export const SubscriptionStatusScreen: FC<SubscriptionStatusScreenProps> = ({
  tenant,
  user,
  onLogout,
  onRefreshTenant,
  adminPhone = '07764271130',
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');

  const isBlocked = tenant.isBlocked;
  const isPending = tenant.subscriptionStatus === 'pending_activation';
  const isExpired =
    !isBlocked &&
    !isPending &&
    Boolean(tenant.expiresAt && new Date(tenant.expiresAt) <= new Date());
  const isTrial = tenant.plan === 'trial' || tenant.subscriptionStatus === 'trial';

  const handleCheckStatus = async () => {
    try {
      setIsChecking(true);
      setCheckMsg(null);
      await syncAllWithCloud(tenant.id);
      await onRefreshTenant();
      setCheckMsg('تم فحص حالة الحساب من السحابة بنجاح.');
      setTimeout(() => setCheckMsg(null), 3000);
    } catch {
      setCheckMsg('تعذر الاتصال بالسحابة حالياً، تأكد من وجود إنترنت.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleContactWhatsApp = () => {
    let cleanPhone = adminPhone.trim().replace(/\s+/g, '').replace(/-/g, '');
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '964' + cleanPhone.substring(1);
    }

    let reasonText = 'تفعيل اشتراكي الجديد';
    if (isExpired) {
      reasonText = isTrial ? 'الاشتراك بعد انتهاء الفترة التجريبية (7 أيام)' : 'تجديد اشتراكي المنتهي';
    }
    if (isBlocked) reasonText = 'مراجعة سبب إيقاف الحساب';

    const planType = selectedPlan === 'yearly' ? 'السنوي (150,000 د.ع - خصم شهرين)' : 'الشهري (15,000 د.ع)';

    const message = `السلام عليكم ورحمة الله،
أنا الأخ ${tenant.ownerName || user.fullName}، صاحب (${tenant.generatorName}).
رقم الهاتف المسجل: ${tenant.phone || user.username}
المحافظة/المنطقة: ${tenant.address || 'العراق'}
أرغب بـ ${reasonText} للاشتراك ${planType}.
يرجى تزويدي برقم محفظة زين كاش أو كي كارد لإتمام التحويل والتفعيل. شكراً جزيلاً!`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-slate-950"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
        {/* خلفية جمالية */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* الأيقونة بحسب الحالة */}
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl">
          {isBlocked ? (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
              <Ban className="w-9 h-9" />
            </div>
          ) : isPending ? (
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Clock className="w-9 h-9 animate-pulse" />
            </div>
          ) : isTrial ? (
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Clock className="w-9 h-9" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-9 h-9" />
            </div>
          )}
        </div>

        {/* العنوان والوصف */}
        <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
          {isBlocked
            ? 'تم إيقاف هذا الحساب مؤقتاً'
            : isPending
            ? 'حسابكم بانتظار التفعيل اليدوي ⏳'
            : isTrial
            ? 'انتهت الفترة التجريبية المجانية (7 أيام) ⚠️'
            : 'انتهت فترة اشتراك المنظومة ⚠️'}
        </h2>

        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          {isBlocked ? (
            <span>
              تم إيقاف حساب مولدة <strong className="text-amber-400">{tenant.generatorName}</strong> من قبل إدارة المنصة. يرجى التواصل مع إدارة المنصة لرفع الإيقاف.
            </span>
          ) : isPending ? (
            <span>
              أهلاً بك أخي <strong className="text-amber-400">{tenant.ownerName}</strong>! تم تسجيل بيانات مولدة <strong className="text-amber-400">{tenant.generatorName}</strong> بنجاح. يتم تفعيل الحساب يدوياً من قبل صاحب المنصة بعد سداد الاشتراك.
            </span>
          ) : isTrial ? (
            <span>
              أهلاً بك أخي <strong className="text-amber-400">{tenant.ownerName}</strong>! لقد انتهت الفترة التجريبية المجانية (7 أيام) الخاصة بمولدة <strong className="text-amber-400">{tenant.generatorName}</strong>. للاستمرار في استخدام المنظومة والمزامنة السحابية وإصدار السندات، يرجى اختيار الباقة والاشتراك الآن.
            </span>
          ) : (
            <span>
              نود إعلامكم بأن اشتراك مولدة <strong className="text-amber-400">{tenant.generatorName}</strong> قد انتهى. يرجى تجديد الاشتراك لمواصلة عمليات الجباية والمزامنة السحابية وحفظ الوصولات.
            </span>
          )}
        </p>

        {/* بطاقة الأسعار واختيار الباقة */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 text-right">
          <h4 className="text-xs font-bold text-amber-400 mb-2.5 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
            اختر باقة الاشتراك المناسبة:
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div
              onClick={() => setSelectedPlan('monthly')}
              className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                selectedPlan === 'monthly'
                  ? 'bg-amber-500/15 border-amber-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-bold">الاشتراك الشهري</span>
                <input
                  type="radio"
                  name="sub_plan"
                  checked={selectedPlan === 'monthly'}
                  onChange={() => setSelectedPlan('monthly')}
                  className="accent-amber-500"
                />
              </div>
              <strong className="text-white text-sm block mt-1">15,000 د.ع</strong>
              <span className="text-[10px] text-emerald-400 block mt-0.5">صلاحية 30 يوماً</span>
            </div>

            <div
              onClick={() => setSelectedPlan('yearly')}
              className={`p-2.5 rounded-xl border cursor-pointer transition-all relative overflow-hidden ${
                selectedPlan === 'yearly'
                  ? 'bg-amber-500/15 border-amber-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-bold text-amber-400">سنوي (خصم شهرين)</span>
                <input
                  type="radio"
                  name="sub_plan"
                  checked={selectedPlan === 'yearly'}
                  onChange={() => setSelectedPlan('yearly')}
                  className="accent-amber-500"
                />
              </div>
              <strong className="text-white text-sm block mt-1">150,000 د.ع</strong>
              <span className="text-[10px] text-emerald-400 block mt-0.5">توفير 30,000 د.ع</span>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>طرق الدفع المعتمدة:</span>
            <span className="text-slate-300 font-bold">زين كاش • كي كارد • نقداً</span>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="space-y-2.5">
          <button
            onClick={handleContactWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 px-4 rounded-2xl text-sm transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-white" />
            <span>طلب الاشتراك ({selectedPlan === 'yearly' ? 'السنوي 150,000 د.ع' : 'الشهري 15,000 د.ع'}) عبر واتساب</span>
          </button>

          <button
            onClick={handleCheckStatus}
            disabled={isChecking}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-2xl text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isChecking ? 'جاري فحص حالة التفعيل...' : 'فحص هل قام صاحب المنصة بالتفعيل؟'}</span>
          </button>

          {checkMsg && (
            <div className="p-2 bg-slate-950 rounded-xl text-xs text-amber-300 border border-slate-800 animate-fade-in flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{checkMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج والرجوع للرئيسية</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
