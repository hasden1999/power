import { useState, useMemo, useEffect, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { supabase } from '../services/supabaseClient';
import { syncAllWithCloud } from '../services/syncService';
import { formatIQD } from '../services/billingService';
import { hashPassword } from '../services/authSecurity';
import type { TenantSettings } from '../types';
import {
  Building2,
  DollarSign,
  TrendingUp,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageCircle,
  LogIn,
  Power,
  KeyRound,
  RefreshCw,
  Phone,
  ShieldCheck,
  CalendarCheck
} from 'lucide-react';

interface SuperAdminScreenProps {
  onSwitchToTenant: (tenant: TenantSettings) => void;
  onLogout: () => void;
}

export const SuperAdminScreen: FC<SuperAdminScreenProps> = ({
  onSwitchToTenant,
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'pending' | 'active' | 'expired' | 'blocked'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // رقم واتساب مدير المنصة لتلقي الدفعات
  const [adminPhone, setAdminPhone] = useState(
    localStorage.getItem('platform_admin_phone') || '07764271130'
  );
  const [savedPhoneMsg, setSavedPhoneMsg] = useState(false);

  // جلب كافة المولدات والمشتركين من Dexie
  const tenants = useLiveQuery(() => db.settings.toArray()) || [];
  const allSubscribers = useLiveQuery(() => db.subscribers.toArray()) || [];

  // جلب أحدث المولدات من سحابة Supabase عند فتح الشاشة
  const refreshFromCloud = async () => {
    try {
      setIsRefreshing(true);
      setRefreshMsg(null);
      await syncAllWithCloud();
      setRefreshMsg('تمت مزامنة بيانات المولدات من السحابة بنجاح!');
      setTimeout(() => setRefreshMsg(null), 3000);
    } catch {
      setRefreshMsg('تعذر الاتصال بالسحابة حالياً.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshFromCloud();
  }, []);

  const handleSaveAdminPhone = () => {
    localStorage.setItem('platform_admin_phone', adminPhone.trim());
    setSavedPhoneMsg(true);
    setTimeout(() => setSavedPhoneMsg(false), 2500);
  };

  // إحصائيات المنصة الكلية
  const platformStats = useMemo(() => {
    const totalTenants = tenants.length;
    const pendingTenants = tenants.filter((t) => t.subscriptionStatus === 'pending_activation').length;
    const trialTenants = tenants.filter(
      (t) => !t.isBlocked && (t.subscriptionStatus === 'trial' || t.plan === 'trial') && new Date(t.expiresAt) > new Date()
    ).length;
    const activeTenants = tenants.filter(
      (t) => !t.isBlocked && t.subscriptionStatus === 'active' && new Date(t.expiresAt) > new Date()
    ).length;
    const expiredTenants = tenants.filter(
      (t) => t.subscriptionStatus !== 'pending_activation' && new Date(t.expiresAt) <= new Date()
    ).length;

    // مجموع أرباح اشتراكات الـ SaaS من المولدات
    const totalSaasRevenue = tenants.reduce((sum, t) => sum + (t.planPrice || 0), 0);
    const totalSubscribersAcrossIraq = allSubscribers.length;
    const totalAmperes = allSubscribers.reduce((sum, s) => sum + s.amperes, 0);

    return {
      totalTenants,
      pendingTenants,
      trialTenants,
      activeTenants,
      expiredTenants,
      totalSaasRevenue,
      totalSubscribersAcrossIraq,
      totalAmperes,
    };
  }, [tenants, allSubscribers]);

  // فلترة المولدات
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        t.generatorName.toLowerCase().includes(term) ||
        t.ownerName.toLowerCase().includes(term) ||
        t.phone.includes(term) ||
        t.address.toLowerCase().includes(term);

      const matchesCity = selectedCity === 'all' || t.address.includes(selectedCity);

      const isPending = t.subscriptionStatus === 'pending_activation';
      const isExpired = !isPending && new Date(t.expiresAt) <= new Date();
      const isTrial = !t.isBlocked && !isExpired && (t.subscriptionStatus === 'trial' || t.plan === 'trial');

      let matchesStatus = true;
      if (statusFilter === 'pending') matchesStatus = isPending;
      if (statusFilter === 'trial') matchesStatus = isTrial;
      if (statusFilter === 'active') matchesStatus = !t.isBlocked && !isPending && !isExpired && !isTrial;
      if (statusFilter === 'expired') matchesStatus = isExpired;
      if (statusFilter === 'blocked') matchesStatus = t.isBlocked;

      return matchesSearch && matchesCity && matchesStatus;
    });
  }, [tenants, searchTerm, selectedCity, statusFilter]);

  // تفعيل أو تمديد اشتراك مولدة يدوي في السحابة ومحلياً
  const handleActivateOrExtend = async (tenant: TenantSettings, days: number) => {
    const isYearly = days >= 365;
    const planName = isYearly ? 'yearly' : 'monthly';
    const priceToAdd = isYearly ? 150000 : 15000;

    // احتساب التاريخ الجديد (إذا كان منتهي أو معلق يبدأ من تاريخ اليوم)
    const baseDate =
      tenant.subscriptionStatus === 'active' && new Date(tenant.expiresAt) > new Date()
        ? new Date(tenant.expiresAt)
        : new Date();

    baseDate.setDate(baseDate.getDate() + days);
    const newExpiresAt = baseDate.toISOString();
    const newPrice = (tenant.planPrice || 0) + priceToAdd;

    const updatePayload: Partial<TenantSettings> = {
      expiresAt: newExpiresAt,
      subscriptionStatus: 'active',
      isBlocked: false,
      plan: planName,
      planPrice: newPrice,
    };

    // 1. التحديث في السحابة
    if (navigator.onLine) {
      await supabase
        .from('tenants')
        .update({
          expires_at: newExpiresAt,
          subscription_status: 'active',
          is_blocked: false,
          plan: planName,
          plan_price: newPrice,
        })
        .eq('id', tenant.id);
    }

    // 2. التحديث في قاعدة البيانات المحلية
    await db.settings.update(tenant.id, updatePayload);

    // إرسال تأكيد التفعيل للمشترك بالواتساب
    const shouldSend = confirm(`تم تفعيل اشتراك (${tenant.generatorName}) لمدة ${days} يوماً بنجاح!\nهل ترغب بإرسال رسالة تأكيد التفعيل لصاحب المولدة عبر واتساب؟`);
    if (shouldSend) {
      let phone = tenant.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
      if (phone.startsWith('07')) {
        phone = '964' + phone.substring(1);
      }
      const expStr = new Date(newExpiresAt).toLocaleDateString('ar-IQ');
      const msg = `تحية طيبة أخي العزيز ${tenant.ownerName} صاحب (${tenant.generatorName})،
تم استلام دفعة الاشتراك وتفعيل حسابكم بنجاح في منظومة المولدات الأهلية السحابية!
صلاحية الاشتراك: حتى تاريخ ${expStr} (${isYearly ? 'اشتراك سنوي' : 'اشتراك شهري'}).
يمكنكم الآن الدخول للنظام والجباية وتسجيل المشتركين.
تحياتنا، إدارة منصة المولدات.`;

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  // حظر / إلغاء حظر مولدة في السحابة ومحلياً
  const handleToggleBlock = async (tenant: TenantSettings) => {
    const newBlocked = !tenant.isBlocked;

    if (navigator.onLine) {
      await supabase
        .from('tenants')
        .update({ is_blocked: newBlocked })
        .eq('id', tenant.id);
    }

    await db.settings.update(tenant.id, { isBlocked: newBlocked });
  };

  // مطالبة تجديد اشتراك بالواتساب
  const handleSendRenewalWhatsApp = (tenant: TenantSettings) => {
    let phone = tenant.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
    if (phone.startsWith('07')) {
      phone = '964' + phone.substring(1);
    }

    const expiryDateStr = new Date(tenant.expiresAt).toLocaleDateString('ar-IQ');
    const message = `تحية طيبة أخي العزيز ${tenant.ownerName} صاحب (${tenant.generatorName})،
نود إعلامكم بأن اشتراك منظومة المولدات الأهلية السحابية الخاص بكم ينتهي بتاريخ: ${expiryDateStr}.
يرجى تحويل رسوم التجديد الشهري (15,000 د.ع) أو السنوي (150,000 د.ع - خصم شهرين) على رقم إدارة المنصة: ${adminPhone} لضمان استمرار عمل المنظومة والمزامنة السحابية.
تحياتنا، إدارة منصة المولدات.`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // إعادة تعيين كلمة المرور لصاحب المولدة
  const handleResetPassword = async (tenant: TenantSettings) => {
    const newPass = prompt(`أدخل رمز الدخول (كلمة المرور) الجديد لمولدة (${tenant.generatorName}):`, '123456');
    if (!newPass || !newPass.trim()) return;

    const cleanPass = newPass.trim();
    const hashedPass = await hashPassword(cleanPass);

    if (navigator.onLine) {
      await supabase
        .from('users')
        .update({ password: hashedPass })
        .eq('tenant_id', tenant.id);
    }

    const user = await db.users.where('tenantId').equals(tenant.id).first();
    if (user) {
      await db.users.update(user.id, { password: hashedPass });
    }

    let phone = tenant.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
    if (phone.startsWith('07')) {
      phone = '964' + phone.substring(1);
    }

    const message = `أهلاً بك أخي ${tenant.ownerName} صاحب (${tenant.generatorName})،
تمت إعادة تعيين رمز الدخول الخاص بحسابكم في منظومة المولدات السحابية بنجاح:
🔑 رمز الدخول الجديد: ${newPass.trim()}`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div dir="rtl" className="space-y-5 pb-12 font-sans">
      {/* شريط الإشراف العلوي */}
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 shadow-lg">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">لوحة تحكم صاحب المنصة (Super Admin)</h2>
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                تفعيل وإدارة الاشتراكات يدوي
              </span>
            </div>
            <p className="text-xs text-purple-200/70 mt-0.5">
              إدارة تفعيل اشتراكات أصحاب المولدات في عموم العراق ومتابعة الدفعات النقدية والمحافظ الإلكترونية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshFromCloud}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="تحديث وسحب المولدات الجديدة من سحابة Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث من السحابة'}</span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-rose-400 hover:text-rose-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Power className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {refreshMsg && (
        <div className="p-2.5 bg-purple-950/80 border border-purple-500/40 rounded-2xl text-xs text-purple-200 flex items-center justify-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{refreshMsg}</span>
        </div>
      )}

      {/* بطاقة تخصيص هاتف الإدارة لاستلام الدفعات */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">رقم هاتف الإدارة / محفظة زين كاش لتلقي الدفعات:</h4>
            <p className="text-[11px] text-slate-400">
              هذا الرقم سيظهر لأصحاب المولدات عند مطالبتهم بدفع وتفعيل الاشتراك الشهري أو السنوي
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
            placeholder="0770xxxxxxx"
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500 w-full sm:w-44"
          />
          <button
            onClick={handleSaveAdminPhone}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex-shrink-0"
          >
            {savedPhoneMsg ? '✓ تم الحفظ' : 'حفظ الرقم'}
          </button>
        </div>
      </div>

      {/* المؤشرات المالية والإحصائية للمنصة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* إيرادات الـ SaaS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">أرباح اشتراكات المنصة</span>
            <div className="text-xl font-black text-amber-400 mt-1">
              {formatIQD(platformStats.totalSaasRevenue)}
            </div>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5 font-bold">
              <TrendingUp className="w-3 h-3" /> اشتراكات شهرية وسنوية
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* المولدات المشتركة */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">إجمالي المولدات المسجلة</span>
            <div className="text-xl font-black text-white mt-1">
              {platformStats.totalTenants} <span className="text-xs font-normal text-slate-400">مولدة</span>
            </div>
            <span className="text-[10px] text-emerald-400 mt-0.5 block font-semibold">
              {platformStats.activeTenants} مولدة نشطة ومفعلة
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* بانتظار التفعيل اليدوي */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between bg-amber-500/5">
          <div>
            <span className="text-xs text-amber-400 font-medium">بانتظار التفعيل والدفع</span>
            <div className="text-xl font-black text-amber-400 mt-1">
              {platformStats.pendingTenants} <span className="text-xs font-normal text-slate-400">مولدة</span>
            </div>
            <span className="text-[10px] text-amber-400/80 mt-0.5 block font-semibold">
              سجلت وتحتاج تفعيل يدوي
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* المولدات المنتهية */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">اشتراكات منتهية</span>
            <div className="text-xl font-black text-rose-400 mt-1">
              {platformStats.expiredTenants} <span className="text-xs font-normal text-slate-400">مولدة</span>
            </div>
            <span className="text-[10px] text-rose-400/80 mt-0.5 block font-semibold">
              تتطلب تذكير بالواتساب
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* شريط البحث والفلترة */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم المولدة، اسم صاحب المولدة، الهاتف، أو المنطقة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">كل المحافظات</option>
            <option value="بغداد">بغداد</option>
            <option value="البصرة">البصرة</option>
            <option value="النجف">النجف</option>
            <option value="كربلاء">كربلاء</option>
            <option value="بابل">بابل</option>
            <option value="أربيل">أربيل</option>
            <option value="نينوى">نينوى</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              الكل ({tenants.length})
            </button>
            <button
              onClick={() => setStatusFilter('trial')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'trial' ? 'bg-blue-600 text-white font-bold' : 'text-blue-400 font-bold'
              }`}
            >
              فترة تجريبية ({platformStats.trialTenants})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'pending' ? 'bg-amber-500 text-slate-950 font-black' : 'text-amber-400 font-bold'
              }`}
            >
              بانتظار التفعيل ({platformStats.pendingTenants})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              نشطة ({platformStats.activeTenants})
            </button>
            <button
              onClick={() => setStatusFilter('expired')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'expired' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              منتهية ({platformStats.expiredTenants})
            </button>
            <button
              onClick={() => setStatusFilter('blocked')}
              className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                statusFilter === 'blocked' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400'
              }`}
            >
              محظورة
            </button>
          </div>
        </div>
      </div>

      {/* قائمة المولدات */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center justify-between px-1">
          <span>قائمة المولدات المسجلة ({filteredTenants.length})</span>
          <span className="text-xs text-slate-400 font-normal">
            التفعيل اليدوي ينعكس فورياً في سحابة Supabase وهواتف أصحاب المولدات
          </span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTenants.map((t) => {
            const isPending = t.subscriptionStatus === 'pending_activation';
            const isExpired = !isPending && new Date(t.expiresAt) <= new Date();
            const isTrial = !isPending && !isExpired && (t.subscriptionStatus === 'trial' || t.plan === 'trial');
            const daysLeft = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subCount = allSubscribers.filter((s) => s.tenantId === t.id).length;

            return (
              <div
                key={t.id}
                className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md transition-all ${
                  t.isBlocked
                    ? 'border-rose-700 bg-rose-950/10'
                    : isPending
                    ? 'border-amber-500/60 bg-amber-950/10 shadow-amber-500/5'
                    : isExpired
                    ? 'border-rose-600/50'
                    : isTrial
                    ? 'border-blue-500/50 bg-blue-950/10 shadow-blue-500/5'
                    : 'border-slate-800'
                }`}
              >
                <div>
                  {/* رأس بطاقة المولدة */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-base text-white flex items-center gap-1.5">
                        {t.generatorName}
                        {t.isBlocked && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                            محظور
                          </span>
                        )}
                        {isPending && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                            جديد / بانتظار التفعيل
                          </span>
                        )}
                        {isTrial && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full font-bold">
                            🎁 تجريبي ({daysLeft} يوماً)
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-300 mt-1">👤 المالك: <strong>{t.ownerName}</strong></p>
                      <p className="text-xs text-slate-300 font-mono">📞 {t.phone}</p>
                      <p className="text-xs text-slate-400">📍 {t.address}</p>
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-lg block">
                        {t.plan === 'yearly' ? 'طلب سنوي' : t.plan === 'monthly' ? 'طلب شهري' : 'فترة تجريبية 7 أيام'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        {subCount} مشترك مسجل
                      </span>
                    </div>
                  </div>

                  {/* تفاصيل الصلاحية */}
                  <div className="mt-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
                    <span className="text-slate-400">حالة الاشتراك:</span>
                    {isPending ? (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> بانتظار استلام الدفعة
                      </span>
                    ) : isExpired ? (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {t.plan === 'trial' ? 'انتهت الـ 7 أيام التجريبية' : 'منتهي'} ({Math.abs(daysLeft)} يوم مضت)
                      </span>
                    ) : isTrial ? (
                      <span className="text-blue-400 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> تجربة مجانية (متبقي {daysLeft} يوماً)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> ساري (متبقي {daysLeft} يوماً)
                      </span>
                    )}
                  </div>
                </div>

                {/* أزرار التفعيل اليدوي وإدارة المولدة */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  {/* أزرار التفعيل السريع اليدوي */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => handleActivateOrExtend(t, 30)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2 px-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                      title="تفعيل أو تجديد الاشتراك لمدة شهر (30 يوم) واستلام 15,000 د.ع"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span>تفعيل شهري (+30 يوم)</span>
                    </button>

                    <button
                      onClick={() => handleActivateOrExtend(t, 365)}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-black py-2 px-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-md shadow-purple-600/20 cursor-pointer"
                      title="تفعيل أو تجديد الاشتراك لمدة سنة كاملة (365 يوم) واستلام 150,000 د.ع"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>تفعيل سنوي (+365)</span>
                    </button>
                  </div>

                  {/* خيارات إضافية: معاينة، كلمة سر، واتساب، حظر */}
                  <div className="grid grid-cols-4 gap-1 text-[11px] pt-1">
                    <button
                      onClick={() => onSwitchToTenant(t)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors text-center cursor-pointer"
                      title="الدخول لمعاينة لوحة المولدة كدعم فني"
                    >
                      <LogIn className="w-3 h-3 text-purple-400" />
                      <span>دخول</span>
                    </button>

                    <button
                      onClick={() => handleResetPassword(t)}
                      className="bg-amber-950/60 hover:bg-amber-900 border border-amber-600/30 text-amber-400 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors text-center cursor-pointer"
                      title="إعادة تعيين رمز الدخول وإرساله بالواتساب"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>رمز</span>
                    </button>

                    <button
                      onClick={() => handleSendRenewalWhatsApp(t)}
                      className="bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-600/30 text-emerald-400 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors text-center cursor-pointer"
                      title="إرسال رسالة تذكير أو مطالبة بالواتساب"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>واتساب</span>
                    </button>

                    <button
                      onClick={() => handleToggleBlock(t)}
                      className={`py-1.5 rounded-lg font-semibold border transition-colors text-center cursor-pointer ${
                        t.isBlocked
                          ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                      }`}
                      title={t.isBlocked ? 'فك حظر المولدة' : 'حظر حساب المولدة'}
                    >
                      {t.isBlocked ? 'فك الحظر' : 'حظر'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
